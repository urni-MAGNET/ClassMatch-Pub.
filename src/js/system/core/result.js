import { renderCoreScores } from './score-view.js';
import { csvEscape, normalizeTeamName, compareTuple } from "/src/js/common.js";
import { localScores } from '/src/js/classmatch/local-scores.js';
import { coreScoreDataSB, sortMatchesNewestFirst, supabase } from "/src/js/supabase.js";
import { popup } from "/src/js/popup.js";

const params = new URLSearchParams(window.location.search);
const semesterId = params.get("conduct");

let teamNameById = new Map();
let teamsBySport = new Map();
let cachedMatches = [];
let scoreState = { semester: null, leagues: [], teams: [], matches: [], classes: [], results: [] };
let coreScoreSportId = "all";
let coreScoreSort = "rank";

async function hydrateTeamNames(matches = []) {
  const ids = [...new Set(matches.flatMap(row => [row.team_a, row.team_b, row.winner]).filter(Boolean).map(String))];
  if (!ids.length) return;

  const { data, error } = await supabase
    .from("leagues_teams")
    .select("id,teams_name")
    .in("id", ids);

  if (error) {
    console.error(error);
    return;
  }

  data?.forEach(team => teamNameById.set(String(team.id), team.teams_name));
}

async function loadAllTeams() {
  const { data: leagues, error: leaguesError } = await supabase
    .from("leagues")
    .select("id,sport")
    .eq("semester_id", semesterId);

  if (leaguesError) {
    console.error(leaguesError);
    return;
  }

  const leagueIds = (leagues ?? []).map(league => league.id);
  if (!leagueIds.length) return;

  const { data: teams, error: teamsError } = await supabase
    .from("leagues_teams")
    .select("id,teams_name,leagues_id")
    .in("leagues_id", leagueIds);

  if (teamsError) {
    console.error(teamsError);
    return;
  }

  const sportByLeague = new Map((leagues ?? []).map(league => [String(league.id), league.sport]));
  teams?.forEach(team => {
    teamNameById.set(String(team.id), team.teams_name);
    const sport = sportByLeague.get(String(team.leagues_id));
    if (!teamsBySport.has(sport)) teamsBySport.set(sport, []);
    teamsBySport.get(sport).push(team);
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function optionSelect(sport, value) {
  const selected = value == null ? "" : String(value);
  const options = teamsBySport.get(sport) ?? [];
  const legacy = selected && !options.some(team => String(team.id) === selected)
    ? `<option value="${escapeHtml(selected)}" selected disabled>${escapeHtml(teamNameById.get(selected) ?? selected)}（競技外・選び直してください）</option>`
    : "";
  return `<option value="">未選択</option>${legacy}${options.map(team =>
    `<option value="${escapeHtml(team.id)}"${String(team.id) === selected ? " selected" : ""}>${escapeHtml(team.teams_name)}</option>`
  ).join("")}`;
}

function refreshTeamSelects(form, clearInvalid = true) {
  const sport = form.elements.match_game.value.trim();
  for (const name of ["team_a", "team_b", "winner"]) {
    const select = form.elements[name];
    const previous = select.value;
    select.innerHTML = optionSelect(sport, previous);
    if (clearInvalid && previous && !(teamsBySport.get(sport) ?? []).some(team => String(team.id) === previous)) select.value = "";
  }
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}



function exportMatchesCsv() {
  const header = ["id", "競技", "種別", "チームA", "チームA集計キー", "点A", "チームB", "チームB集計キー", "点B", "勝者", "勝者集計キー", "announced"];
  const body = cachedMatches.map(row => {
    const teamA = teamNameById.get(String(row.team_a)) ?? row.team_a;
    const teamB = teamNameById.get(String(row.team_b)) ?? row.team_b;
    const winner = teamNameById.get(String(row.winner)) ?? row.winner ?? "";
    return [row.id, row.match_game, row.match_type, teamA, normalizeTeamName(teamA), row.score_a, teamB, normalizeTeamName(teamB), row.score_b, winner, normalizeTeamName(winner), row.announced]
      .map(csvEscape)
      .join(",");
  });
  const blob = new Blob(["\uFEFF" + [header.map(csvEscape).join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `classmatch-results-${semesterId}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderMatch(row) {
  return `
    <form class="core-result-row filter" data-id="${row.id}">
      <label>競技<input class="filter" name="match_game" value="${escapeHtml(row.match_game)}"></label>
      <label>種別<input class="filter" name="match_type" value="${escapeHtml(row.match_type)}"></label>
      <label>実施日時<input class="filter" name="played_at" type="datetime-local" value="${toDateTimeLocal(row.played_at)}"></label>
      <label>チームA<select class="filter" name="team_a">${optionSelect(row.match_game, row.team_a)}</select></label>
      <label>点A<input class="filter" name="score_a" type="number" value="${row.score_a ?? ""}"></label>
      <label>チームB<select class="filter" name="team_b">${optionSelect(row.match_game, row.team_b)}</select></label>
      <label>点B<input class="filter" name="score_b" type="number" value="${row.score_b ?? ""}"></label>
      <label>勝者<select class="filter" name="winner">${optionSelect(row.match_game, row.winner)}</select></label>
      <label>既読<input class="core-checkbox" name="announced" type="checkbox" ${row.announced ? "checked" : ""}></label>
      <div class="core-row-actions">
        <button class="save-btn filter filterhover" type="submit">更新</button>
        <button class="delete-btn filter filterhover core-result-delete" type="button">削除</button>
      </div>
    </form>
  `;
}

const renderScores = () => renderCoreScores(scoreState,coreScoreSportId,coreScoreSort);
const scoreConfig = () => scoreState.semester?.sports_config ?? { sports: [] };
async function loadScoreData() {
  const data = await coreScoreDataSB(semesterId);
  scoreState.semester = data.semester;
  scoreState.leagues = data.leagues || [];
  scoreState.matches = data.matches || [];
  scoreState.results = data.results || [];
  scoreState.classes = data.classes || [];
  scoreState.teams = data.teams || [];
  scoreState.results = await localScores(scoreState);
  cachedMatches = scoreState.matches;
  renderScores();
}

async function recalculateAllScores() {
  await loadScoreData();
  popup("お知らせ", '最新の試合結果からブラウザ内で総合得点を計算しました。', 'success');
}


async function loadMatches(markNewest = false) {
  const list = document.getElementById("editable-result-list");
  if (!list) return;

  let { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("semester_id", semesterId)
    .order("played_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    const fallback = await supabase.from("matches").select("*").eq("semester_id", semesterId);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error(error);
    list.textContent = "試合結果の取得に失敗しました。";
    return;
  }

  const sorted = sortMatchesNewestFirst(data ?? []);
  await hydrateTeamNames(sorted);
  cachedMatches = sorted;
  list.innerHTML = sorted.length ? sorted.map(renderMatch).join("") : "試合結果はまだありません。";
  if (markNewest) list.querySelector(".core-result-row")?.classList.add("is-new");
}

function renderReport(row) {
  return `
    <article class="match-report-row filter ${row.solved ? "solved" : ""}" data-id="${row.id}">
      <p class="match-report-content">${row.content ?? ""}</p>
      <label>
        <input class="match-report-solved" type="checkbox" ${row.solved ? "checked" : ""}>
        解決済み
      </label>
      <small>${row.created_at ?? ""}</small>
    </article>
  `;
}

async function loadReports(markNewest = false) {
  const list = document.getElementById("matches-report-list");
  if (!list) return;

  let { data, error } = await supabase
    .from("matches_report")
    .select("*")
    .eq("semester_id", semesterId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    list.textContent = "間違い報告の取得に失敗しました。";
    return;
  }

  list.innerHTML = data?.length ? data.map(renderReport).join("") : "間違い報告はまだありません。";
  if (markNewest) list.querySelector(".match-report-row")?.classList.add("is-new");
}

function setCoreView(view) {
  const scores = view === "scores";
  document.getElementById("editable-result-list").hidden = scores;
  document.getElementById("core-score-list").hidden = !scores;
  document.getElementById("core-export-matches-csv").hidden = scores;
  document.getElementById("core-calculate-scores").hidden = !scores;
  document.querySelectorAll("[data-core-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.coreView === view);
  });
  if (scores) loadScoreData().catch(error => {
    console.error(error);
    popup("お知らせ", `得点一覧の取得に失敗しました。<br>${error.message}`, "error");
  });
}

document.addEventListener("submit", async e => {
  if (!e.target.classList.contains("core-result-row")) return;
  e.preventDefault();

  const form = e.target;
  const payload = Object.fromEntries(new FormData(form));
  const validTeamIds = new Set((teamsBySport.get(payload.match_game.trim()) ?? []).map(team => String(team.id)));
  if (!payload.team_a || !payload.team_b || !validTeamIds.has(String(payload.team_a)) || !validTeamIds.has(String(payload.team_b)) || (payload.winner && !validTeamIds.has(String(payload.winner)))) {
    popup("更新できません", "対象競技に所属するチームを選択してください。", "warning");
    return;
  }
  payload.score_a = Number(payload.score_a);
  payload.score_b = Number(payload.score_b);
  payload.played_at = payload.played_at ? new Date(payload.played_at).toISOString() : null;
  payload.announced = form.querySelector("[name='announced']").checked;
  payload.winner = payload.winner || null;

  const { error } = await supabase.from("matches").update(payload).eq("id", form.dataset.id);
  if (error) {
    console.error(error);
    popup("お知らせ", `更新に失敗しました。<br>${error.message}`, "error");
    return;
  }

  try {
    await recalculateAllScores();
  } catch (error) {
    console.error(error);
    popup("お知らせ", `得点一覧の自動更新に失敗しました。<br>${error.message}`, "error");
  }
  popup("お知らせ", "試合結果を更新しました。", "success");
  await loadMatches();
});

document.addEventListener("click", async e => {
  if (e.target.dataset.scoreSport) {
    coreScoreSportId = e.target.dataset.scoreSport;
    renderScores();
    return;
  }

  if (e.target.dataset.coreView) {
    setCoreView(e.target.dataset.coreView);
    return;
  }

  if (e.target.id === "core-export-matches-csv") {
    exportMatchesCsv();
    return;
  }

  if (e.target.id === "core-calculate-scores") {
    try {
      await recalculateAllScores();
      popup("お知らせ", "得点一覧を計算しました。", "success");
    } catch (error) {
      console.error(error);
      popup("お知らせ", `得点計算に失敗しました。<br>${error.message}`, "error");
    }
    return;
  }

  if (e.target.id === "core-refresh-reports") {
    await loadReports();
    popup("お知らせ", "間違い報告を更新しました。", "success");
    return;
  }

  if (!e.target.classList.contains("core-result-delete")) return;
  const form = e.target.closest(".core-result-row");
  if (!confirm("この試合結果を削除しますか？")) return;

  const { error } = await supabase.from("matches").delete().eq("id", form.dataset.id);
  if (error) {
    console.error(error);
    popup("お知らせ", `削除に失敗しました。<br>${error.message}`, "error");
    return;
  }

  form.remove();
  try {
    await recalculateAllScores();
  } catch (error) {
    console.error(error);
    popup("お知らせ", `得点一覧の自動更新に失敗しました。<br>${error.message}`, "error");
  }
});

document.addEventListener("change", async e => {
  if (e.target.id === "core-score-sort") {
    coreScoreSort = e.target.value;
    renderScores();
    return;
  }

  if (!e.target.classList.contains("match-report-solved")) return;
  const row = e.target.closest(".match-report-row");
  const { error } = await supabase
    .from("matches_report")
    .update({ solved: e.target.checked })
    .eq("id", row.dataset.id);

  if (error) {
    console.error(error);
    popup("お知らせ", `解決状態の更新に失敗しました。<br>${error.message}`, "error");
    e.target.checked = !e.target.checked;
    return;
  }

  row.classList.toggle("solved", e.target.checked);
});

document.addEventListener("input", e => {
  if (e.target.name !== "match_game" || !e.target.closest(".core-result-row")) return;
  refreshTeamSelects(e.target.closest(".core-result-row"));
});

function subscribeCore() {
  supabase
    .channel(`core-matches-${semesterId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, async payload => {
      const payloadSemesterId = payload.new?.semester_id ?? payload.old?.semester_id;
      const deletedId = payload.eventType === "DELETE" ? String(payload.old?.id ?? "") : "";
      const deletedVisibleRow = deletedId
        ? [...document.querySelectorAll(".core-result-row")]
          .some(row => String(row.dataset.id) === deletedId)
        : false;

      if (String(payloadSemesterId) !== String(semesterId) && !deletedVisibleRow) return;

      await loadMatches(payload.eventType === "INSERT");
      try {
        await recalculateAllScores();
      } catch (error) {
        console.error(error);
        popup("お知らせ", `総合得点の自動再計算に失敗しました。<br>${error.message}`, "error");
      }
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "matches_report" }, payload => {
      if (String(payload.new.semester_id) === String(semesterId)) loadReports(true);
    })
    .subscribe();
}

await loadAllTeams();
await loadMatches();
await loadReports();
subscribeCore();
