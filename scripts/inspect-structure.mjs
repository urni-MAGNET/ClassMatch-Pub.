import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseAst } from "rolldown/parseAst";
import { parse as parseHTML } from "parse5";
import postcss from "postcss";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const excluded = new Set([".git", "node_modules", "dist", ".codex", ".agents", ".aws", ".test-artifacts"]);
const textExtensions = new Set([".js", ".mjs", ".html", ".css", ".md", ".json", ".jsonc"]);
const generated = new Set(["docs/source-map.json", "docs/source-map.md", "docs/source-map.mmd"]);
const files = [];
const sources = new Map();
const edges = [];
const problems = [];
const pageEntries = [];

async function inventory(directory) {
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink() || excluded.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) { await inventory(absolute); continue; }
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (generated.has(relative) || entry.name.startsWith(".env")) continue;
    const ext = path.extname(relative);
    const stat = await fs.stat(absolute);
    const kind = [".js", ".mjs"].includes(ext) ? "javascript" : ext === ".html" ? "page" : ext === ".css" ? "stylesheet" : textExtensions.has(ext) ? "document/config" : "asset";
    const file = { path: relative, kind, bytes: stat.size, imports: [], exports: [], functions: [], events: [], selectors: [], storage: [], tables: [] };
    if (textExtensions.has(ext) && entry.name !== "package-lock.json") {
      const text = await fs.readFile(absolute, "utf8");
      sources.set(relative, text);
      file.lines = text.split(/\r?\n/).length;
      file.digest = createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
    }
    files.push(file);
  }
}

await inventory(root);
const byPath = new Map(files.map(file => [file.path, file]));
const literal = node => node?.type === "Literal" && typeof node.value === "string" ? node.value : null;
const lineAt = (text, index = 0) => text.slice(0, index).split("\n").length;

function reference(file, specifier, kind, line) {
  const external = /^(?:[a-z]+:|\/\/)/i.test(specifier) || (kind === "import" && !specifier.startsWith(".") && !specifier.startsWith("/"));
  let target = specifier;
  if (!external) {
    const raw = specifier.split(/[?#]/)[0];
    target = path.posix.normalize(raw.startsWith("/") ? raw.slice(1) : path.posix.join(path.posix.dirname(file.path), raw));
    target = [target, `${target}.js`, `${target}/index.js`, `${target}/index.html`].find(candidate => byPath.has(candidate)) ?? target;
  }
  const edge = { from: file.path, to: target, kind, line, external, missing: !external && !byPath.has(target) };
  if (!edges.some(item => item.from === edge.from && item.to === edge.to && item.kind === edge.kind)) edges.push(edge);
  if (edge.missing) problems.push({ type: "missing-reference", file: file.path, line, target });
  if (kind === "import") file.imports.push(target);
}

function visit(node, action) {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") action(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => { if (child && typeof child === "object") visit(child, action); });
    else if (value && typeof value === "object") visit(value, action);
  }
}

function javascript(file, text, firstLine = 1) {
  let ast;
  try { ast = parseAst(text, { lang: "js" }, file.path); }
  catch (error) { problems.push({ type: "syntax-error", file: file.path, line: firstLine, message: error.message.split("\n")[0] }); return; }
  visit(ast, node => {
    const line = firstLine + lineAt(text, node.start) - 1;
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) && literal(node.source)) reference(file, literal(node.source), "import", line);
    if (node.type === "ImportExpression" && literal(node.source)) reference(file, literal(node.source), "import", line);
    if (node.type === "FunctionDeclaration" && node.id) file.functions.push({ name: node.id.name, line });
    if (node.type === "VariableDeclarator" && ["ArrowFunctionExpression", "FunctionExpression"].includes(node.init?.type) && node.id.type === "Identifier") file.functions.push({ name: node.id.name, line });
    if (node.type === "VariableDeclarator" && node.id?.name === "pageEntries" && file.path === "vite.config.js") {
      pageEntries.push(...(node.init?.elements ?? []).map(literal).filter(Boolean));
    }
    if (node.type === "ExportNamedDeclaration") {
      if (node.declaration?.id) file.exports.push(node.declaration.id.name);
      for (const declaration of node.declaration?.declarations ?? []) if (declaration.id?.name) file.exports.push(declaration.id.name);
      for (const specifier of node.specifiers ?? []) file.exports.push(specifier.exported?.name ?? literal(specifier.exported));
    }
    if (node.type === "ExportDefaultDeclaration") file.exports.push("default");
    if (node.type === "NewExpression" && node.callee?.name === "CustomEvent" && literal(node.arguments[0])) file.events.push({ name: literal(node.arguments[0]), direction: "emit", line });
    if (node.type !== "CallExpression" || node.callee?.type !== "MemberExpression") return;
    const method = node.callee.property?.name;
    const argument = literal(node.arguments[0]);
    if (!argument) return;
    if (method === "addEventListener") file.events.push({ name: argument, direction: "listen", line });
    if (["querySelector", "querySelectorAll", "getElementById", "closest", "matches"].includes(method)) file.selectors.push({ selector: method === "getElementById" ? `#${argument}` : argument, line });
    if (["getItem", "setItem", "removeItem"].includes(method) && ["localStorage", "sessionStorage"].includes(node.callee.object?.name)) file.storage.push({ store: node.callee.object.name, key: argument, operation: method, line });
    if (method === "from" && node.callee.object?.name === "supabase") file.tables.push({ name: argument, line });
  });
}

for (const file of files) {
  const text = sources.get(file.path);
  if (!text) continue;
  if (file.kind === "javascript") javascript(file, text);
  if (file.kind === "page") {
    const html = parseHTML(text, { sourceCodeLocationInfo: true });
    const walk = node => {
      const attrs = Object.fromEntries((node.attrs ?? []).map(attr => [attr.name, attr.value]));
      const line = node.sourceCodeLocation?.startLine ?? 1;
      if (node.tagName === "script") {
        if (attrs.src) reference(file, attrs.src, "script", line);
        else if (!attrs.type || ["module", "text/javascript", "application/javascript"].includes(attrs.type)) {
          const code = (node.childNodes ?? []).map(child => child.value ?? "").join("");
          javascript(file, code, lineAt(text, node.sourceCodeLocation?.startTag?.endOffset ?? 0));
        }
      }
      if (node.tagName === "link" && attrs.rel?.split(/\s+/).includes("stylesheet") && attrs.href) reference(file, attrs.href, "stylesheet", line);
      for (const child of node.childNodes ?? []) walk(child);
      if (node.content) walk(node.content);
    };
    walk(html);
  }
  if (file.kind === "stylesheet") {
    try {
      const css = postcss.parse(text, { from: file.path });
      css.walkAtRules("import", node => {
        const specifier = node.params.match(/^(?:url\(\s*)?["']([^"']+)["']/)?.[1];
        if (specifier) reference(file, specifier, "stylesheet", node.source.start.line);
      });
      css.walkDecls(node => {
        for (const match of node.value.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
          if (!match[1].startsWith("data:")) reference(file, match[1], "asset", node.source.start.line);
        }
      });
    } catch (error) { problems.push({ type: "syntax-error", file: file.path, message: error.reason }); }
  }
  file.imports = [...new Set(file.imports)];
  file.exports = [...new Set(file.exports.filter(Boolean))];
  file.selectors = file.selectors.filter((item, index, all) => all.findIndex(other => other.selector === item.selector) === index);
}

const localEdges = edges.filter(edge => !edge.external && !edge.missing);
function reachable(start) {
  const found = new Set();
  const queue = [...start];
  while (queue.length) {
    const current = queue.pop();
    if (found.has(current)) continue;
    found.add(current);
    queue.push(...localEdges.filter(edge => edge.from === current).map(edge => edge.to));
  }
  return found;
}
const active = reachable(pageEntries);
const inactive = files.filter(file => ["javascript", "page", "stylesheet"].includes(file.kind) && !active.has(file.path) && !file.path.startsWith("tests/") && !file.path.startsWith("scripts/") && file.path !== "vite.config.js").map(file => file.path);
const duplicates = [...new Set(files.map(file => file.digest).filter(Boolean))].map(digest => files.filter(file => file.digest === digest).map(file => file.path)).filter(group => group.length > 1);
const cycles = [];
function cycleWalk(current, chain, visited) {
  if (chain.includes(current)) {
    const cycle = [...chain.slice(chain.indexOf(current)), current];
    const key = [...new Set(cycle)].sort().join("|");
    if (!cycles.some(item => item.key === key)) cycles.push({ key, paths: cycle });
    return;
  }
  if (visited.has(current)) return;
  visited.add(current);
  for (const edge of localEdges.filter(edge => edge.from === current && edge.kind === "import")) cycleWalk(edge.to, [...chain, current], visited);
}
files.filter(file => file.kind === "javascript").forEach(file => cycleWalk(file.path, [], new Set()));

const data = { pageEntries, files: files.map(({ digest, ...file }) => file), edges, inactive, duplicates, cycles: cycles.map(item => item.paths), problems };
const graphFiles = files.filter(file => ["javascript", "page"].includes(file.kind));
const nodeIds = new Map(graphFiles.map((file, index) => [file.path, `n${index}`]));
const mermaid = selection => {
  const nodes = graphFiles.filter(file => selection.has(file.path));
  const lines = ["flowchart LR"];
  nodes.forEach(file => lines.push(`  ${nodeIds.get(file.path)}["${file.path}"]`));
  localEdges.filter(edge => ["import", "script"].includes(edge.kind) && selection.has(edge.from) && selection.has(edge.to) && nodeIds.has(edge.from) && nodeIds.has(edge.to)).forEach(edge => lines.push(`  ${nodeIds.get(edge.from)} --> ${nodeIds.get(edge.to)}`));
  return lines.join("\n");
};
const cell = text => String(text ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const link = file => `[${file}](../${file})`;
const jsFiles = files.filter(file => file.kind === "javascript");
const cssFiles = files.filter(file => file.kind === "stylesheet");
const md = [
  "# ClassMatch ソース構造", "", "このファイルは `npm run inspect:structure` で全ファイル一覧と依存関係から生成します。",
  "JSはAST、HTMLはHTMLパーサー、CSSはCSSパーサーで点検しています。画像・音声はファイル一覧に含めます。",
  "`node_modules`、`dist`、Git内部、環境変数ファイルは対象外です。静的な依存関係の点検であり、全画面の実行・DB権限・コード品質を保証するレビューではありません。",
  "", `対象: ${files.length}ファイル / JS ${jsFiles.length} / HTML ${files.filter(file => file.kind === "page").length} / CSS ${cssFiles.length} / ビルド入口 ${pageEntries.length}。`,
  "", "## 追い方", "", "1. 変更したい画面のHTMLから、読み込まれるJSを確認します。",
  "2. JSのimportをたどり、画面のDOM操作・計算処理・DB通信を分けて読みます。",
  "3. importに現れない連携はJSONの `events`、`selectors`、`storage`、`tables` で確認します。",
  "4. Figmaには画面単位の3〜5箱だけを置き、詳細はこの自動生成資料にリンクします。", "",
  "## 画面の入口", "", "| HTML | 直接読み込むJS | 関連JS数 |", "| --- | --- | ---: |",
  ...pageEntries.map(page => `| ${link(page)} | ${localEdges.filter(edge => edge.from === page && byPath.get(edge.to)?.kind === "javascript").map(edge => link(edge.to)).join("<br>")} | ${[...reachable([page])].filter(file => byPath.get(file)?.kind === "javascript").length} |`),
  "", "## 作成画面の依存図", "", "矢印は読み込み方向です。イベント発火や処理順を表す図ではありません。", "", "```mermaid", mermaid(reachable(["mypage/create/index.html"])), "```",
  "", "## JS一覧", "", "| ファイル | 行数 | export | DBテーブル | イベント |", "| --- | ---: | --- | --- | --- |",
  ...jsFiles.map(file => `| ${link(file.path)} | ${file.lines} | ${cell(file.exports.join(", "))} | ${cell([...new Set(file.tables.map(item => item.name))].join(", "))} | ${cell([...new Set(file.events.map(item => `${item.direction}: ${item.name}`))].join(", "))} |`),
  "", "## CSS一覧", "", "| ファイル | 行数 | 読み込み元 |", "| --- | ---: | --- |",
  ...cssFiles.map(file => `| ${link(file.path)} | ${file.lines} | ${localEdges.filter(edge => edge.to === file.path).map(edge => link(edge.from)).join("<br>")} |`),
  "", "## 点検結果", "", `構文エラー ${problems.filter(item => item.type === "syntax-error").length} / ローカル参照先なし ${problems.filter(item => item.type === "missing-reference").length} / JS循環依存 ${cycles.length}。`,
  "", ...problems.map(problem => `- ${link(problem.file)}:${problem.line ?? ""}: ${cell(problem.type)} ${cell(problem.target ?? problem.message)}`),
  "", "### 同じ内容のファイル", "", ...duplicates.map(group => `- ${group.map(link).join(" / ")}`),
  "", "### ビルド入口からたどれないファイル", "", "未使用の確定ではありません。試作・独立ページ・URLによる読み込みはこの一覧に入ることがあります。削除候補を確認するための一覧です。", "", ...inactive.map(file => `- ${link(file)}`),
  "", "## 全ファイル", "", "画像・音声を含む一覧です。", "", "| ファイル | 分類 | バイト数 |", "| --- | --- | ---: |",
  ...files.map(file => `| ${link(file.path)} | ${file.kind} | ${file.bytes} |`), ""
].join("\n");

await fs.mkdir(path.join(root, "docs"), { recursive: true });
await fs.writeFile(path.join(root, "docs/source-map.json"), JSON.stringify(data, null, 2) + "\n");
await fs.writeFile(path.join(root, "docs/source-map.md"), md);
await fs.writeFile(path.join(root, "docs/source-map.mmd"), mermaid(new Set(graphFiles.map(file => file.path))) + "\n");
console.log(`Inspected ${files.length} files: ${jsFiles.length} JS, ${pageEntries.length} build entries, ${edges.length} references.`);
console.log(`Syntax errors: ${problems.filter(item => item.type === "syntax-error").length}; missing references: ${problems.filter(item => item.type === "missing-reference").length}; import cycles: ${cycles.length}.`);
console.log("Generated docs/source-map.md, docs/source-map.json, docs/source-map.mmd");
if (problems.some(item => item.type === "syntax-error")) process.exitCode = 1;
