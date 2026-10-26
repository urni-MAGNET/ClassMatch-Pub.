import { aggregateClassTotals } from '/src/js/classmatch/class-totals.js';
import { csvEscape, compareTuple, escapeHtml } from "/src/js/common.js";
import { localScores } from '/src/js/classmatch/local-scores.js';
import { saveConfig } from "./tournament-store.js";
import { sortMatchesNewestFirst, supabase } from "/src/js/supabase.js";
import { popup } from "/src/js/popup.js";
import {
  downloadJson,
  normalizeSport,
  validateProfile,
  profileFromTournamentConfig
} from "/src/js/classmatch/profile.js";

const semesterId = new URLSearchParams(location.search).get("semester_id");
const root = document.getElementById("tournament-settings-root");
let state = { semester: null, leagues: [], teams: [], classes: [], matches: [], results: [] };
let selectedSportId = "all";
let resultSort = "rank";

const config = () => state.semester?.sports_config || { schemaVersion: 1, sports: [] };
const classForTeam = team => state.classes.find(item => String(item.id) === String(team?.class_id));
const resultFor = (sportId, teamId) => state.results.find(item =>
  item.sport_id === sportId && String(item.team_id) === String(teamId)
) || {};

async function refreshSemesterConfig() {
  const { data, error } = await supabase
    .from("semesters")
    .select("id,sports_config")
    .eq("id", semesterId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return config();
  state.semester = { ...(state.semester || {}), ...(data || {}) };
  return config();
}

async function persistSportsConfig(next) {
  next = await saveConfig(semesterId, next, config().revision ?? 0);
  state.semester = { ...state.semester, sports_config: next };
  return state.semester.sports_config || next;
}

function sportTeams(sport) {
  const ids = new Set(state.leagues
    .filter(league => league.sport === sport.name)
    .map(league => String(league.id)));
  return state.teams.filter(team => ids.has(String(team.leagues_id)));
}

function effectiveResult(result) {
  return {
    rank: result.manual_rank ?? result.rank ?? null,
    points: result.manual_points ?? result.calculated_points ?? null
  };
}


function teamSortValue(team, result) {
  const classRow = classForTeam(team);
  const effective = effectiveResult(result);
  if (resultSort === "room") return [Number(classRow?.sort_order ?? 9999), String(classRow?.class_name ?? ""), String(team.entry_label ?? ""), String(team.teams_name ?? "")];
  if (resultSort === "points") return [-(Number(effective.points) || 0), Number(effective.rank ?? 9999), String(team.teams_name ?? "")];
  return [Number(effective.rank ?? 9999), -(Number(effective.points) || 0), String(team.teams_name ?? "")];
}

function resultRows(sport) {
  const teams = sportTeams(sport).sort((a, b) =>
    compareTuple(teamSortValue(a, resultFor(sport.id, a.id)), teamSortValue(b, resultFor(sport.id, b.id)))
  );
  if (!teams.length) return `<p class="edit-empty">参加チームがありません。</p>`;
  return teams.map(team => {
    const result = resultFor(sport.id, team.id);
    const effective = effectiveResult(result);
    const classRow = classForTeam(team);
    return `
      <details class="sport-result-item">
        <summary>
          <span class="result-team-name">${escapeHtml(team.teams_name)}</span>
          <span>${effective.rank ? `${effective.rank}位` : "順位未定"}</span>
          <strong>${effective.points === null ? "得点未定" : `${effective.points}点`}</strong>
        </summary>
        <form class="sport-result-row" data-sport-id="${escapeHtml(sport.id)}" data-team-id="${escapeHtml(team.id)}">
          <p class="result-entry-meta">学級: ${escapeHtml(classRow?.class_name || "未紐付け")} / 区分: ${escapeHtml(team.entry_label || "-")}</p>
          <label>自動順位<input class="filter" name="rank" type="number" min="1" value="${result.rank ?? ""}" readonly></label>
          <label>手動順位<input class="filter" name="manual_rank" type="number" min="1" value="${result.manual_rank ?? ""}"></label>
          <label>勝利数<input class="filter" name="wins" type="number" min="0" readonly value="${result.wins ?? 0}"></label>
          <label>トーナメント勝利数<input class="filter" name="tournament_wins" type="number" min="0" readonly value="${result.tournament_wins ?? 0}"></label>
          <label>総得点<input class="filter" name="goals_for" type="number" value="${result.goals_for ?? 0}" readonly></label>
          <label>総失点<input class="filter" name="goals_against" type="number" value="${result.goals_against ?? 0}" readonly></label>
          <label>勝利数順位<input class="filter" name="win_rank" type="number" value="${result.win_rank ?? ""}" readonly></label>
          <label>参加チーム数<input class="filter" name="team_count" type="number" value="${result.team_count ?? teams.length}" readonly></label>
          <label>自動得点<input class="filter" name="calculated_points" type="number" value="${result.calculated_points ?? ""}" readonly></label>
          <label>手動得点<input class="filter" name="manual_points" type="number" value="${result.manual_points ?? ""}"></label>
          <label class="result-notes">備考<input class="filter" name="notes" value="${escapeHtml(result.notes ?? "")}" placeholder="棄権、同率、先生判断など"></label>
          <button class="filter filterhover save-sport-result" type="submit">詳細を保存</button>
        </form>
      </details>`;
  }).join("");
}

function sportTabs(sports) {
  return `
    <div class="score-view-controls">
      <div class="score-sport-tabs" aria-label="競技別表示">
        <button class="filter filterhover score-sport-tab ${selectedSportId === "all" ? "active" : ""}" type="button" data-result-sport="all">全競技</button>
        ${sports.map(sport => `
          <button class="filter filterhover score-sport-tab ${selectedSportId === sport.id ? "active" : ""}" type="button" data-result-sport="${escapeHtml(sport.id)}">${escapeHtml(sport.name)}</button>
        `).join("")}
      </div>
      <label class="score-sort-control">並び替え
        <select class="filter" id="sport-result-sort">
          <option value="rank" ${resultSort === "rank" ? "selected" : ""}>順位順</option>
          <option value="room" ${resultSort === "room" ? "selected" : ""}>ルーム順</option>
          <option value="points" ${resultSort === "points" ? "selected" : ""}>得点順</option>
        </select>
      </label>
    </div>
  `;
}



function sportPanel(sport, index) {
  return `
    <article class="tournament-setting-card filter" data-sport-index="${index}" data-sport-id="${escapeHtml(sport.id)}">
      <div class="profile-sport-heading">
        <h3>${escapeHtml(sport.name)}</h3>
        <div class="profile-toolbar">
          <button class="filter filterhover recalculate-sport" type="button">順位・得点を再計算</button>
          <button class="filter filterhover save-sport-config" type="button">競技設定を保存</button>
        </div>
      </div>
      <details class="sport-config-details">
        <summary>総合得点ルールを編集</summary>
        <p>競技形式・試合時間・リーグ設定は基本設定ページで編集できます。</p>
        <label>得点設定JSON<textarea class="filter score-rule-json" rows="9">${escapeHtml(JSON.stringify(sport.scoreRule, null, 2))}</textarea></label>
      </details>
      <div class="result-section-heading">
        <div><h4>チーム・順位・得点</h4><p>クリックすると勝利数や手動補正などの詳細が開きます。</p></div>
      </div>
      <div class="sport-result-list">${resultRows(sport)}</div>
    </article>`;
}

function classTotalBoard() {
  if (!state.classes.length) return "";
  const totals = calculateClassTotals();
  return `
    <section class="class-total-board">
      <h3>学級別総合得点</h3>
      <div class="class-total-grid">
        ${totals.map(item => `
          <div class="class-total-card">
            <span>${escapeHtml(item.classRow.class_name)}</span>
            <strong>${item.total}点</strong>
          </div>`).join("")}
      </div>
    </section>`;
}

function render() {
  const sports = (config().sports || []).map((sport, index) => normalizeSport(sport, index));
  const visibleSports = selectedSportId === "all"
    ? sports
    : sports.filter(sport => sport.id === selectedSportId);
  root.innerHTML = sports.length
    ? sportTabs(sports) + classTotalBoard() + visibleSports.map(sport => {
      const index = sports.findIndex(item => item.id === sport.id);
      return sportPanel(sport, index);
    }).join("")
    : `<p class="edit-empty">競技設定がありません。</p>`;
}

async function load() {
  if (!semesterId) return;
  const [semesterRes, leaguesRes, matchesRes, resultsRes, classesRes] = await Promise.all([
    supabase.from("semesters").select("*").eq("id", semesterId).single(),
    supabase.from("leagues").select("*").eq("semester_id", semesterId),
    supabase.from("matches").select("*").eq("semester_id", semesterId),
    supabase.from("sport_results").select("*").eq("semester_id", String(semesterId)),
    supabase.from("tournament_classes").select("*").eq("semester_id", String(semesterId)).order("sort_order")
  ]);
  for (const result of [semesterRes, leaguesRes, matchesRes, resultsRes, classesRes]) if (result.error) throw result.error;
  state.semester = semesterRes.data;
  state.leagues = leaguesRes.data || [];
  state.matches = sortMatchesNewestFirst(matchesRes.data || []);
  state.results = resultsRes.data || [];
  state.classes = classesRes.data || [];
  state.teams = [];
  const leagueIds = state.leagues.map(league => league.id);
  if (leagueIds.length) {
    const teamsRes = await supabase.from("leagues_teams").select("*").in("leagues_id", leagueIds);
    if (teamsRes.error) throw teamsRes.error;
    state.teams = teamsRes.data || [];
  }
  state.results = await localScores(state);
  render();
}

function readSportConfig(card, original) {
  let scoreRule;
  try { scoreRule = JSON.parse(card.querySelector('.score-rule-json').value); }
  catch { throw new Error('得点設定JSONを解析できません。'); }
  return validateProfile({ sports: [{ ...original, scoreRule }] }).sports[0];
}

function sportIndexForCard(card) {
  const originalId = card.dataset.sportId;
  const byId = (config().sports || []).findIndex(sport => sport.id === originalId);
  return byId >= 0 ? byId : Number(card.dataset.sportIndex);
}

function isSportConfigControl(target) {
  return Boolean(target.closest(".tournament-setting-card"))
    && (target.matches("[data-config]") || target.matches("[data-ranking]") || target.classList.contains("score-rule-json"));
}

async function saveSportConfig(card) {
  await refreshSemesterConfig();
  const index = sportIndexForCard(card);
  const original = config().sports[index];
  const updated = readSportConfig(card, original);
  const next = structuredClone(config());
  next.sports[index] = updated;
  if (original.name !== updated.name) {
    const { error } = await supabase.from("leagues").update({ sport: updated.name })
      .eq("semester_id", semesterId).eq("sport", original.name);
    if (error) throw error;
  }
  if (original.id !== updated.id) {
    const { error } = await supabase.from("sport_results").update({ sport_id: updated.id })
      .eq("semester_id", String(semesterId)).eq("sport_id", original.id);
    if (error) throw error;
  }
  await persistSportsConfig(next);
  card.dataset.dirty = "false";
  popup("お知らせ", "競技設定を保存しました。", "success");
  render();
}

async function recalculateSport(card) {
  await refreshSemesterConfig();
  const index = sportIndexForCard(card);
  let savedConfig = config();
  let sport = normalizeSport(savedConfig.sports[index], index);
  if (card.dataset.dirty === "true") {
    const original = savedConfig.sports[index];
    sport = readSportConfig(card, original);
    const next = structuredClone(savedConfig);
    next.sports[index] = sport;
    savedConfig = await persistSportsConfig(next);
    card.dataset.dirty = "false";
  }
  popup("お知らせ", '最新の試合結果からブラウザ内で総合得点を計算しました。', 'success');
  await load();
}

async function saveResult(form) {
  const sport = normalizeSport(config().sports.find(item => item.id === form.dataset.sportId));
  const data = new FormData(form);
  const nullable = name => data.get(name) === "" ? null : Number(data.get(name));
  const result = { semester_id: String(semesterId), sport_id: form.dataset.sportId, team_id: form.dataset.teamId,
    manual_rank: nullable('manual_rank'), manual_points: nullable('manual_points'), notes: String(data.get('notes') || '').slice(0,500) };
  if (result.manual_points !== null && !sport.scoreRule.manualEnabled && sport.scoreRule.type !== 'manual') throw new Error('この競技では手動得点が許可されていません。');
  const { error } = await supabase.from("sport_results").upsert(result, {
    onConflict: "semester_id,sport_id,team_id"
  });
  if (error) throw error;
  popup("お知らせ", "詳細を保存しました。", "success");
  await load();
}


function downloadCsv(filename, rows) {
  const content = "\uFEFF" + rows.map(row => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = filename; link.click();
  URL.revokeObjectURL(link.href);
}

function detailedExportRows() {
  const rows = [["競技ID", "競技名", "学級コード", "学級名", "チーム", "区分", "順位", "勝利数", "トーナメント勝利数", "総得点", "総失点", "勝利数順位", "競技得点"]];
  (config().sports || []).forEach(rawSport => {
    const sport = normalizeSport(rawSport);
    sportTeams(sport).forEach(team => {
      const result = resultFor(sport.id, team.id);
      const effective = effectiveResult(result);
      const classRow = classForTeam(team);
      rows.push([sport.id, sport.name, classRow?.class_code, classRow?.class_name, team.teams_name,
        team.entry_label, effective.rank, result.wins, result.tournament_wins, result.goals_for,
        result.goals_against, result.win_rank, effective.points]);
    });
  });
  return rows;
}

const calculateClassTotals = () => aggregateClassTotals(state);

function classTotalRows() {
  return [
    ["学級コード", "学級名", "集計エントリー数", "総合得点"],
    ...calculateClassTotals().map(item => [
      item.classRow.class_code, item.classRow.class_name, item.entries, item.total
    ])
  ];
}

root.addEventListener("click", async event => {
  if (event.target.dataset.resultSport) {
    selectedSportId = event.target.dataset.resultSport;
    render();
    return;
  }

  const card = event.target.closest(".tournament-setting-card");
  try {
    if (event.target.classList.contains("save-sport-config")) await saveSportConfig(card);
    if (event.target.classList.contains("recalculate-sport")) await recalculateSport(card);
  } catch (error) {
    console.error(error);
    popup("お知らせ", `${error.message}<br>DB未設定の場合は sports_profile_schema.sql を適用してください。`, "error");
  }
});

root.addEventListener("change", event => {
  if (isSportConfigControl(event.target)) {
    event.target.closest(".tournament-setting-card").dataset.dirty = "true";
  }
  if (event.target.id !== "sport-result-sort") return;
  resultSort = event.target.value;
  render();
});

root.addEventListener("input", event => {
  if (!isSportConfigControl(event.target)) return;
  event.target.closest(".tournament-setting-card").dataset.dirty = "true";
});

root.addEventListener("submit", async event => {
  if (!event.target.classList.contains("sport-result-row")) return;
  event.preventDefault();
  try { await saveResult(event.target); }
  catch (error) { console.error(error); popup("お知らせ", error.message, "error"); }
});

window.addEventListener("classmatch:sports-config-updated", () => {
  load().catch(error => {
    console.error(error);
    popup("お知らせ", error.message, "error");
  });
});

document.getElementById("export-sport-results")?.addEventListener("click", () =>
  downloadCsv(`classmatch-sport-results-${semesterId}.csv`, detailedExportRows()));
document.getElementById("export-class-totals")?.addEventListener("click", () =>
  downloadCsv(`classmatch-class-totals-${semesterId}.csv`, classTotalRows()));
document.getElementById("export-tournament-profile")?.addEventListener("click", () => {
  const profile = profileFromTournamentConfig(config(), `${state.semester?.name || "大会"} 設定`);
  downloadJson(`${profile.profileName}.json`, profile);
});

load().catch(error => { root.textContent = '総合得点を読み込めませんでした: ' + error.message; });
