import { loadTournament, saveConfig } from './tournament-store.js';
import { tournamentRuntime } from '/src/js/classmatch/tournament-runtime.js';

export async function reconcileTournamentResults(id) {
  const data = await loadTournament(id);
  const config = data.semester.sports_config ?? { sports: [] };
  const runtime = tournamentRuntime(data);
  config.bracketResults = Object.fromEntries(runtime.structure.sports.map(sport => [sport.sportId, Object.fromEntries(sport.resolved.filter(match => match.result).map(match => [match.matchId, match.result]))]));
  if (data.matches.some(match => match.bracket_key)) await saveConfig(id, config, config.revision ?? 0, runtime.effectiveMatches);
  window.dispatchEvent(new CustomEvent('classmatch:matches-updated'));
  window.dispatchEvent(new CustomEvent('classmatch:sports-config-updated'));
}
