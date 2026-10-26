import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScoreFormula, parseScoreFormula } from '../src/js/classmatch/score-formula.js';
import { normalizeSport, validateProfile, calculateOverallPoints } from '../src/js/classmatch/profile.js';
import { generateTournamentData } from '../src/js/classmatch/tournament-data.js';
import { arrangeEntrants, resolveBracket } from '../src/js/classmatch/bracket-state.js';
import { validateSetup, restoreSetup } from '../src/js/classmatch/tournament-setup.js';
import { tournamentRuntime } from '../src/js/classmatch/tournament-runtime.js';
const teams = count => Array.from({ length: count }, (_, i) => ({ teamId: `t${i + 1}`, teamName: `T${i + 1}` }));

test('Japanese and legacy formulas, precedence, short circuit and diagnostics', () => {
  const values = { top4: 1, wins: 3, teamCount: 8, rank: 2 };
  assert.equal(evaluateScoreFormula('もし(ベスト4, 勝利数 * 10 + 参加チーム数 * 8 / 順位, 0)', values), 62);
  assert.equal(evaluateScoreFormula('if(top4, wins * 10 + teamCount * 8 / rank, 0)', values), 62);
  assert.equal(evaluateScoreFormula('最大(2, 最小(10, 3)) + 2 * (4 - 1)'), 9);
  assert.equal(evaluateScoreFormula('もし(順位 > 0 かつ 順位 <= 4, 8 / 順位, 0)', { rank: 0 }), 0);
  assert.equal(evaluateScoreFormula('1 || 1 / 0'), 1);
  assert.equal(evaluateScoreFormula('!(1 != 1) && 2 >= 1'), 1);
  for (const source of ['1/0', 'max()', 'if(1,2)', 'round(1,2)', 'unknown', 'constructor(1)', 'wins.__proto__', '(()=>1)()', '1;alert(1)', '1 +', 'もし(1,2,未知)']) assert.throws(() => evaluateScoreFormula(source, values), undefined, source);
  assert.doesNotThrow(() => parseScoreFormula('もし(順位 > 0, 8 / 順位, 0)'));
  const formula = 'if(winRank <= 8, wins * 10 + teamCount * 8 / winRank, 0)';
  assert.equal(normalizeSport({ scoreRule: { formula } }).scoreRule.formula, formula);
});

test('optional match duration round trip and invalid duration', () => {
  assert.equal(normalizeSport({}).timing.matchMinutes, null);
  const profile = validateProfile({ sports: [{ name: 'S', timing: { matchMinutes: 12 }, tournament: { thirdPlace: true } }] });
  assert.equal(validateProfile(JSON.parse(JSON.stringify(profile))).sports[0].timing.matchMinutes, 12);
  for (const value of [0, -1, 1.5, 'bad']) assert.throws(() => validateProfile({ sports: [{ timing: { matchMinutes: value } }] }));
});

test('every size through 256: n-1 matches, no repeated byes, seeded distribution', () => {
  for (let n = 2; n <= 256; n++) {
    const bracket = generateTournamentData({ teams: teams(n), seedOrder: ['t1', 't2', 't3', 't4'] });
    assert.equal(bracket.totalMatches, n - 1);
    assert.equal(bracket.roundCount, Math.ceil(Math.log2(n)));
    assert.equal(bracket.rounds[0].seeds.length, 2 ** Math.ceil(Math.log2(n)) - n);
    assert.ok(bracket.rounds.slice(1).every(round => round.seeds.length === 0));
    assert.ok(bracket.matchPairs.every(match => match.teamAId !== match.teamBId));
    assert.equal(new Set(bracket.rounds[0].matches.flatMap(match => [match.teamAId, match.teamBId]).concat(bracket.rounds[0].seeds.map(seed => seed.teamId))).size, n);
  }
});

test('semifinal changes invalidate final and third place, persist via JSON, safe changes to entrants', () => {
  const bracket = generateTournamentData({ teams: teams(4), thirdPlace: true });
  assert.equal(bracket.totalMatches, 4);
  const results = {};
  for (const source of bracket.matchPairs) {
    const match = resolveBracket(bracket, results).matches.find(item => item.matchId === source.matchId);
    results[source.matchId] = { identity: match.identity, scoreA: 2, scoreB: 0 };
  }
  let resolved = resolveBracket(bracket, JSON.parse(JSON.stringify(results)));
  assert.equal(resolved.invalidated.length, 0);
  assert.deepEqual(resolved.matches.at(-1).teamA.teamId, 't2');
  results[bracket.matchPairs[0].matchId].scoreB = 3;
  resolved = resolveBracket(bracket, results);
  assert.equal(resolved.invalidated.length, 2);
  assert.equal(resolved.matches.at(-1).teamA.teamId, 't1');
  assert.equal(resolved.matches.at(-1).result, null);
  const changed = generateTournamentData({ teams: [teams(4)[3], ...teams(4).slice(0, 3)], thirdPlace: true });
  assert.ok(resolveBracket(changed, results).invalidated.length >= 2);
  assert.equal(generateTournamentData({ teams: teams(3), thirdPlace: true }).thirdPlaceMatch, null);
  assert.equal(arrangeEntrants(teams(3), ['t1', 't1', 't2']).invalid, true);
  assert.equal(arrangeEntrants(teams(3), ['t3', 't2', 't1']).teams[0].teamId, 't3');
});

test('incomplete setup produces warnings, corrupt references produce errors', () => {
  const setup = { name: '2026', classes: [], input: { profile: { sports: [{ name: 'S' }] }, sports: [{ sportId: 's', leagues: [] }] } };
  assert.equal(validateSetup(setup).errors.length, 0);
  assert.ok(validateSetup(setup).warnings.length >= 3);
  setup.input.sports[0].leagues = [{ leagueId: 'l', teams: [{ teamId: 't', teamName: 'T', classId: 'missing' }] }];
  assert.match(validateSetup(setup).errors.join(), /学級/);
});

test('relational edits restore actual values and runtime managed results use real team IDs', () => {
  const sport = normalizeSport({ id: 's', name: 'S', format: 'tournament', tournament: { advanceTeams: 4, enabled: true, thirdPlace: true }, scoreRule: { type: 'formula', formula: 'もし(順位 > 0, 10 / 順位, 0)' } });
  const data = { semester: { id: 1, name: '2026', sports_config: { sports: [sport] } }, leagues: [{ id: 10, sport: 'S', league_name: '参加チーム' }], teams: teams(4).map((team, i) => ({ id: i + 1, leagues_id: 10, teams_name: team.teamName })), matches: [], classes: [], branches: [] };
  const setup = restoreSetup(data); assert.equal(setup.input.sports[0].leagues[0].teams[0].dbId, '1');
  let runtime = tournamentRuntime(data); const first = runtime.structure.sports[0].resolved[0];
  data.matches.push({ bracket_key: first.matchId, bracket_identity: first.identity, team_a: '1', team_b: '2', score_a: 2, score_b: 0, winner: '1', match_game: 'S', match_type: '準決勝' });
  runtime = tournamentRuntime(data); assert.equal(runtime.effectiveMatches.length, 1); assert.equal(runtime.structure.sports[0].resolved[0].winner.teamId, '1');
  assert.equal(calculateOverallPoints(sport, { rank: 2 }), 5);
});

test('league qualifiers: manual slots persist, changed league results invalidate progression and ties wait', () => {
  const sport = normalizeSport({ id: 's', name: 'S', format: 'league_then_tournament', rankingRule: { league: ['wins', 'goalDifference', 'manual'] }, tournament: { enabled: true, advanceTeams: 4, thirdPlace: true } });
  const data = { semester: { id: 1, name: '2026', sports_config: { sports: [sport] } }, leagues: [{ id: 10, sport: 'S', league_name: 'A' }, { id: 20, sport: 'S', league_name: 'B' }], teams: teams(4).map((team, i) => ({ id: String(i + 1), leagues_id: i < 2 ? 10 : 20, teams_name: team.teamName })), classes: [], branches: [], matches: [
    { id: 1, match_game: 'S', match_type: '予選', team_a: '1', team_b: '2', score_a: 2, score_b: 0, winner: '1' },
    { id: 2, match_game: 'S', match_type: '予選', team_a: '3', team_b: '4', score_a: 3, score_b: 0, winner: '3' }
  ] };
  data.semester.sports_config.setup = restoreSetup(data);
  data.semester.sports_config.setup.input.sports[0].leagues.forEach(league => league.advanceTeams = 2);
  let runtime = tournamentRuntime(data);
  assert.deepEqual(runtime.structure.sports[0].candidates.map(team => team.teamId), ['1', '3', '2', '4']);
  data.semester.sports_config.bracketSlots = { s: ['4', '1', '3', '2'] };
  runtime = tournamentRuntime(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(runtime.structure.sports[0].tournament.teams.map(team => team.teamId), ['4', '1', '3', '2']);
  const match = runtime.structure.sports[0].resolved[0];
  data.matches.push({ bracket_key: match.matchId, bracket_identity: match.identity, team_a: '4', team_b: '1', score_a: 2, score_b: 0, winner: '4', match_game: 'S', match_type: '準決勝' });
  assert.equal(tournamentRuntime(data).structure.sports[0].resolved[0].winner.teamId, '4');
  // The qualified set changes when the configured advancing count changes.
  data.semester.sports_config.setup.input.sports[0].leagues[0].advanceTeams = 1;
  runtime = tournamentRuntime(data);
  assert.ok(runtime.structure.sports[0].warnings.some(warning => warning.includes('手動配置')));
  assert.equal(runtime.effectiveMatches.filter(match => match.managed).length, 0);
  data.matches[0].score_a = 0; data.matches[0].winner = null;
  runtime = tournamentRuntime(data);
  assert.ok(runtime.structure.sports[0].warnings.some(warning => warning.includes('同率')));
  assert.ok(runtime.structure.sports[0].candidates.some(team => team.placeholder));
  data.semester.sports_config.leagueOrders = { '10': ['2', '1'] };
  assert.equal(tournamentRuntime(data).structure.sports[0].candidates[0].teamId, '2');
});
