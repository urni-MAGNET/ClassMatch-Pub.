import { normalizeSport } from '/src/js/classmatch/profile.js';
import { compareTuple } from '/src/js/common.js';
import { aggregateClassTotals } from '/src/js/classmatch/class-totals.js';
export function renderCoreScores(scoreState,coreScoreSportId,coreScoreSort) {
const calculateScoreClassTotals=()=>aggregateClassTotals(scoreState);
const scoreConfig = () => scoreState.semester?.sports_config || { schemaVersion: 1, sports: [] };
const scoreClassForTeam = team => scoreState.classes.find(item => String(item.id) === String(team?.class_id));
const scoreResultFor = (sportId, teamId) => scoreState.results.find(item =>
  item.sport_id === sportId && String(item.team_id) === String(teamId)
) || {};

function scoreSportTeams(sport) {
  const ids = new Set(scoreState.leagues
    .filter(league => league.sport === sport.name)
    .map(league => String(league.id)));
  return scoreState.teams.filter(team => ids.has(String(team.leagues_id)));
}

function scoreEffectiveResult(result) {
  return {
    rank: result.manual_rank ?? result.rank ?? null,
    points: result.manual_points ?? result.calculated_points ?? null
  };
}

function scoreTeamSortValue(team, result) {
  const classRow = scoreClassForTeam(team);
  const effective = scoreEffectiveResult(result);
  if (coreScoreSort === "room") return [Number(classRow?.sort_order ?? 9999), String(classRow?.class_name ?? ""), String(team.entry_label ?? ""), String(team.teams_name ?? "")];
  if (coreScoreSort === "points") return [-(Number(effective.points) || 0), Number(effective.rank ?? 9999), String(team.teams_name ?? "")];
  return [Number(effective.rank ?? 9999), -(Number(effective.points) || 0), String(team.teams_name ?? "")];
}


function renderScoreControls(sports) {
  return `
    <div class="score-view-controls">
      <div class="score-sport-tabs" aria-label="競技別表示">
        <button class="filter filterhover score-sport-tab ${coreScoreSportId === "all" ? "active" : ""}" type="button" data-score-sport="all">全競技</button>
        ${sports.map(sport => `
          <button class="filter filterhover score-sport-tab ${coreScoreSportId === sport.id ? "active" : ""}" type="button" data-score-sport="${sport.id}">${sport.name}</button>
        `).join("")}
      </div>
      <label class="score-sort-control">並び替え
        <select class="filter" id="core-score-sort">
          <option value="rank" ${coreScoreSort === "rank" ? "selected" : ""}>順位順</option>
          <option value="room" ${coreScoreSort === "room" ? "selected" : ""}>ルーム順</option>
          <option value="points" ${coreScoreSort === "points" ? "selected" : ""}>得点順</option>
        </select>
      </label>
    </div>
  `;
}

function renderClassTotals() {
  if (!scoreState.classes.length) return "";
  const totals = calculateScoreClassTotals();
  return `
    <section class="core-score-total-board">
      <h3>学級別総合得点</h3>
      <div class="core-score-total-grid">
        ${totals.map(item => `
          <article class="core-score-total-card filter">
            <span>${item.classRow.class_name ?? ""}</span>
            <strong>${item.total}点</strong>
            <small>${item.entries}件</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSportScoreRows(sport) {
  const teams = scoreSportTeams(sport).sort((a, b) =>
    compareTuple(scoreTeamSortValue(a, scoreResultFor(sport.id, a.id)), scoreTeamSortValue(b, scoreResultFor(sport.id, b.id)))
  );
  if (!teams.length) return `<p class="edit-empty">参加チームがありません。</p>`;
  return teams.map(team => {
    const result = scoreResultFor(sport.id, team.id);
    const effective = scoreEffectiveResult(result);
    const classRow = scoreClassForTeam(team);
    return `
      <article class="core-score-row filter">
        <div>
          <strong>${team.teams_name ?? ""}</strong>
          <small>${classRow?.class_name ?? "学級未設定"} / ${team.entry_label || "-"}</small>
        </div>
        <span>${effective.rank ? `${effective.rank}位` : "順位未定"}</span>
        <span>${result.wins ?? 0}勝</span>
        <span>${result.goals_for ?? 0} - ${result.goals_against ?? 0}</span>
        <strong>${effective.points === null ? "得点未定" : `${effective.points}点`}</strong>
      </article>
    `;
  }).join("");
}

function renderScores() {
  const list = document.getElementById("core-score-list");
  if (!list) return;
  const sports = (scoreConfig().sports || []).map((rawSport, index) => normalizeSport(rawSport, index));
  const visibleSports = coreScoreSportId === "all"
    ? sports
    : sports.filter(sport => sport.id === coreScoreSportId);
  list.innerHTML = sports.length
    ? renderScoreControls(sports) + renderClassTotals() + visibleSports.map(sport => {
      return `
        <section class="core-score-sport">
          <h3>${sport.name}</h3>
          <div class="core-score-list-inner">${renderSportScoreRows(sport)}</div>
        </section>
      `;
    }).join("")
    : `<p class="edit-empty">競技設定がありません。</p>`;
}


renderScores();
}
