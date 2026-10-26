import { renderSeedControls } from './tournament-seeds.js';
import { tournamentRuntime } from '/src/js/classmatch/tournament-runtime.js';
import { generateCurrentTournamentStructure, downloadTournamentJSON } from "./create-structure-data.js";
import { generateTournamentData } from "/src/js/classmatch/tournament-data.js";
import { measureTeamStartPoints, renderTournamentSVG } from "/src/js/classmatch/tournament-svg.js";
import { popup } from "/src/js/popup.js";

const tournamentTrophyUrl = new URL("../../../img/tournament-trophy.svg", import.meta.url).href;
const root = document.getElementById("sports-root");
const panels = new WeakMap();
let frame = null;
let loadedRuntime = null;
window.addEventListener('classmatch:setup-loaded', event => {
  try { loadedRuntime = tournamentRuntime(event.detail); scheduleRefresh(); } catch { loadedRuntime = null; }
});
function entrantLabel(sportId, entry) {
  if (!entry.sourceLeagueId) return entry.teamName;
  const standing = loadedRuntime?.structure.sports.find(sport => sport.sportId === sportId)?.standings.find(league => league.leagueId === entry.sourceLeagueId);
  const teamId = standing?.complete && !standing.tied ? standing.ranked[entry.sourceRank - 1]?.teamId : null;
  const team = standing?.teams.find(team => team.teamId === teamId);
  return team ? entry.teamName + '：' + team.teamName : entry.teamName + '（未確定）';
}

function addExtraEntrant(list, entry = {}) {
  const row = document.createElement('div');
  row.className = 'tournament-extra-row';
  row.dataset.teamId = entry.teamId || crypto.randomUUID();
  const input = document.createElement('input');
  input.type = 'text'; input.className = 'tournament-extra-name league-input';
  input.placeholder = '例: 推薦枠・開催校枠'; input.value = entry.teamName || '';
  input.setAttribute('aria-label', '自由追加する決勝トーナメント枠の名前');
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'remove-tournament-extra'; remove.textContent = '削除';
  row.append(input, remove); list.append(row);
}

function addPanel(card) {
  if (panels.has(card)) return;
  const profile = window.classMatchImportedProfile?.sports.find(sport => sport.id === card.dataset.sportId);
  const direct = card.dataset.format === "tournament";
  const panel = document.createElement("section");
  panel.className = "tournament-panel";
  panel.innerHTML = `
    <div class="tournament-panel-heading"><h4>決勝トーナメント</h4><label><input type="checkbox" class="tournament-enabled">使用する</label></div>
    <div class="tournament-toolbar">
      <label>出場枠<select class="tournament-source league-select"><option value="leagues">リーグの決勝進出枠</option><option value="manual">出場チーム数を指定</option></select></label>
      <label>出場チーム数<input type="number" min="0" max="256" step="1" class="tournament-team-count league-input"></label>
      <label><input class="tournament-third-place" type="checkbox" checked>3位決定戦</label>
      <label>線の長さ<input type="number" min="60" max="240" step="10" value="${direct ? 80 : 120}" class="tournament-line-length league-input"></label>
      <button type="button" class="regenerate-tournament">再生成</button>
    </div>
    <div class="tournament-extra-entrants">
      <div><strong>自由追加枠</strong><span>リーグ進出枠とは別に、名前付きの枠を追加できます。</span></div>
      <div class="tournament-extra-list"></div>
      <button type="button" class="add-tournament-extra">自由追加枠を追加</button>
    </div>
    <p class="tournament-summary" role="status"></p><details class="tournament-seeds"><summary>シード指定</summary><div></div></details>
    <div class="tournament-scroll"><div class="tournament-stage"></div></div>`;
  panel.querySelector(".tournament-third-place").checked = profile?.tournament?.thirdPlace !== false;
  panel.querySelector(".tournament-enabled").checked = direct || Boolean(profile?.tournament?.enabled);
  panel.querySelector(".tournament-team-count").value = String(profile?.tournament?.advanceTeams || 8);
  panel.querySelector(".tournament-source").value = "manual";
  const extras = JSON.parse(card.dataset.extraTeams || '[]');
  extras.forEach(entry => addExtraEntrant(panel.querySelector('.tournament-extra-list'), entry));
  if (direct) {
    panel.classList.add("direct-tournament-panel");
    panel.querySelector("h4").textContent = "トーナメント";
    panel.querySelector(".tournament-source").closest("label").hidden = true;
    panel.querySelector(".tournament-enabled").closest("label").hidden = true;
    panel.querySelector(".tournament-stage").append(card.querySelector(".direct-tournament-entries"));
  }
  card.append(panel);
  const state = { panel, direct, manualCount: profile?.tournament?.advanceTeams || 8, sourceTouched: false };
  panels.set(card, state);
  state.observer = new ResizeObserver(scheduleRefresh);
  state.observer.observe(panel.querySelector(".tournament-scroll"));
}

function textNode(className, text, x, y) {
  const node = document.createElement("span");
  node.className = className;
  node.classList.add("tournament-overlay-node");
  node.textContent = text;
  node.title = text;
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  return node;
}

function renderBracket(card, sport) {
  const state = panels.get(card);
  const panel = state.panel;
  const stage = panel.querySelector(".tournament-stage");
  if (state.direct) {
    stage.querySelectorAll(":scope > .tournament-overlay-node, :scope > .tournament-line-layer").forEach(node => node.remove());
  } else stage.replaceChildren();
  const bracket = sport.tournament;
  renderSeedControls(panel.querySelector('.tournament-seeds > div'), card, bracket.teams, scheduleRefresh);
  panel.querySelector('.tournament-seeds').hidden = !bracket.teams.length;
  panel.querySelector(".tournament-scroll").hidden = !bracket.teams.length && !state.direct;
  panel.querySelector(".tournament-summary").textContent = bracket.teams.length
    ? `${bracket.teamCount}チーム / ${bracket.roundCount}ラウンド / ${bracket.totalMatches}試合 / シード${bracket.seeds.length}枠`
    : panel.querySelector(".tournament-enabled").checked ? "出場枠がありません。" : "使用しない";
  const directEntries = stage.querySelector(".direct-tournament-entries");
  const elements = state.direct ? [...directEntries.querySelectorAll(".team-wrap")] : bracket.teams.map((team, index) => {
    const node = document.createElement('select');
    node.className = 'tournament-team tournament-overlay-node tournament-slot-select';
    node.style.left = '12px'; node.style.top = (48 + index * 64) + 'px';
    node.setAttribute('aria-label', '決勝進出枠' + (index + 1));
    bracket.teams.forEach(candidate => node.add(new Option(entrantLabel(sport.sportId, candidate), candidate.teamId)));
    node.value = team.teamId;
    node.addEventListener('change', () => {
      const selects = [...stage.querySelectorAll('.tournament-slot-select')];
      const order = selects.map(select => select.dataset.teamId), other = order.indexOf(node.value);
      [order[index], order[other]] = [order[other], order[index]];
      // Reflect both sides immediately, before the next animation-frame redraw.
      selects.forEach((select, slot) => { select.value = order[slot]; select.dataset.teamId = order[slot]; });
      card.dataset.slotOrder = JSON.stringify(order); card.dataset.seedOrder = '[]'; scheduleRefresh();
    });
    node.dataset.teamId = team.teamId;
    stage.append(node);
    return node;
  });
  if (state.direct) elements.forEach((row, index) => {
    row.classList.add("tournament-entry-row");
    row.querySelectorAll("input, select").forEach(control => {
      control.classList.remove("filter");
      control.classList.add(control.tagName === "SELECT" ? "league-select" : "league-input");
    });
    row.querySelector(".team-class-select").setAttribute("aria-label", `チーム${index + 1}の学級`);
    row.querySelector(".entry-label").setAttribute("aria-label", `チーム${index + 1}の区分`);
    row.querySelector(".league-teams").setAttribute("aria-label", `チーム${index + 1}の表示名`);
    const remove = row.querySelector(".remove-team");
    remove.classList.remove("filter", "filterhover");
    if (remove.textContent !== "−") remove.textContent = "−";
    remove.setAttribute("aria-label", `チーム${index + 1}を削除`);
    remove.title = "チームを削除";
  });
  if (!bracket.teams.length) {
    if (state.direct) {
      stage.style.width = `${directEntries.offsetWidth + 24}px`;
      stage.style.height = `${directEntries.offsetTop + directEntries.offsetHeight + 16}px`;
    }
    return;
  }
  const step = Math.min(240, Math.max(60, Number(panel.querySelector(".tournament-line-length").value) || 120));
  const visible = stage.getBoundingClientRect().width > 0;
  const data = generateTournamentData({
    teams: bracket.teams, startPoints: visible ? measureTeamStartPoints(stage, elements) : [], step,
    prefix: `${sport.sportId}-bracket`, sportId: sport.sportId, sportName: sport.sportName, thirdPlace: bracket.thirdPlace, seedOrder: sport.tournamentSettings.seedOrder
  });
  if (state.direct) data.geometry.height = Math.max(data.geometry.height, directEntries.offsetTop + directEntries.offsetHeight + 16);
  stage.style.width = `${data.geometry.width}px`;
  stage.style.height = `${data.geometry.height}px`;
  renderTournamentSVG(data, stage);
  for (const round of data.rounds) {
    stage.append(textNode("tournament-round-heading", round.label === "Final" ? "決勝" : `第${round.round}回戦`, data.points["start-1"].x + step * (round.round - 1), 8));
    for (const match of round.matches) {
      const point = data.points[match.winnerPointId];
      stage.append(textNode("tournament-match-label", `第${match.order}試合`, point.x - step / 2, point.y - 24));
    }
    for (const seed of round.seeds) {
      const point = data.points[seed.toPointId];
      stage.append(textNode("tournament-seed-label", "シード", point.x - step / 2, point.y + 6));
    }
  }
  if (data.champion) {
    const point = data.points[data.champion.pointId];
    const champion = textNode("tournament-champion", data.totalMatches ? "優勝" : data.champion.teamName, point.x + 8, point.y);
    const trophy = document.createElement("img");
    trophy.src = tournamentTrophyUrl;
    trophy.alt = "";
    champion.prepend(trophy);
    stage.append(champion);
  }
  if (data.thirdPlaceMatch) {
    const a = data.points['third-a'], b = data.points['third-b'];
    stage.append(textNode('tournament-round-heading', '3位決定戦', a.x - 170, 8),
      textNode('tournament-team', '準決勝1の敗者', data.points['third-start-a'].x - 188, a.y),
      textNode('tournament-team', '準決勝2の敗者', data.points['third-start-b'].x - 188, b.y),
      textNode('tournament-match-label', '3位', data.points['third-winner'].x + 8, 110));
  }
  if (sport.warnings?.length) panel.querySelector('.tournament-summary').textContent += ' / ' + sport.warnings.join(' ');
  sport.tournament = data;
  sport.tournamentMatchPairs = data.matchPairs;
}

export function generateCurrentTournamentJSON() {
  const cards = [...root.querySelectorAll(".conduct-sport-wrap")];
  for (const card of cards) {
    addPanel(card);
    const state = panels.get(card);
    const panel = state.panel;
    const source = panel.querySelector(".tournament-source");
    const count = panel.querySelector(".tournament-team-count");
    if (state.direct) {
      source.value = "manual";
      state.manualCount = card.querySelectorAll(".direct-tournament-entries .team-wrap").length;
      count.value = String(state.manualCount);
      count.disabled = true;
      continue;
    }
    const qualifiers = [...card.querySelectorAll(".league-advance-count")].reduce((sum, input) => sum + Math.min(Number(input.max), Math.max(0, Math.floor(Number(input.value) || 0))), 0);
    if (!state.sourceTouched) source.value = qualifiers ? "leagues" : "manual";
    count.disabled = source.value === "leagues";
    const extras = [...card.querySelectorAll('.tournament-extra-name')].filter(input => input.value.trim()).length;
    count.value = String(count.disabled ? qualifiers + extras : state.manualCount);
    panel.querySelector('.tournament-extra-entrants').hidden = source.value !== 'leagues';
  }
  const data = generateCurrentTournamentStructure();
  data.sports.forEach((sport, index) => renderBracket(cards[index], sport));
  window.classMatchTournamentData = data;
  window.dispatchEvent(new CustomEvent("classmatch:tournament-structure-updated", { detail: data }));
  return data;
}

function refresh() {
  frame = null;
  try { generateCurrentTournamentJSON(); }
  catch (error) {
    window.classMatchTournamentData = null;
    root.querySelectorAll(".tournament-stage").forEach(stage => {
      stage.querySelectorAll(":scope > .tournament-overlay-node, :scope > .tournament-line-layer").forEach(node => node.remove());
    });
    root.querySelectorAll(".tournament-summary").forEach(summary => { summary.textContent = error.message; });
  }
}

function scheduleRefresh() {
  if (frame === null) frame = requestAnimationFrame(refresh);
}

root.addEventListener("input", event => {
  if (event.target.matches(".tournament-team-count")) {
    const state = panels.get(event.target.closest(".conduct-sport-wrap"));
    state.manualCount = Math.min(256, Math.max(0, Math.floor(Number(event.target.value) || 0)));
  }
  if (event.target.matches("input, select")) scheduleRefresh();
});
root.addEventListener("change", event => {
  if (event.target.matches(".tournament-source")) panels.get(event.target.closest(".conduct-sport-wrap")).sourceTouched = true;
  scheduleRefresh();
});
root.addEventListener("click", event => {
  const add = event.target.closest('.add-tournament-extra');
  if (add) addExtraEntrant(add.closest('.tournament-extra-entrants').querySelector('.tournament-extra-list'));
  const remove = event.target.closest('.remove-tournament-extra');
  if (remove) remove.closest('.tournament-extra-row').remove();
  if (event.target.closest(".regenerate-tournament")) scheduleRefresh();
  if (add || remove) scheduleRefresh();
});
root.addEventListener('classmatch:restore-extra-entrants', event => {
  const card = event.target.closest('.conduct-sport-wrap');
  const list = card?.querySelector('.tournament-extra-list');
  if (!list) return;
  list.replaceChildren();
  (event.detail || []).forEach(entry => addExtraEntrant(list, entry));
  scheduleRefresh();
});
new MutationObserver(mutations => {
  for (const mutation of mutations) {
    if (mutation.target === root || mutation.target.matches?.(".leagues-container, .teams-wrap")) scheduleRefresh();
    for (const node of mutation.removedNodes) {
      if (node instanceof HTMLElement && !node.isConnected && panels.has(node)) panels.get(node).observer.disconnect();
    }
  }
}).observe(root, { childList: true, subtree: true });
document.getElementById("class-master-list").addEventListener("input", scheduleRefresh);
document.getElementById("export-tournament-json").addEventListener("click", () => {
  try {
    if (!root.children.length) throw new Error("大会テンプレートを読み込んでください。");
    downloadTournamentJSON(generateCurrentTournamentJSON());
  } catch (error) { popup("JSON生成エラー", error.message, "error"); }
});
scheduleRefresh();
