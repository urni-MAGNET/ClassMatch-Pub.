import { applyProfile, applyClassProfile, collectClasses, restoreClasses, restoreTournamentInput } from "./create.js";
import { collectTournamentInput } from "./create-structure-data.js";
import { collectTimetableSettings, restoreTimetableSettings } from "./create-timetable.js";
import { appendBranch } from "./script.js";
import { popup } from "/src/js/popup.js";

const prefix = `classmatch-create-draft-v1:${sessionStorage.getItem("schoolid") || "local"}:`;
const name = document.getElementById("conduct-semester");
const select = document.getElementById("create-draft-select");
const status = document.getElementById("create-draft-status");
const sections = ["create-sport-template", "create-class-template", "create-classes", "create-tournament", "create-branches", "create-timetable", "create-timetable-import"];
const key = () => {
  if (!name.value.trim()) throw new Error("実施年度・学期を入力してください。");
  return prefix + encodeURIComponent(name.value.trim());
};
const readers = {
  "create-sport-template": () => window.classMatchImportedProfile ?? null,
  "create-class-template": () => ({ profile: window.classMatchImportedClassProfile ?? null, classes: collectClasses() }),
  "create-classes": collectClasses,
  "create-tournament": () => {
    const input = collectTournamentInput();
    document.querySelectorAll(".conduct-sport-wrap").forEach((card, sportIndex) => {
      card.querySelectorAll(".league-wrap").forEach((league, leagueIndex) => {
        league.querySelectorAll(".team-wrap").forEach((team, teamIndex) => { input.sports[sportIndex].leagues[leagueIndex].teams[teamIndex].teamName = team.querySelector(".league-teams").value; });
      });
    });
    return { input, classes: collectClasses(), lineLengths: [...document.querySelectorAll(".tournament-line-length")].map(input => input.value) };
  },
  "create-branches": () => [...document.querySelectorAll("#sport-branch span")].map(span => span.textContent),
  "create-timetable": () => ({ settings: collectTimetableSettings(), instructions: document.getElementById("timetable-instructions").value }),
  "create-timetable-import": () => document.getElementById("timetable-json-input").value
};
async function restore(id, data) {
  if (id === "create-sport-template") { if (data) applyProfile(data); }
  if (id === "create-class-template") { if (data.profile) applyClassProfile(data.profile); restoreClasses(data.classes); }
  if (id === "create-classes") restoreClasses(data);
  if (id === "create-tournament" && data.input.profile) {
    restoreClasses(data.classes);
    await restoreTournamentInput(data.input);
    document.querySelectorAll(".tournament-line-length").forEach((input, index) => { input.value = data.lineLengths[index] || "120"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  if (id === "create-branches") { document.getElementById("sport-branch").replaceChildren(); data.forEach(appendBranch); }
  if (id === "create-timetable") restoreTimetableSettings(data.settings, data.instructions);
  if (id === "create-timetable-import") {
    const input = document.getElementById("timetable-json-input"); input.value = data; input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
function refreshList() {
  const selected = select.value;
  select.replaceChildren(new Option("選択してください", ""));
  for (const storageKey of Object.keys(localStorage).filter(value => value.startsWith(prefix)).sort()) {
    try { const draft = JSON.parse(localStorage.getItem(storageKey)); if (draft.version === 1) select.add(new Option(draft.name, storageKey)); } catch { /* Ignore unrelated or damaged entries in the picker. */ }
  }
  select.value = selected;
}
function save(ids) {
  try {
    const storageKey = key();
    const draft = JSON.parse(localStorage.getItem(storageKey) || "null") ?? { version: 1, name: name.value.trim(), sections: {} };
    for (const id of ids) draft.sections[id] = { savedAt: new Date().toISOString(), data: readers[id]() };
    localStorage.setItem(storageKey, JSON.stringify(draft));
    refreshList(); select.value = storageKey;
    status.textContent = `${draft.name}: ${ids.length}セクションをブラウザに一時保存しました。`;
    if (ids.length === 1) document.getElementById(ids[0]).querySelector(".section-draft-status").textContent = status.textContent;
    popup("一時保存しました", ids.length === 1 ? "このセクションをブラウザに保存しました。" : `${ids.length}セクションをブラウザに保存しました。`, "success");
  } catch (error) {
    status.textContent = `保存できませんでした: ${error.message}`;
    popup("一時保存できませんでした", error.message, "error");
  }
}
async function load(ids, storageKey = null) {
  try {
    const draft = JSON.parse(localStorage.getItem(storageKey || key()) || "null");
    if (!draft || draft.version !== 1) throw new Error("保存済みデータがありません。");
    let count = 0;
    for (const id of ids) if (draft.sections[id]) { await restore(id, draft.sections[id].data); count++; }
    if (!count) throw new Error("このセクションの保存済みデータがありません。");
    name.value = draft.name;
    status.textContent = `${draft.name}: ${count}セクションを読み込みました。`;
    if (ids.length === 1) document.getElementById(ids[0]).querySelector(".section-draft-status").textContent = status.textContent;
    popup("読み込みました", count === 1 ? "このセクションの一時保存データを反映しました。" : `${count}セクションの一時保存データを反映しました。`, "success");
  } catch (error) {
    status.textContent = `読み込めませんでした: ${error.message}`;
    popup("読み込めませんでした", error.message, "error");
  }
}
for (const id of sections) {
  const toolbar = document.createElement("div"); toolbar.className = "section-draft-toolbar";
  for (const [text, className, action] of [["一時保存", "section-draft-save", () => save([id])], ["読み込み", "section-draft-load", () => load([id])]]) {
    const button = document.createElement("button"); button.type = "button"; button.className = `${className} filter filterhover radius`; button.textContent = text; button.addEventListener("click", action); toolbar.append(button);
  }
  document.getElementById(id).prepend(toolbar);
  const message = document.createElement("p"); message.className = "section-draft-status"; message.setAttribute("role", "status"); toolbar.append(message);
}
document.getElementById("save-create-draft").addEventListener("click", () => save(sections));
document.getElementById("load-create-draft").addEventListener("click", () => load(sections, select.value || null));
select.addEventListener("change", () => { if (select.value) { try { name.value = JSON.parse(localStorage.getItem(select.value)).name; } catch { status.textContent = "保存済みデータを読み込めません。"; } } });
refreshList();
