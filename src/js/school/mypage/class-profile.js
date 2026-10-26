import { escapeHtml } from "/src/js/common.js";
import { popup } from "/src/js/popup.js";
import {
  DEFAULT_CLASS_PROFILE,
  cloneClassJson,
  downloadJson,
  readJsonFile,
  validateClassProfile
} from "/src/js/classmatch/classes.js";

const STORAGE_KEY = "classmatch-class-profile";
const nameInput = document.getElementById("class-profile-name");
const versionInput = document.getElementById("class-profile-version");
const classesRoot = document.getElementById("class-profile-classes");
const jsonTextarea = document.getElementById("class-profile-json");
let profile = cloneClassJson(DEFAULT_CLASS_PROFILE);


function classRow(row = {}) {
  const element = document.createElement("div");
  element.className = "class-profile-row compact-row";
  element.innerHTML = `
    <label>学級コード<input class="filter" data-field="class-code" value="${escapeHtml(row.classCode)}" placeholder="1A"></label>
    <label>学級名<input class="filter" data-field="class-name" value="${escapeHtml(row.className)}" placeholder="1年A組"></label>
    <button class="filter filterhover remove-class-profile-row" type="button">削除</button>`;
  return element;
}

function render() {
  nameInput.value = profile.profileName;
  versionInput.value = profile.profileVersion;
  classesRoot.innerHTML = "";
  profile.classes.forEach(row => classesRoot.appendChild(classRow(row)));
  jsonTextarea.value = JSON.stringify(profile, null, 2);
}

export function collect() {
  return validateClassProfile({
    profileName: nameInput.value,
    profileVersion: versionInput.value,
    classes: [...classesRoot.querySelectorAll(".class-profile-row")].map(row => ({
      classCode: row.querySelector('[data-field="class-code"]').value,
      className: row.querySelector('[data-field="class-name"]').value
    }))
  });
}

if (new URLSearchParams(location.search).get("embedded") === "1") window.classMatchCollectTemplate = collect;

function saveLocal(message = true) {
  profile = collect();
  const json = JSON.stringify(profile, null, 2);
  localStorage.setItem(STORAGE_KEY, json);
  jsonTextarea.value = json;
  if (message) popup("お知らせ", "学級テンプレートをブラウザに保存しました。", "success");
}

document.getElementById("class-profile-add-class").addEventListener("click", () => {
  classesRoot.appendChild(classRow());
});

classesRoot.addEventListener("click", event => {
  if (event.target.classList.contains("remove-class-profile-row")) {
    event.target.closest(".class-profile-row")?.remove();
  }
});

document.getElementById("class-profile-import").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    profile = validateClassProfile(await readJsonFile(file));
    render();
    saveLocal(false);
    popup("お知らせ", "学級テンプレートJSONを読み込みました。", "success");
  } catch (error) {
    popup("エラーが発生しました。", error.message.replaceAll("\n", "<br>"), "error");
  } finally {
    event.target.value = "";
  }
});

document.getElementById("class-profile-apply-json").addEventListener("click", () => {
  try {
    profile = validateClassProfile(JSON.parse(jsonTextarea.value));
    render();
    saveLocal(false);
    popup("お知らせ", "JSONを編集画面に反映しました。", "success");
  } catch (error) {
    popup("エラーが発生しました。", error.message.replaceAll("\n", "<br>"), "error");
  }
});

document.getElementById("class-profile-format").addEventListener("click", () => {
  try { saveLocal(); } catch (error) { popup("お知らせ", error.message.replaceAll("\n", "<br>"), "error"); }
});

document.getElementById("class-profile-download").addEventListener("click", () => {
  try {
    profile = collect();
    saveLocal(false);
    downloadJson(`${profile.profileName}-v${profile.profileVersion}.json`, profile);
    popup("お知らせ", "学級テンプレートJSONを保存しました。", "success");
  } catch (error) {
    popup("エラーが発生しました。", error.message.replaceAll("\n", "<br>"), "error");
  }
});

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) profile = validateClassProfile(JSON.parse(saved));
} catch (error) {
  console.warn("Saved class profile could not be loaded", error);
}
render();
window.classMatchLoadTemplate = value => { profile = validateClassProfile(value); render(); };
