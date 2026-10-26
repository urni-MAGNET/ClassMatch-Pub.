import { sportCard, courtRow } from './score-profile-view.js';
import { escapeHtml } from "/src/js/common.js";
import { openFormulaEditor } from "./formula-editor.js";
import { popup } from "/src/js/popup.js";
import {
  DEFAULT_PROFILE,
  FORMULA_VARIABLES,
  RANKING_RULES,
  SPORT_FORMATS,
  cloneJson,
  downloadJson,
  normalizeSport,
  readJsonFile,
  validateProfile
} from "/src/js/classmatch/profile.js";

const STORAGE_KEY = "classmatch-score-profile";
const nameInput = document.getElementById("score-profile-name");
const versionInput = document.getElementById("score-profile-version");
const sportTabs = document.getElementById("score-profile-sport-tabs");
const sportsRoot = document.getElementById("score-profile-sports");
const jsonTextarea = document.getElementById("score-profile-json");
let profile = cloneJson(DEFAULT_PROFILE);
let selectedSportIndex = 0;


function sportLabel(sport, index) {
  return sport?.name?.trim() || `競技 ${index + 1}`;
}

function renderTabs() {
  sportTabs.innerHTML = profile.sports.map((sport, index) => `
    <button class="filter filterhover profile-sport-tab ${index === selectedSportIndex ? "active" : ""}"
      type="button" data-index="${index}" title="${escapeHtml(sportLabel(sport, index))}">
      ${escapeHtml(sportLabel(sport, index))}
    </button>
  `).join("");
}

function render() {
  nameInput.value = profile.profileName;
  versionInput.value = profile.profileVersion;
  selectedSportIndex = Math.min(Math.max(0, selectedSportIndex), Math.max(0, profile.sports.length - 1));
  renderTabs();
  sportsRoot.innerHTML = "";
  if (profile.sports.length) {
    sportsRoot.appendChild(sportCard(normalizeSport(profile.sports[selectedSportIndex], selectedSportIndex), selectedSportIndex));
  }
  jsonTextarea.value = JSON.stringify(profile, null, 2);
}

function readCard(article) {
  const original = profile.sports[Number(article.dataset.index)] ?? {};
  const ranking = [...article.querySelectorAll('[data-field="rankingRule"]:checked')].map(input => input.value);
  if (!ranking.includes("manual")) ranking.push("manual");
  const points = { participation: Number(article.querySelector('[data-field="participation"]').value) || 0 };
  article.querySelectorAll(".point-row").forEach(row => {
    const rank = Math.max(1, Number(row.querySelector('[data-field="point-rank"]').value) || 1);
    points[String(rank)] = Number(row.querySelector('[data-field="point-value"]').value) || 0;
  });
  const bonus = [...article.querySelectorAll(".bonus-row")].map(row => ({
    field: row.querySelector('[data-field="bonus-field"]').value,
    multiply: Number(row.querySelector('[data-field="bonus-multiply"]').value) || 0
  }));
  return {
    ...original,
    id: article.querySelector('[data-field="id"]').value,
    name: article.querySelector('[data-field="name"]').value,
    timing: { ...original.timing, matchMinutes: article.querySelector('[data-field="match-minutes"]').value === "" ? null : Number(article.querySelector('[data-field="match-minutes"]').value) },
    courts: [...article.querySelectorAll(".court-row")].map(row => ({ venue: row.querySelector('[data-field="venue"]').value, court: row.querySelector('[data-field="court"]').value })),
    format: article.querySelector('[data-field="format"]').value,
    groups: {
      enabled: article.querySelector('[data-field="groups-enabled"]').checked,
      defaultCount: Number(article.querySelector('[data-field="groups-count"]').value)
    },
    tournament: {
      ...original.tournament,
      thirdPlace: article.querySelector('[data-field="third-place"]').checked,
      enabled: article.querySelector('[data-field="tournament-enabled"]').checked,
      advanceTeams: Number(article.querySelector('[data-field="advance-teams"]').value),
      placementAutoDetect: article.querySelector('[data-field="placement-auto"]').checked
    },
    rankingRule: { league: ranking },
    scoreRule: {
      ...original.scoreRule,
      type: article.querySelector('[data-field="score-type"]').value,
      points,
      bonus,
      formula: article.querySelector('[data-field="score-formula"]').value,
      classAggregation: article.querySelector('[data-field="class-aggregation"]').value,
      manualEnabled: article.querySelector('[data-field="manual-enabled"]').checked
    }
  };
}

export function collect() {
  const activeCard = sportsRoot.querySelector(".profile-sport-card");
  if (activeCard) profile.sports[selectedSportIndex] = readCard(activeCard);
  return validateProfile({
    profileName: nameInput.value,
    profileVersion: versionInput.value,
    sports: profile.sports
  });
}

if (new URLSearchParams(location.search).get("embedded") === "1") window.classMatchCollectTemplate = collect;

function syncActiveSport() {
  const activeCard = sportsRoot.querySelector(".profile-sport-card");
  profile.profileName = nameInput.value;
  profile.profileVersion = Number(versionInput.value) || 1;
  if (activeCard) profile.sports[selectedSportIndex] = normalizeSport(readCard(activeCard), selectedSportIndex);
  jsonTextarea.value = JSON.stringify(profile, null, 2);
}

function saveLocal(message = true) {
  profile = collect();
  const json = JSON.stringify(profile, null, 2);
  localStorage.setItem(STORAGE_KEY, json);
  jsonTextarea.value = json;
  if (message) popup("お知らせ", "テンプレートをブラウザに保存しました。", "success");
}

document.getElementById("score-profile-add-sport").addEventListener("click", () => {
  try { syncActiveSport(); } catch {}
  profile.sports.push(normalizeSport({ name: `競技 ${profile.sports.length + 1}` }, profile.sports.length));
  selectedSportIndex = profile.sports.length - 1;
  render();
});

sportTabs.addEventListener("click", event => {
  const tab = event.target.closest(".profile-sport-tab");
  if (!tab) return;
  try { syncActiveSport(); } catch {}
  selectedSportIndex = Number(tab.dataset.index) || 0;
  render();
});

sportsRoot.addEventListener("click", event => {
  const article = event.target.closest(".profile-sport-card");
  if (!article) return;
  if (event.target.classList.contains("edit-formula")) openFormulaEditor(article.querySelector('[data-field="score-formula"]'));
  if (event.target.classList.contains("add-court")) article.querySelector(".court-rows").insertAdjacentHTML("beforeend", courtRow());
  if (event.target.classList.contains("remove-court")) event.target.closest(".court-row").remove();
  if (event.target.classList.contains("remove-profile-sport")) {
    if (profile.sports.length <= 1) {
      popup("お知らせ", "競技は1つ以上必要です。", "warning");
      return;
    }
    profile.sports.splice(selectedSportIndex, 1);
    selectedSportIndex = Math.max(0, selectedSportIndex - 1);
    render();
    return;
  }
  if (event.target.classList.contains("add-point")) {
    article.querySelector(".point-rows").insertAdjacentHTML("beforeend", `
      <div class="compact-row point-row">
        <label>順位<input class="filter" type="number" min="1" data-field="point-rank" value="1"></label>
        <label>点数<input class="filter" type="number" data-field="point-value" value="0"></label>
        <button class="filter filterhover remove-point" type="button">削除</button>
      </div>`);
  }
  if (event.target.classList.contains("add-bonus")) {
    article.querySelector(".bonus-rows").insertAdjacentHTML("beforeend", `
      <div class="compact-row bonus-row">
        <label>加点元<select class="filter" data-field="bonus-field"><option value="wins">勝利数</option><option value="tournamentWins">トーナメント勝利数</option><option value="winsWithoutThirdPlace">三位決定戦を除いた勝利数</option><option value="tournamentWinsWithoutThirdPlace">三位決定戦を除いたトーナメント勝利数</option><option value="thirdPlaceWins">三位決定戦の勝利数</option><option value="goalsFor">総得点</option></select></label>
        <label>1回あたり<input class="filter" type="number" data-field="bonus-multiply" value="0"></label>
        <button class="filter filterhover remove-bonus" type="button">削除</button>
      </div>`);
  }
  if (event.target.classList.contains("remove-point")) event.target.closest(".point-row").remove();
  if (event.target.classList.contains("remove-bonus")) event.target.closest(".bonus-row").remove();
});

sportsRoot.addEventListener("input", event => {
  if (event.target.dataset.field !== "name") return;
  const activeCard = sportsRoot.querySelector(".profile-sport-card");
  if (!activeCard) return;
  const name = event.target.value.trim();
  const heading = activeCard.querySelector(".profile-sport-heading h2");
  if (heading) heading.textContent = name || `競技 ${selectedSportIndex + 1}`;
  profile.sports[selectedSportIndex] = {
    ...profile.sports[selectedSportIndex],
    name: name || `競技 ${selectedSportIndex + 1}`
  };
  renderTabs();
});

document.getElementById("score-profile-import").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    profile = validateProfile(await readJsonFile(file));
    selectedSportIndex = 0;
    render();
    saveLocal(false);
    popup("お知らせ", "テンプレートJSONを読み込みました。", "success");
  } catch (error) {
    popup("お知らせ", error.message.replaceAll("\n", "<br>"), "error");
  } finally {
    event.target.value = "";
  }
});

document.getElementById("score-profile-apply-json").addEventListener("click", () => {
  try {
    profile = validateProfile(JSON.parse(jsonTextarea.value));
    selectedSportIndex = 0;
    render();
    saveLocal(false);
    popup("お知らせ", "JSONを編集画面に反映しました。", "success");
  } catch (error) {
    popup("お知らせ", error.message.replaceAll("\n", "<br>"), "error");
  }
});

document.getElementById("score-profile-format").addEventListener("click", () => {
  try { saveLocal(); } catch (error) { popup("お知らせ", error.message.replaceAll("\n", "<br>"), "error"); }
});

document.getElementById("score-profile-download").addEventListener("click", () => {
  try {
    profile = collect();
    saveLocal(false);
    downloadJson(`${profile.profileName}-v${profile.profileVersion}.json`, profile);
    popup("お知らせ", "テンプレートJSONを保存しました。", "success");
  } catch (error) {
    popup("お知らせ", error.message.replaceAll("\n", "<br>"), "error");
  }
});

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) profile = validateProfile(JSON.parse(saved));
} catch (error) {
  console.warn("Saved profile could not be loaded", error);
}
render();

window.classMatchLoadTemplate = value => { profile = validateProfile(value); selectedSportIndex = 0; render(); };
