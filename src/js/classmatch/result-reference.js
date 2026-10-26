import { tournamentRuntime } from './tournament-runtime.js';
import { isTournamentMatch } from './sport-results.js';

export async function attachBracketReference(client, payload) {
  if (!isTournamentMatch(payload)) return payload;
  const requests = await Promise.all([
    client.from('semesters').select('*').eq('id', payload.semester_id).single(),
    client.from('leagues').select('*').eq('semester_id', payload.semester_id),
    client.from('matches').select('*').eq('semester_id', payload.semester_id)
  ]);
  for (const result of requests) if (result.error) throw result.error;
  const [semester, leagues, matches] = requests.map(result => result.data);
  if (!semester.sports_config?.setup) return payload;
  const teams = leagues.length ? await client.from('leagues_teams').select('*').in('leagues_id', leagues.map(row => row.id)) : { data: [] };
  if (teams.error) throw teams.error;
  const runtime = tournamentRuntime({ semester, leagues, matches, teams: teams.data, branches: [], classes: [] });
  const sport = runtime.structure.sports.find(item => item.sportName === payload.match_game);
  if (!sport?.tournament.enabled) return payload;
  const pair = [String(payload.team_a), String(payload.team_b)].sort().join('|');
  const match = sport.resolved.find(item => item.teamA && item.teamB && [item.teamA.teamId, item.teamB.teamId].sort().join('|') === pair);
  if (!match) throw new Error('この対戦はまだ確定していません。先行結果と大会の配置を確認してください。');
  if (match.result) throw new Error('この試合は登録済みです。大会運営・結果ページで編集してください。');
  const reversed = match.teamA.teamId !== String(payload.team_a);
  return { ...payload, team_a: match.teamA.teamId, team_b: match.teamB.teamId,
    score_a: reversed ? payload.score_b : payload.score_a, score_b: reversed ? payload.score_a : payload.score_b,
    bracket_key: match.matchId, bracket_identity: match.identity, bracket_dependencies: match.dependsOn };
}
