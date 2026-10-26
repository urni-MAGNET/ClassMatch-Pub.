import { restoreSetup } from './tournament-setup.js';
import { generateTournamentStructure } from './tournament-structure.js';
import { generateTournamentData } from './tournament-data.js';
import { arrangeEntrants, resolveBracket, matchType } from './bracket-state.js';
import { buildStats, compareLeague, isTournamentMatch } from './sport-results.js';
import { normalizeSport } from './profile.js';

export function tournamentRuntime(data, { results = null } = {}) {
  const config = data.semester.sports_config ?? {};
  const setup = restoreSetup(data);
  for (const sport of setup.input.sports) {
    const ids = new Map(sport.leagues.flatMap(league => league.teams.map(team => [team.teamId, String(team.dbId ?? team.teamId)])));
    for (const key of ['slotOrder','seedOrder']) if (sport.tournamentSettings?.[key]) sport.tournamentSettings[key] = sport.tournamentSettings[key].map(id => ids.get(id) ?? id);
    for (const league of sport.leagues) for (const team of league.teams) if (team.dbId) team.teamId = String(team.dbId);
  }
  const structure = generateTournamentStructure(setup.input);
  const effectiveMatches = data.matches.filter(match => !isTournamentMatch(match) && !match.bracket_key);
  for (const sport of structure.sports) {
    const settings = normalizeSport(setup.input.profile.sports.find(item => item.id === sport.sportId));
    const warnings = [...sport.warnings];
    const stats = buildStats(settings, data.leagues, data.teams, data.matches);
    const qualifiers = new Map();
    sport.standings = [];
    for (const league of sport.leagues) {
      const ids = new Set(league.teams.map(team => team.teamId));
      const order = config.leagueOrders?.[league.leagueId] ?? [];
      const manual = order.length === ids.size && new Set(order).size === ids.size && order.every(id => ids.has(id));
      const ranked = stats.filter(row => ids.has(row.teamId)).sort((a, b) => compareLeague(a, b, settings.rankingRule.league) || (manual ? order.indexOf(a.teamId) - order.indexOf(b.teamId) : a.teamId.localeCompare(b.teamId)));
      const complete = league.matches.length > 0 && league.matches.every(pair => data.matches.some(match => !isTournamentMatch(match) && match.match_game === sport.sportName &&
        [String(match.team_a), String(match.team_b)].sort().join('|') === [pair.teamAId, pair.teamBId].sort().join('|') &&
        match.score_a !== null && match.score_b !== null && match.score_a !== '' && match.score_b !== '' && Number.isFinite(Number(match.score_a)) && Number.isFinite(Number(match.score_b))));
      const tied = ranked.some((row, index) => index > 0 && index <= league.advanceTeams && compareLeague(ranked[index - 1], row, settings.rankingRule.league) === 0);
      sport.standings.push({ ...league, ranked, complete, tied: tied && !manual, order });
      if (league.advanceTeams && (!complete || (tied && !manual))) warnings.push(`${league.leagueName}: ${!complete ? 'リーグ結果が未確定です。' : '同率順位を手動で確定してください。'}`);
      if (complete && (!tied || manual)) ranked.slice(0, league.advanceTeams).forEach((row, index) => qualifiers.set(`${league.leagueId}:${index + 1}`, league.teams.find(team => team.teamId === row.teamId)));
    }
    const candidates = sport.tournament.teams.map(team => team.sourceLeagueId ? qualifiers.get(`${team.sourceLeagueId}:${team.sourceRank}`) ?? team : team);
    const arranged = arrangeEntrants(candidates, config.bracketSlots?.[sport.sportId] ?? []);
    if (arranged.invalid) warnings.push('進出チームが変わったため手動配置は無効です。自動配置に戻しています。');
    sport.candidates = candidates;
    const bracket = generateTournamentData({ teams: arranged.teams, sportId: sport.sportId, sportName: sport.sportName, prefix: `${sport.sportId}-bracket`, thirdPlace: sport.tournament.thirdPlace, seedOrder: config.bracketSeeds?.[sport.sportId] ?? sport.tournamentSettings.seedOrder ?? [] });
    sport.tournament = { ...bracket, enabled: sport.tournament.enabled };
    const records = results?.[sport.sportId] ?? Object.fromEntries(data.matches.filter(match => match.bracket_key && match.match_game === sport.sportName).map(match => [match.bracket_key, {
      identity: match.bracket_identity, teamAId: String(match.team_a), teamBId: String(match.team_b), scoreA: match.score_a == null ? NaN : Number(match.score_a), scoreB: match.score_b == null ? NaN : Number(match.score_b), winnerId: String(match.winner ?? ''), playedAt: match.played_at
    }]));
    sport.records = records;
    const resolved = resolveBracket(bracket, records);
    sport.resolved = resolved.matches;
    if (resolved.invalidated.length) warnings.push(`${resolved.invalidated.length}試合の古い結果を無効化しました。対戦相手・先行結果を確認して再入力してください。`);
    sport.warnings = warnings;
    const managed = Object.keys(records).length > 0;
    // Historical tournaments keep their original reporting path until a managed
    // bracket result exists. From then on only validated bracket results count.
    if (!managed) effectiveMatches.push(...data.matches.filter(match => !match.bracket_key && match.match_game === sport.sportName && isTournamentMatch(match)));
    for (const match of resolved.matches) if (match.result) effectiveMatches.push({
      id: match.matchId, semester_id: data.semester.id, match_game: sport.sportName,
      match_type: matchType(match, bracket.roundCount), team_a: match.teamA.teamId, team_b: match.teamB.teamId,
      score_a: match.result.scoreA, score_b: match.result.scoreB, winner: match.winner.teamId, played_at: match.result.playedAt, managed: true,
      bracket_key: match.matchId, bracket_identity: match.identity, bracket_dependencies: match.dependsOn
    });
  }
  return { structure, effectiveMatches };
}
