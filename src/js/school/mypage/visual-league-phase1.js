import { generateVisualLeaguePairs, visualLeaguePoints } from "/src/js/classmatch/league-pairs.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const states = new WeakMap();

function drawLeague(league) {
  const state = states.get(league);
  if (!state) return;
  const teams = [...state.teams.children];
  const count = teams.length;
  const focusedVertex = [...state.vertices.children].indexOf(document.activeElement);
  state.vertices.replaceChildren();
  state.svg.replaceChildren();
  state.setting.hidden = count !== 4;
  // Percentage coordinates keep the geometry stable when resizing.
  const points = teams.map((team, index) => {
    const point = visualLeaguePoints(count)[index];
    const source = team.querySelector(".team-class-select");
    const select = source.cloneNode(true);
    select.className = "visual-team-select league-select";
    select.value = source.value;
    select.setAttribute("aria-label", `チーム${index + 1}の学級`);
    select.style.left = `${point.x}%`;
    select.style.top = `${point.y}%`;
    select.addEventListener("change", () => {
      source.value = select.value;
      source.dispatchEvent(new Event("change", { bubbles: true }));
    });
    state.vertices.append(select);
    return point;
  });
  const line = (a, b) => {
    const element = document.createElementNS(SVG_NS, "line");
    element.setAttribute("x1", a.x);
    element.setAttribute("y1", a.y);
    element.setAttribute("x2", b.x);
    element.setAttribute("y2", b.y);
    state.svg.append(element);
  };
  generateVisualLeaguePairs(count, state.mode.value).forEach(([a, b]) => line(points[a], points[b]));
  const advance = league.querySelector(".league-advance-count");
  advance.max = String(count);
  if (Number(advance.value) > count) advance.value = String(count);
  if (focusedVertex >= 0) state.vertices.children[focusedVertex]?.focus({ preventScroll: true });
}

function prepareTeams(league) {
  const state = states.get(league);
  [...state.teams.children].forEach((team, index) => {
    team.querySelectorAll("input, select").forEach(control => {
      control.classList.remove("filter");
      control.classList.add(control.tagName === "SELECT" ? "league-select" : "league-input");
    });
    team.querySelector(".team-class-select").setAttribute("aria-label", `チーム${index + 1}の学級`);
    team.querySelector(".entry-label").setAttribute("aria-label", `チーム${index + 1}の区分`);
    team.querySelector(".league-teams").setAttribute("aria-label", `チーム${index + 1}の表示名`);
    const remove = team.querySelector(".remove-team");
    remove.classList.remove("filter", "filterhover");
    if (remove.textContent !== "−") remove.textContent = "−";
    remove.title = "チームを削除";
    remove.setAttribute("aria-label", `チーム${index + 1}を削除`);
  });
  drawLeague(league);
}

function enhanceLeague(league) {
  if (league.classList.contains("direct-tournament-entries")) return;
  if (states.has(league)) return;
  const row = league.querySelector(".league-row");
  const teams = league.querySelector(".teams-wrap");
  const add = league.querySelector(".add-team");
  if (!row || !teams || !add) return;
  league.classList.add("visual-league-wrap");
  const remove = row.querySelector(".remove-league");
  remove.textContent = "グループを削除";
  remove.classList.remove("filterhover");
  const figure = document.createElement("div");
  figure.className = "visual-league-figure";
  figure.innerHTML = '<svg class="visual-league-svg" viewBox="0 0 100 100" aria-hidden="true"></svg><div class="visual-league-vertices"></div><div class="visual-league-center"></div>';
  const name = row.querySelector(".sport-leagues");
  name.classList.remove("filter");
  name.classList.add("league-input");
  name.setAttribute("aria-label", "グループ名");
  figure.querySelector(".visual-league-center").append(name);
  const setting = document.createElement("label");
  setting.className = "square-match-setting";
  setting.append(document.createTextNode("対戦方式"));
  const mode = document.createElement("select");
  mode.className = "square-match-mode league-select";
  mode.innerHTML = '<option value="2">各チーム2試合ずつ行う</option><option value="3" selected>各チーム3試合ずつ行う（総当たり）</option>';
  setting.append(mode);
  const advancement = document.createElement("label");
  advancement.className = "league-advance-setting";
  advancement.innerHTML = '決勝進出チーム数<input class="league-advance-count league-input" type="number" min="0" max="256" step="1" value="0">';
  mode.addEventListener("change", () => drawLeague(league));
  row.replaceChildren(remove);
  league.replaceChildren(row, figure, setting, advancement, teams, add);
  states.set(league, { teams, svg: figure.querySelector("svg"), vertices: figure.querySelector(".visual-league-vertices"), setting, mode });
  teams.addEventListener("change", () => drawLeague(league));
  const observer = new MutationObserver(() => prepareTeams(league));
  observer.observe(teams, { childList: true, subtree: true });
  states.get(league).observer = observer;
  prepareTeams(league);
}

const root = document.getElementById("sports-root");
function refresh() {
  root.querySelectorAll(".league-wrap").forEach(enhanceLeague);
}
new MutationObserver(mutations => {
  for (const mutation of mutations) {
    for (const node of mutation.removedNodes) {
      if (!(node instanceof HTMLElement) || node.isConnected) continue;
      const leagues = node.matches(".league-wrap") ? [node] : node.querySelectorAll(".league-wrap");
      leagues.forEach(league => states.get(league)?.observer.disconnect());
    }
  }
  refresh();
}).observe(root, { childList: true, subtree: true });
refresh();
