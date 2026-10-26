import { node } from '/src/js/common.js';
import { loadTournament, saveConfig } from './tournament-store.js';
import { tournamentRuntime } from '/src/js/classmatch/tournament-runtime.js';
import { matchType } from '/src/js/classmatch/bracket-state.js';

const id = new URLSearchParams(location.search).get('semester_id');
const root = document.createElement('section'); root.className = 'filter tournament-operations';
root.innerHTML = '<h2>トーナメント試合結果</h2><p>先行する試合の結果を変更すると、影響する後続試合の結果は無効になります。</p><p role="status"></p><div class="brackets"></div>';
document.getElementById('tournament-settings').before(root);
const status = root.querySelector('[role=status]');
const content = root.querySelector('.brackets');
let data, runtime, saving = false;
const action = (label, fn) => { const button = node('button', label); button.type = 'button'; button.onclick = fn; return button; };
async function persist(change) {
  if (saving) return; saving = true; root.inert = true;
  let committed = false;
  try {
    const config = structuredClone(data.semester.sports_config);
    config.bracketResults = Object.fromEntries(runtime.structure.sports.map(sport => [sport.sportId, sport.records]));
    change(config);
    const next = tournamentRuntime({ ...data, semester: { ...data.semester, sports_config: config } }, { results: config.bracketResults });
    config.bracketResults = Object.fromEntries(next.structure.sports.map(sport => [sport.sportId, Object.fromEntries(sport.resolved.filter(match => match.result).map(match => [match.matchId, match.result]))]));
    data.semester.sports_config = await saveConfig(id, config, config.revision ?? 0, next.effectiveMatches);
    committed = true;
    await load(); status.textContent = '保存しました。';
    window.dispatchEvent(new CustomEvent('classmatch:sports-config-updated'));
    window.dispatchEvent(new CustomEvent('classmatch:matches-updated', { detail: { source: 'bracket' } }));
  } catch (error) { if (committed) await load().catch(() => {}); status.textContent = error.message; }
  finally { saving = false; root.inert = false; }
}
function selection(teams, value, onChange) {
  const select = document.createElement('select');
  teams.forEach(team => select.add(new Option(team.teamName, team.teamId)));
  select.value = value; select.onchange = () => onChange(select.value); return select;
}
function render() {
  content.replaceChildren();
  for (const sport of runtime.structure.sports) {
    const section = node('section'); section.append(node('h3', sport.sportName)); content.append(section);
    for (const warning of sport.warnings) section.append(node('p', warning));
    for (const league of sport.standings.filter(item => item.complete && item.advanceTeams)) {
      const details = node('details'); details.append(node('summary', `${league.leagueName} 同率時の優先順`));
      const order = league.ranked.map(row => row.teamId);
      order.forEach((teamId, index) => {
        const label = node('label', `${index + 1}位 `);
        const select = selection(league.teams, teamId, value => {
          const other = order.indexOf(value); [order[index], order[other]] = [order[other], order[index]];
          [...details.querySelectorAll('select')].forEach((control, i) => control.value = order[i]);
        }); label.append(select); details.append(label);
      });
      details.append(action('同率時の優先順を保存', () => persist(config => { (config.leagueOrders ??= {})[league.leagueId] = order; })));
      section.append(details);
    }
    if (!sport.tournament.enabled) { section.append(node('p', 'トーナメントは使用しません。')); continue; }
    const rounds = node('div'); rounds.className = 'bracket-rounds'; section.append(rounds);
    for (let round = 1; round <= sport.tournament.roundCount; round++) {
      const column = node('div'); column.className = 'bracket-round'; column.append(node('h4', round === sport.tournament.roundCount ? '決勝・3位決定戦' : `第${round}回戦`)); rounds.append(column);
      for (const match of sport.resolved.filter(item => item.round === round)) {
        const form = node('form'); form.className = 'bracket-match'; form.append(node('strong', matchType(match, sport.tournament.roundCount)));
        for (const [side, team] of [['A', match.teamA], ['B', match.teamB]]) {
          const label = node('label', team?.teamName ?? '先行結果待ち');
          const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = '1'; input.required = true; input.name = side; input.value = match.result?.[`score${side}`] ?? ''; label.append(input); form.append(label);
        }
        const tieLabel = node('label', '同点時の勝者'); const tie = selection([{ teamId: '', teamName: '選択してください' }, ...[match.teamA, match.teamB].filter(Boolean)], match.result?.winnerId ?? '', () => {}); tie.name = 'winner'; tieLabel.append(tie); form.append(tieLabel);
        const submit = node('button', '結果を保存'); submit.type = 'submit'; submit.disabled = !match.teamA || !match.teamB; form.append(submit);
        if (match.result) form.append(action('結果を取り消す', () => persist(config => { delete config.bracketResults[sport.sportId][match.matchId]; })));
        form.onsubmit = event => { event.preventDefault(); const values = new FormData(form); const scoreA = Number(values.get('A')), scoreB = Number(values.get('B'));
          if (scoreA === scoreB && !values.get('winner')) { status.textContent = '同点時は勝者を選んでください。'; return; }
          persist(config => { ((config.bracketResults ??= {})[sport.sportId] ??= {})[match.matchId] = { identity: match.identity, scoreA, scoreB, winnerId: values.get('winner'), playedAt: new Date().toISOString() }; });
        };
        column.append(form);
      }
    }
  }
}
async function load() { data = await loadTournament(id); runtime = tournamentRuntime(data); render(); }
window.addEventListener('classmatch:matches-updated', event => { if (event.detail?.source !== 'bracket') load().catch(error => status.textContent = error.message); });
if (id) load().catch(error => status.textContent = error.message);
