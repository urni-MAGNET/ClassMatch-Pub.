import { generateTournamentStructure } from './tournament-structure.js';
// Future rounds/league qualification slots deliberately have null participant IDs.
export function plannedMatches(input) {
 const structure=generateTournamentStructure(input);
 return structure.sports.flatMap(sport=>[
  ...sport.leagueMatchPairs.map(match=>({match_key:match.matchId,sport_id:sport.sportId,sport_name:sport.sportName,phase:'league',round:match.round,team_a:match.teamA?.placeholder?null:match.teamAId,team_b:match.teamB?.placeholder?null:match.teamBId,source_a:null,source_b:null,depends_on:[]})),
  ...sport.tournamentMatchPairs.map(match=>({match_key:match.matchId,sport_id:sport.sportId,sport_name:sport.sportName,phase:match.label==='Third place'?'third_place':sport.format==='tournament'?'tournament':'final_tournament',round:match.round,
   team_a:sport.format==='tournament'&&match.round===1&&!match.teamA.placeholder&&!match.teamA.sourceMatchId?match.teamAId:null,
   team_b:sport.format==='tournament'&&match.round===1&&!match.teamB.placeholder&&!match.teamB.sourceMatchId?match.teamBId:null,
   source_a:match.teamA.sourceMatchId?{matchId:match.teamA.sourceMatchId,outcome:match.teamA.sourceOutcome??'winner'}:match.teamA.sourceLeagueId?{leagueId:match.teamA.sourceLeagueId,rank:match.teamA.sourceRank}:null,
   source_b:match.teamB.sourceMatchId?{matchId:match.teamB.sourceMatchId,outcome:match.teamB.sourceOutcome??'winner'}:match.teamB.sourceLeagueId?{leagueId:match.teamB.sourceLeagueId,rank:match.teamB.sourceRank}:null,depends_on:match.dependsOn}))]);
}
