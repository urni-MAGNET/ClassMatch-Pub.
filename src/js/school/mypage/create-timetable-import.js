import { node } from '/src/js/common.js';
import { collectTimetableSettings } from "./create-timetable.js";
import { generateCurrentTournamentJSON } from "./create-tournament-phase2.js";
import { validateTimetableJSON } from "/src/js/classmatch/timetable-validation.js";
import { buildTimetableAxisPages, buildTimetablePages, paginateTimetable, timetablePagesTSV, timetableSportSheets } from "/src/js/classmatch/timetable-table.js";

import { renderAxisPage } from "./timetable-render.js";
import { timetableWorkbookXML } from "/src/js/classmatch/timetable-excel.js";
import { popup } from "/src/js/popup.js";

const input = document.getElementById("timetable-json-input");
const status = document.getElementById("timetable-import-status");
const globalIssues = document.getElementById("timetable-global-issues");
const results = document.getElementById("timetable-validation-results");
const preview = document.getElementById("timetable-preview");
const select = document.getElementById("timetable-proposal-select");
const label = document.getElementById("timetable-proposal-label");
let checked = null;
let pages = [];
let axisPages = [];
let context = null;
let printPages = null;
const tools = document.createElement("div"); tools.className = "timetable-preview-actions"; tools.hidden = true;
const copy = node("button", "表をコピー（スプレッドシート用）"); copy.type = "button";
const print = node("button", "印刷・PDF保存"); print.type = "button";
const printMode = document.createElement("select");
printMode.className = "filter radius";
printMode.setAttribute("aria-label", "印刷レイアウト");
printMode.add(new Option("読みやすく自動分割（最大4コート）", "courts"));
printMode.add(new Option("競技ごとに1ページ", "sports"));
printMode.add(new Option("1日・全競技を1ページ（文字が小さくなります）", "day"));
const printModeLabel = node("label", "印刷レイアウト "); printModeLabel.append(printMode);
const excel = node("button", "Excel保存（XML）"); excel.type = "button";
const dateSelect = document.createElement("select"); dateSelect.className = "filter radius"; dateSelect.setAttribute("aria-label", "表示する開催日");
const dateLabel = node("label", "表示日 "); dateLabel.append(dateSelect);
const metadata = () => ({ title: document.getElementById("conduct-semester").value.trim() || "クラスマッチ", school: document.querySelector(".schoolname")?.textContent?.trim() || (document.querySelector(".header-title")?.textContent?.split("/")[0].trim().replace(/^Mypage$/, "") ?? ""), label: checked?.proposals[Number(select.value)]?.label ?? "" });
excel.addEventListener("click", () => {
  const blob = new Blob([timetableWorkbookXML(axisPages, pages, metadata())], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = "MAGNET-timetable.xml"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
dateSelect.addEventListener("change", () => {
  for (const section of preview.querySelectorAll(".timetable-screen-pages > section")) section.hidden = section.dataset.date !== dateSelect.value;
});
tools.append(dateLabel, printModeLabel, copy, print, excel); preview.before(tools);
copy.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(timetablePagesTSV(pages)); status.textContent = "選択中の案の全日程を表形式でコピーしました。"; }
  catch { status.textContent = "コピーできませんでした。ブラウザのクリップボード権限を確認してください。"; }
});
function renderPrintPages() {
  if (!printPages) return;
  printPages.replaceChildren();
  const sheets = printMode.value === "sports" ? timetableSportSheets(axisPages)
    : printMode.value === "day" ? paginateTimetable(axisPages, { maxCourts: Number.MAX_SAFE_INTEGER, minutesPerPage: 1440, maxHeight: 500 })
      : paginateTimetable(axisPages, { maxCourts: 4, minutesPerPage: 1440, maxHeight: 500 });
  sheets.forEach((page, index) => renderAxisPage(printPages, page, { ...metadata(), print: true, pageNumber: `${index + 1} / ${sheets.length}` }));
}
printMode.addEventListener("change", renderPrintPages);
print.addEventListener("click", () => { renderPrintPages(); window.print(); });

function issues(container, title, entries, type) {
  if (!entries.length) return;
  const details = document.createElement("details");
  details.className = `timetable-issues ${type}`;
  details.open = true;
  details.append(node("summary", `${title} ${entries.length}件`));
  const list = document.createElement("ul");
  for (const entry of entries) list.append(node("li", `${entry.message}${entry.relatedIds.length ? ` [${entry.relatedIds.join(", ")}]` : ""}`));
  details.append(list);
  container.append(details);
}
function render() {
  results.replaceChildren();
  preview.replaceChildren();
  pages = []; axisPages = []; tools.hidden = true;
  const proposal = checked?.proposals[Number(select.value)];
  if (!proposal) return;
  issues(results, "エラー", proposal.errors, "error");
  issues(results, "注意", proposal.warnings, "warning");
  if (checked.errors.length || proposal.errors.length) { results.prepend(node("p", "エラーを修正して再検証してください。")); return; }
  results.prepend(node("p", proposal.warnings.length || checked.warnings.length ? "必須条件の検証を通過しました。注意事項を確認してください。" : "検証を通過しました。"));
  pages = buildTimetablePages(proposal.rows, context.settings, context.structure.sports);
  axisPages = buildTimetableAxisPages(proposal.rows, context.settings, context.structure.sports);
  tools.hidden = false;
  const previousDate = dateSelect.value;
  dateSelect.replaceChildren();
  axisPages.forEach(page => dateSelect.add(new Option(page.date, page.date)));
  if (axisPages.some(page => page.date === previousDate)) dateSelect.value = previousDate;
  const screenPages = node("div"); screenPages.className = "timetable-screen-pages";
  for (const page of axisPages) renderAxisPage(screenPages, page, metadata()).hidden = page.date !== dateSelect.value;
  printPages = node("div"); printPages.className = "timetable-print-pages";
  renderPrintPages();
  preview.append(screenPages, printPages);
  const tableDetails = document.createElement("details"); tableDetails.className = "timetable-table-details";
  tableDetails.append(node("summary", "試合一覧（時刻・ID付き）"));
  for (const page of pages) {
    const section = document.createElement("section"); section.className = "timetable-record-page";
    const table = document.createElement("table");
    table.append(node("caption", `${proposal.label} / ${page.date}`));
    const head = document.createElement("thead"), heading = document.createElement("tr");
    for (const text of page.headers) { const th = node("th", text); th.scope = "col"; heading.append(th); }
    head.append(heading); table.append(head);
    const body = document.createElement("tbody");
    for (const interval of page.intervals) {
      const tr = document.createElement("tr");
      interval.forEach((text, index) => { const cell = node(index ? "td" : "th", text); if (!index) cell.scope = "row"; tr.append(cell); });
      body.append(tr);
    }
    table.append(body); section.append(table); tableDetails.append(section);
  }
  preview.append(tableDetails);
}
export function validateImportedTimetable({ automatic = false } = {}) {
  globalIssues.replaceChildren(); results.replaceChildren(); preview.replaceChildren(); select.replaceChildren(); label.hidden = true; checked = null;
  try {
    context = { structure: generateCurrentTournamentJSON(), settings: collectTimetableSettings() };
    checked = validateTimetableJSON(input.value, context.structure, context.settings);
    issues(globalIssues, "全体のエラー", checked.errors, "error");
    issues(globalIssues, "AIからの注意", checked.warnings, "warning");
    checked.proposals.forEach((proposal, index) => select.add(new Option(`${proposal.label}（エラー${proposal.errors.length}・注意${proposal.warnings.length}）`, String(index))));
    label.hidden = !checked.proposals.length;
    status.textContent = `${checked.proposals.length}案を検証しました。`;
    const errorCount = checked.errors.length + checked.proposals.reduce((sum, proposal) => sum + proposal.errors.length, 0);
    if (!automatic || errorCount) popup(errorCount ? "保存済みタイムテーブルにエラーがあります" : "タイムテーブルを読み込みました", errorCount ? `${errorCount}件のエラーがあります。画面の内容を確認してください。` : `${checked.proposals.length}案を読み込み、検証しました。`, errorCount ? "error" : "success");
    render();
  } catch (error) { status.textContent = `検証できませんでした: ${error.message}`; popup(automatic ? "保存済みタイムテーブルを読み込めませんでした" : "タイムテーブルを読み込めませんでした", error.message, "error"); }
}
document.getElementById("validate-timetable-json").addEventListener("click", validateImportedTimetable);
document.getElementById("timetable-json-file")?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    input.value = await file.text();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    validateImportedTimetable();
  } catch (error) {
    status.textContent = `ファイルを読み込めませんでした: ${error.message}`;
    popup("JSONファイルを読み込めませんでした", error.message, "error");
  } finally {
    event.target.value = "";
  }
});
select.addEventListener("change", render);
document.getElementById("conduct-semester").addEventListener("input", () => { if (checked) render(); });
function stale() {
  if (!checked) return;
  checked = null; pages = []; axisPages = []; printPages = null; tools.hidden = true; preview.replaceChildren(); results.replaceChildren(); globalIssues.replaceChildren(); label.hidden = true;
  status.textContent = "入力・大会データ・設定が変更されました。再検証してください。";
}
input.addEventListener("input", stale);
for (const id of ["sports-root", "class-master-list", "create-timetable"]) {
  document.getElementById(id).addEventListener("input", stale);
  document.getElementById(id).addEventListener("change", stale);
  document.getElementById(id).addEventListener("click", event => { if (event.target.closest("button") && !event.target.closest("#generate-timetable-prompt, #copy-timetable-prompt")) stale(); });
}
new MutationObserver(stale).observe(document.getElementById("sports-root"), { childList: true });

window.addEventListener("classmatch:setup-loaded", () => {
  if (window.classMatchSkippedTimetableAutoLoad || !input.value.trim()) return;
  // restoreTournamentInput / restoreTimetableSettings finish synchronously before
  // setup-loaded, so DB and file imports share exactly the same validator path.
  window.classMatchPendingTimetableAutoLoad = false;
  validateImportedTimetable({ automatic: true });
});

if (window.classMatchPendingTimetableAutoLoad && input.value.trim()) {
  window.classMatchPendingTimetableAutoLoad = false;
  validateImportedTimetable({ automatic: true });
}
