import { generateTournamentData } from './tournament-data.js';
import { visualLeaguePoints } from './league-pairs.js';
const NS = 'http://www.w3.org/2000/svg';
function svgNode(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function canvas(width, height, title) {
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title, class: 'document-diagram' });
  svg.append(svgNode('title', {}, title));
  const id = 'gold-' + crypto.randomUUID();
  const defs = svgNode('defs'), gradient = svgNode('linearGradient', { id, x2: '100%', y2: '100%' });
  ['#9b7423','#f5e4a3','#b28c38','#fff0b7','#a78029'].forEach((color, i) => gradient.append(svgNode('stop', { offset: `${i * 25}%`, 'stop-color': color })));
  defs.append(gradient); svg.append(defs); svg.dataset.frame = `url(#${id})`; return svg;
}
function box(svg, text, x, y, width = 140) {
  svg.append(svgNode('rect', { x, y: y - 18, width, height: 36, rx: 6, fill: 'white', stroke: svg.dataset.frame, 'stroke-width': 2.5 }));
  label(svg, text, x + width / 2, y + 5, 'middle');
}
function label(svg, text, x, y, anchor = 'start') {
  svg.append(svgNode('text', { x, y, 'text-anchor': anchor, 'font-size': 14, fill: '#17223b' }, text));
}
export function leagueDiagram(league, matches) {
  const count = league.teams.length, width = 500, height = 420;
  const svg = canvas(width, height, league.leagueName + ' 対戦表');
  const points = visualLeaguePoints(count).map((point, i) => ({ x: 70 + point.x * 3.6, y: 30 + point.y * 3.6, team: league.teams[i] }));
  for (const match of league.matches) {
    const a = points.find(p => p.team.teamId === match.teamAId), b = points.find(p => p.team.teamId === match.teamBId);
    if (!a || !b) continue;
    svg.append(svgNode('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#a32b2b', 'stroke-width': 2 }));
    const result = matches.find(row => [String(row.team_a), String(row.team_b)].sort().join('|') === [a.team.teamId, b.team.teamId].sort().join('|'));
    if (result) label(svg, String(result.team_a) === a.team.teamId ? `${result.score_a}:${result.score_b}` : `${result.score_b}:${result.score_a}`, (a.x + b.x) / 2, (a.y + b.y) / 2, 'middle');
  }
  points.forEach(p => {
    box(svg, p.team.teamName, p.x - 60, p.y, 120);
  }); return svg;
}
export function bracketDiagram(sport) {
  const teams = sport.tournament.teams;
  if (!teams.length) {
    const svg = canvas(500, 90, sport.sportName + ' トーナメント');
    label(svg, '出場枠は未設定です。基本設定で進出枠を設定してください。', 12, 45);
    return svg;
  }
  const data = generateTournamentData({ teams, startPoints: teams.map((team, i) => ({ x: 170, y: 50 + i * 60 })), prefix: sport.sportId + '-bracket', step: 110, thirdPlace: sport.tournament.thirdPlace, seedOrder: sport.tournamentSettings?.seedOrder ?? [] });
  const svg = canvas(data.geometry.width, data.geometry.height, sport.sportName + ' トーナメント');
  for (const [a, b] of data.drawPairs) {
    const p = data.points[a], q = data.points[b];
    svg.append(svgNode('path', { d: `M ${p.x} ${p.y} V ${q.y} H ${q.x}`, fill: 'none', stroke: '#a32b2b', 'stroke-width': 2 }));
  }
  teams.forEach((team, i) => box(svg, team.teamName, 10, 50 + i * 60, 160));
  for (const match of data.matchPairs) {
    const point = data.points[match.winnerPointId], result = sport.resolved.find(row => row.matchId === match.matchId);
    label(svg, result?.result ? `${result.result.scoreA} : ${result.result.scoreB}` : `第${match.order}試合`, point.x - 55, point.y - 10, 'middle');
    if (match.label === 'Third place') {
      const a = data.points['third-a'], b = data.points['third-b'];
      label(svg, '3位決定戦', a.x - 160, 28);
      box(svg, result?.teamA?.teamName ?? '準決勝1の敗者', data.points['third-start-a'].x - 160, a.y, 160);
      box(svg, result?.teamB?.teamName ?? '準決勝2の敗者', data.points['third-start-b'].x - 160, b.y, 160);
      label(svg, '3位', point.x + 8, point.y + 5);
    }
  }
  if (data.champion) { const point = data.points[data.champion.pointId]; label(svg, '優勝', point.x + 8, point.y + 5); }
  return svg;
}
