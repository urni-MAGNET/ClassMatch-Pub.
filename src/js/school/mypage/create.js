import { escapeHtml } from "/src/js/common.js";
import { readJsonFile, validateProfile } from "/src/js/classmatch/profile.js";
import { readJsonFile as readClassJsonFile, validateClassProfile } from "/src/js/classmatch/classes.js";
import { popup } from "/src/js/popup.js";

const sportsRoot = document.getElementById("sports-root");
const summary = document.getElementById("imported-profile-summary");
const classSummary = document.getElementById("imported-class-profile-summary");
const classList = document.getElementById("class-master-list");
let currentProfile = null;
let classSequence = 0;
let teamSequence = 0;

function createTeamId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  teamSequence += 1;
  return `team-${Date.now()}-${teamSequence}`;
}

function createClassId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}


function classOptions(selected = "") {
  return [...classList.querySelectorAll(".class-master-row")].map(row => {
    const key = row.dataset.classKey;
    const name = row.querySelector(".class-name")?.value.trim() || "名称未設定";
    return `<option value="${escapeHtml(key)}" ${key === selected ? "selected" : ""}>${escapeHtml(name)}</option>`;
  }).join("");
}

function refreshClassOptions() {
  document.querySelectorAll(".team-class-select").forEach(select => {
    const selected = select.value;
    select.innerHTML = `<option value="">学級を選択</option>${classOptions(selected)}`;
    select.value = selected;
    updateTeamDisplayName(select.closest(".team-wrap"));
  });
}

function selectedClassName(select) {
  return select?.selectedOptions?.[0]?.textContent?.trim() || "";
}

function updateTeamDisplayName(teamWrap, force = false) {
  const classSelect = teamWrap?.querySelector(".team-class-select");
  const entryInput = teamWrap?.querySelector(".entry-label");
  const nameInput = teamWrap?.querySelector(".league-teams");
  if (!classSelect || !nameInput) return;
  if (!force && nameInput.value.trim() && nameInput.value !== teamWrap.dataset.autoName) return;
  const className = selectedClassName(classSelect);
  const entry = entryInput?.value.trim();
  nameInput.value = classSelect.value && className ? (entry ? `${className}-${entry}` : className) : "";
  teamWrap.dataset.autoName = nameInput.value;
}

function createClassRow(code = "", name = "", classId = createClassId()) {
  classSequence += 1;
  const row = document.createElement("div");
  row.className = "class-master-row compact-row";
  row.dataset.classKey = classId;
  row.innerHTML = `
    <label>学級コード<input class="filter class-code" value="${escapeHtml(code)}" placeholder="1A"></label>
    <label>学級名<input class="filter class-name" value="${escapeHtml(name)}" placeholder="1年A組"></label>
    <button class="filter filterhover remove-class-master" type="button">削除</button>`;
  return row;
}

export function applyClassProfile(profile) {
  const classProfile = validateClassProfile(profile);
  const existing = new Map(collectClasses().map(row => [row.classCode, row.classId]));
  window.classMatchImportedClassProfile = classProfile;
  classList.innerHTML = "";
  classProfile.classes.forEach(row => classList.appendChild(createClassRow(row.classCode, row.className, existing.get(row.classCode) || createClassId())));
  refreshClassOptions();
  if (classSummary) {
    classSummary.textContent = `${classProfile.profileName} v${classProfile.profileVersion} / ${classProfile.classes.length}学級`;
    classSummary.classList.add("loaded");
  }
}

export function collectClasses() {
  return [...classList.children].map(row => ({ classId: row.dataset.classKey, classCode: row.querySelector(".class-code").value, className: row.querySelector(".class-name").value }));
}

export function restoreClasses(classes) {
  classList.replaceChildren(...classes.map(row => createClassRow(row.classCode, row.className, row.classId)));
  refreshClassOptions();
  classList.dispatchEvent(new Event("input", { bubbles: true }));
}

export async function restoreTournamentInput(input) {
  applyProfile(input.profile);
  const cards = [...sportsRoot.children];
  input.sports.forEach((sport, index) => {
    const card = cards[index];
    const container = card.querySelector(".leagues-container");
    container.replaceChildren(...sport.leagues.map((source, leagueIndex) => {
      const league = createLeague(source.leagueName, leagueIndex);
      league.dataset.leagueId = source.leagueId;
      if (source.dbId) league.dataset.dbId = source.dbId;
      if (sport.format === "tournament") { league.classList.add("direct-tournament-entries"); league.querySelector(".league-row").hidden = true; }
      league.querySelector(".teams-wrap").replaceChildren(...source.teams.map(team => {
        const row = createTeam(team.placeholder ? "" : team.teamName);
        row.dataset.teamId = team.teamId;
        if (team.dbId) row.dataset.dbId = team.dbId;
        row.querySelector(".team-class-select").value = team.classId || "";
        row.querySelector(".entry-label").value = team.entryLabel || "";
        return row;
      }));
      return league;
    }));
  });
  // Allow league and bracket enhancers to attach their controls before restoring settings.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  input.sports.forEach((sport, index) => {
    const card = cards[index];
    [...card.querySelectorAll(".league-wrap")].forEach((league, leagueIndex) => {
      const source = sport.leagues[leagueIndex];
      const mode = league.querySelector(".square-match-mode"), advance = league.querySelector(".league-advance-count");
      if (mode) mode.value = String(source.matchesPerTeam === "all" ? 3 : source.matchesPerTeam);
      mode?.dispatchEvent(new Event('change', { bubbles: true }));
      if (advance) advance.value = String(source.advanceTeams);
    });
    const settings = sport.tournamentSettings || {};
    card.dataset.slotOrder = JSON.stringify(settings.slotOrder || []);
    card.dataset.seedOrder = JSON.stringify(settings.seedOrder || []);
    card.dataset.extraTeams = JSON.stringify(settings.extraTeams || []);
    card.dispatchEvent(new CustomEvent('classmatch:restore-extra-entrants', { bubbles: true, detail: settings.extraTeams || [] }));
    const third = card.querySelector(".tournament-third-place"); if (third) third.checked = settings.thirdPlace !== false;
    const enabled = card.querySelector(".tournament-enabled"), source = card.querySelector(".tournament-source"), count = card.querySelector(".tournament-team-count");
    if (enabled) enabled.checked = settings.enabled ?? input.profile.sports.find(item => item.id === sport.sportId)?.tournament?.enabled ?? sport.format === 'tournament';
    if (count) { count.value = String(settings.teamCount); count.dispatchEvent(new Event("input", { bubbles: true })); }
    if (source) { source.value = settings.source; source.dispatchEvent(new Event("change", { bubbles: true })); }
    card.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function createTeam(name = "") {
  const wrap = document.createElement("div");
  wrap.className = "team-wrap";
  wrap.dataset.teamId = createTeamId();
  wrap.innerHTML = `
    <select class="team-class-select filter"><option value="">学級を選択</option>${classOptions()}</select>
    <input type="text" class="entry-label filter" placeholder="区分（A・Bなど）">
    <input type="text" class="league-teams filter" placeholder="表示名（例: 1年A組-A）" value="${escapeHtml(name)}">
    <button class="remove-team filter filterhover" type="button">削除</button>`;
  return wrap;
}

function createLeague(name, index) {
  const league = document.createElement("div");
  league.className = "league-wrap";
  league.dataset.leagueId = createTeamId();
  league.innerHTML = `
    <div class="league-row">
      <input type="text" class="sport-leagues filter" placeholder="グループ名" value="${escapeHtml(name || `グループ ${index + 1}`)}">
      <button class="remove-league filter filterhover" type="button">グループ削除</button>
    </div>
    <div class="teams-wrap"></div>
    <button class="add-team filter filterhover" type="button">チームを追加</button>`;
  league.querySelector(".teams-wrap").append(createTeam(), createTeam(), createTeam());
  return league;
}

function sportCard(sport) {
  const article = document.createElement("article");
  article.className = "conduct-sport-wrap tournament-sport-card";
  article.dataset.sportId = sport.id;
  article.dataset.sportName = sport.name;
  article.dataset.format = sport.format;
  article.innerHTML = `
    <div class="tournament-sport-heading">
      <div><h3>${escapeHtml(sport.name)}</h3><code>${escapeHtml(sport.id)}</code><p>実施場所: ${escapeHtml(sport.courts.map(location => `${location.venue}${location.court ? ` / ${location.court}` : ""}`).join("、") || "未設定")}</p></div>
      <span class="format-badge">${escapeHtml(sport.format)}</span>
    </div>
    <p class="sport-config-summary">
      グループ: ${sport.groups.enabled ? `使用（初期${sport.groups.defaultCount}）` : "使用しない"} /
      決勝トーナメント: ${sport.tournament.enabled ? `${sport.tournament.advanceTeams}チーム進出` : "使用しない"}
    </p>
    <label>試合時間（分・未設定可）<input class="sport-match-minutes league-input" type="number" min="1" step="1" value="${sport.timing.matchMinutes ?? ""}"></label>
    <div class="leagues-container"></div>
    <button class="add-league filter filterhover" type="button">グループを追加</button>`;
  const container = article.querySelector(".leagues-container");
  if (sport.format === "tournament") {
    article.classList.add("direct-tournament-card");
    article.querySelector(".sport-config-summary").textContent = "トーナメント";
    article.querySelector(".add-league").hidden = true;
    const entries = createLeague("参加チーム", 0);
    entries.classList.add("direct-tournament-entries");
    entries.querySelector(".league-row").hidden = true;
    const teams = entries.querySelector(".teams-wrap");
    teams.replaceChildren(...Array.from({ length: Math.min(256, sport.tournament.advanceTeams || 8) }, () => createTeam()));
    container.append(entries);
    return article;
  }
  const count = sport.groups.enabled ? sport.groups.defaultCount : 1;
  for (let index = 0; index < count; index += 1) {
    container.appendChild(createLeague(sport.groups.enabled ? `グループ ${index + 1}` : "参加チーム", index));
  }
  return article;
}

export function applyProfile(profile) {
  currentProfile = validateProfile(profile);
  window.classMatchImportedProfile = currentProfile;
  sportsRoot.innerHTML = "";
  currentProfile.sports.forEach(sport => sportsRoot.appendChild(sportCard(sport)));
  summary.textContent = `${currentProfile.profileName} v${currentProfile.profileVersion} / ${currentProfile.sports.length}競技`;
  summary.classList.add("loaded");
}

document.getElementById("create-profile-import").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    applyProfile(await readJsonFile(file));
    popup("読み込み成功", "テンプレートを読み込みました。大会用の設定コピーを作成します。", "success");
  } catch (error) {
    popup("エラーが発生しました。", error.message.replaceAll("\n", "<br>"), "error");
  } finally {
    event.target.value = "";
  }
});

document.getElementById("use-saved-profile").addEventListener("click", () => {
  try {
    const saved = localStorage.getItem("classmatch-score-profile");
    if (!saved) throw new Error("ブラウザに保存されたテンプレートがありません。");
    applyProfile(JSON.parse(saved));
    popup("読み込み完了", "保存済みテンプレートを読み込みました。", "success");
  } catch (error) {
    popup("エラーが発生しました。", error.message, "error");
  }
});

document.getElementById("create-class-profile-import")?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    applyClassProfile(await readClassJsonFile(file));
    popup("読込完了", "学級テンプレートを読み込みました。", "success");
  } catch (error) {
    popup("エラーが発生しました。", error.message.replaceAll("\n", "<br>"), "error");
  } finally {
    event.target.value = "";
  }
});

document.getElementById("use-saved-class-profile")?.addEventListener("click", () => {
  try {
    const saved = localStorage.getItem("classmatch-class-profile");
    if (!saved) throw new Error("ブラウザに保存された学級テンプレートがありません。");
    applyClassProfile(JSON.parse(saved));
    popup("読込完了", "保存済み学級テンプレートを読み込みました。", "success");
  } catch (error) {
    popup("エラーが発生しました。", error.message.replaceAll("\n", "<br>"), "error");
  }
});

document.addEventListener("click", event => {
  const sport = event.target.closest(".conduct-sport-wrap");
  if (event.target.classList.contains("add-league") && sport) {
    const container = sport.querySelector(".leagues-container");
    container.appendChild(createLeague("", container.children.length));
  }
  if (event.target.classList.contains("add-team")) {
    event.target.closest(".league-wrap")?.querySelector(".teams-wrap")?.appendChild(createTeam());
  }
  if (event.target.classList.contains("remove-team")) event.target.closest(".team-wrap")?.remove();
  if (event.target.classList.contains("remove-league")) event.target.closest(".league-wrap")?.remove();
  if (event.target.id === "add-class-master") {
    classList.appendChild(createClassRow());
    refreshClassOptions();
  }
  if (event.target.classList.contains("remove-class-master")) {
    event.target.closest(".class-master-row")?.remove();
    refreshClassOptions();
  }
});

document.addEventListener("change", event => {
  if (event.target.classList.contains("team-class-select")) {
    updateTeamDisplayName(event.target.closest(".team-wrap"), true);
  }
});

document.addEventListener("input", event => {
  if (event.target.classList.contains("entry-label")) {
    const teamWrap = event.target.closest(".team-wrap");
    updateTeamDisplayName(teamWrap, true);
  }
});

classList.addEventListener("input", refreshClassOptions);
classList.append(
  createClassRow("1A", "1年A組"),
  createClassRow("1B", "1年B組"),
  createClassRow("1C", "1年C組")
);

sportsRoot.addEventListener("input", event => {
 if (!event.target.matches(".sport-match-minutes")) return;
 const sport = currentProfile.sports.find(item => item.id === event.target.closest(".conduct-sport-wrap").dataset.sportId);
 sport.timing = { ...sport.timing, matchMinutes: event.target.value === "" ? null : Number(event.target.value) };
 const timing = [...document.querySelectorAll('#timetable-sports > fieldset')].find(row => row.dataset.sportId === sport.id)?.querySelector('.matchMinutes');
 if (timing) timing.value = event.target.value;
});
