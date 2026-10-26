import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import postcss from 'postcss';
const walk = async dir => (await Promise.all((await fs.readdir(dir, { withFileTypes: true })).map(async entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
const wrappers = ['vite.config.js','style.css','mypage/style.css','login/style.css','system/style.css','system/core/style.css','system/manage/style.css','system/result/style.css'];
const files = [...(await walk('src')).filter(file => /\.(js|css)$/.test(file)), ...(await Promise.all(wrappers.map(async file => { try { await fs.access(file); return file; } catch { return null; } }))).filter(Boolean)].sort();
const rows = [], errors = [];
for (const file of files) {
  const source = await fs.readFile(file, 'utf8');
  try {
    if (file.endsWith('.js')) new vm.SourceTextModule(source, { identifier: file });
    else postcss.parse(source, { from: file });
  } catch (error) { errors.push(`${file}: ${error.message}`); }
  const imports = [...source.matchAll(/(?:from\s*|import\s*|import\s*\(|@import\s*)['"]([^'"]+)['"]/g)].map(match => match[1]);
  for (const imported of imports) {
    if (!imported.startsWith('/') && !imported.startsWith('.')) continue;
    const target = imported.startsWith('/') ? path.resolve('.' + imported) : path.resolve(path.dirname(file), imported);
    try { await fs.access(target); } catch { errors.push(`${file}: missing import ${imported}`); }
  }
  rows.push({ file: file.replaceAll('\\', '/'), lines: source.split('\n').length, imports: imports.length });
}
const text = `# JS・CSS構造監査\n\n対象: src 以下およびルート・画面のエントリーファイルを含む全 ${rows.filter(row=>row.file.endsWith('.js')).length} JS、${rows.filter(row=>row.file.endsWith('.css')).length} CSS。構文とローカルimportを検査し、各モジュールの責務と共通化候補を確認。外部サービス・本番権限の監査は別途必要。\n\n## 共通化・分割\n\n- common.js: HTMLエスケープ、DOM生成、CSV・ダウンロード、文字列・数値正規化、ソート、JSONコピー、支部ルーティング・セッション解除、ボタン状態。\n- edit-forms.js: 学校の既存行・追加フォーム表示。edit.jsは取得・保存・画面イベント。\n- score-profile-view.js: テンプレートの競技カード表示。formula-editor.jsは式編集。\n- core/score-view.js: 支部の総合得点表示。local-scores.jsとclass-totals.jsは学校・支部共通の計算。\n- scheduled-matches.js: 予定試合変換。document-diagrams.js: 配布資料のSVG。tournament-seeds.js: シード選択。\n- CSS: ほぼ同一だったlogin/account.cssとmypage/mypage.cssをpage-shell、profile-editor、results-editor、page-responsiveへ共通化。式エディタ・タイムテーブルは独立。import順序で従来のカスケードを維持。\n- 同じ名前でも画面状態・エラー処理が異なるload/render/getSessionAndSchool等は、無理に共通化せず各責務に残す。\n\n## 検査結果\n\n${errors.length ? errors.join('\n') : '構文エラー・解決できないローカルimport: 0件'}\n\n再実行: \`node --experimental-vm-modules scripts/audit-source.mjs\`\n\n|ファイル|行数|import数|\n|---|---:|---:|\n${rows.map(row=>`|${row.file}|${row.lines}|${row.imports}|`).join('\n')}\n`;
await fs.writeFile('docs/source-audit.md', text);
console.log(`Audited ${rows.length} JS/CSS files; ${errors.length} syntax/import errors.`);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
