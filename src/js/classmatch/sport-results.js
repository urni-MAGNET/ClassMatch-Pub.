import { calculateOverallPoints, normalizeSport } from "./profile.js";

const normalizedType = match => String(match.match_type || "").normalize("NFKC").replace(/\s/g, "").toLowerCase();
const hasScore = value => value !== null && value !== undefined && value !== "";
const hasResultScore = match => hasScore(match.score_a) && hasScore(match.score_b);
const includesAny = (value, words) => words.some(word => value.includes(word));

const isThirdPlace = match => includesAny(normalizedType(match), [
  "\u4e09\u4f4d\u6c7a\u5b9a",
  "3\u4f4d\u6c7a\u5b9a",
  "\uff13\u4f4d\u6c7a\u5b9a",
  "3\u6c7a",
  "\uff13\u6c7a",
  "thirdplace",
  "third-place",
  "3rdplace",
  "3rd-place"
]);
const isSemiFinal = match => includesAny(normalizedType(match), [
  "\u6e96\u6c7a\u52dd",
  "\u6e96\u6c7a",
  "semifinal",
  "semi-final"
]);
const isQuarterFinal = match => includesAny(normalizedType(match), [
  "\u6e96\u3005\u6c7a\u52dd",
  "\u6e96\u3005\u6c7a",
  "\u6e96\u6e96\u6c7a\u52dd",
  "\u6e96\u6e96\u6c7a",
  "quarterfinal",
  "quarter-final"
]);
const isBest8Qualifier = match => {
  const type = normalizedType(match);
  return includesAny(type, ["\u30d9\u30b9\u30c88", "\u30d9\u30b9\u30c8\uff18", "best8", "top8"])
    || type === "\u6c7a\u52dd\u30c8\u30fc\u30ca\u30e1\u30f3\u30c8";
};
const isFinal = match => {
  const type = normalizedType(match);
  const finalWithoutTournament = type
    .replaceAll("\u6c7a\u52dd\u30c8\u30fc\u30ca\u30e1\u30f3\u30c8", "")
    .replaceAll("\u30c8\u30fc\u30ca\u30e1\u30f3\u30c8", "");
  return !isThirdPlace(match) && !isSemiFinal(match) && !isQuarterFinal(match)
    && !isBest8Qualifier(match)
    && (
      finalWithoutTournament === "\u6c7a\u52dd"
      || finalWithoutTournament === "\u6c7a\u52dd\u6226"
      || includesAny(type, ["\u512a\u52dd\u6c7a\u5b9a", "\u512a\u52dd\u6c7a\u5b9a\u6226", "\u30d5\u30a1\u30a4\u30ca\u30eb", "grandfinal", "grand-final", "championship"])
      || type === "final"
      || type === "finals"
    );
};
export const isTournamentMatch = match => isFinal(match) || isThirdPlace(match) || isSemiFinal(match)
  || isQuarterFinal(match) || isBest8Qualifier(match)
  || includesAny(normalizedType(match), ["tournament", "\u30c8\u30fc\u30ca\u30e1\u30f3\u30c8"]);

function sportTeams(sport, leagues = [], teams = []) {
  const ids = new Set(leagues
    .filter(league => league.sport === sport.name)
    .map(league => String(league.id)));
  return teams.filter(team => ids.has(String(team.leagues_id)));
}

export function buildStats(sport, leagues = [], teams = [], matches = []) {
  const rows = sportTeams(sport, leagues, teams);
  const stats = new Map(rows.map(team => [String(team.id), {
    teamId: String(team.id),
    wins: 0,
    winsWithoutThirdPlace: 0,
    leagueWins: 0,
    tournamentWins: 0,
    tournamentWinsWithoutThirdPlace: 0,
    thirdPlaceWins: 0,
    finalTournamentParticipant: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    leagueGoalsFor: 0,
    leagueGoalsAgainst: 0,
    matchesPlayed: 0,
    headToHead: {}
  }]));

  matches.filter(match => match.match_game === sport.name).forEach(match => {
    const a = stats.get(String(match.team_a));
    const b = stats.get(String(match.team_b));
    if (isTournamentMatch(match)) { if (a) a.finalTournamentParticipant = 1; if (b) b.finalTournamentParticipant = 1; }
    if (!a || !b || !hasResultScore(match)) return;

    const scoreA = Number(match.score_a) || 0;
    const scoreB = Number(match.score_b) || 0;
    a.matchesPlayed += 1;
    b.matchesPlayed += 1;
    a.goalsFor += scoreA;
    a.goalsAgainst += scoreB;
    b.goalsFor += scoreB;
    b.goalsAgainst += scoreA;

    const tournament = isTournamentMatch(match);
    if (!tournament) {
      a.leagueGoalsFor += scoreA;
      a.leagueGoalsAgainst += scoreB;
      b.leagueGoalsFor += scoreB;
      b.leagueGoalsAgainst += scoreA;
    }

    const winner = stats.get(String(match.winner));
    if (!winner) return;

    winner.wins += 1;
    if (!isThirdPlace(match)) winner.winsWithoutThirdPlace += 1;

    if (tournament) {
      winner.tournamentWins += 1;
      if (isThirdPlace(match)) winner.thirdPlaceWins += 1;
      else winner.tournamentWinsWithoutThirdPlace += 1;
    } else {
      winner.leagueWins += 1;
    }

    const loserId = String(match.winner) === String(match.team_a) ? String(match.team_b) : String(match.team_a);
    if (!tournament) winner.headToHead[loserId] = (winner.headToHead[loserId] || 0) + 1;
  });

  return [...stats.values()];
}

export function compareLeague(a, b, rules = []) {
  for (const rule of rules) {
    if (rule === "wins" && b.leagueWins !== a.leagueWins) return b.leagueWins - a.leagueWins;
    if (rule === "goalDifference") {
      const diff = (b.leagueGoalsFor - b.leagueGoalsAgainst) - (a.leagueGoalsFor - a.leagueGoalsAgainst);
      if (diff) return diff;
    }
    if (rule === "goalsFor" && b.leagueGoalsFor !== a.leagueGoalsFor) return b.leagueGoalsFor - a.leagueGoalsFor;
    if (rule === "headToHead") {
      const aWins = a.headToHead[b.teamId] || 0;
      const bWins = b.headToHead[a.teamId] || 0;
      if (aWins !== bWins) return bWins - aWins;
    }
  }
  return 0;
}

function compareFallback(a, b, rules = []) {
  for (const rule of rules) {
    if (rule === "wins" && b.wins !== a.wins) return b.wins - a.wins;
    if (rule === "goalDifference") {
      const diff = (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst);
      if (diff) return diff;
    }
    if (rule === "goalsFor" && b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    if (rule === "headToHead") {
      const aWins = a.headToHead[b.teamId] || 0;
      const bWins = b.headToHead[a.teamId] || 0;
      if (aWins !== bWins) return bWins - aWins;
    }
  }
  return b.goalsFor - a.goalsFor || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst);
}

function matchLoser(match) {
  if (!match?.winner) return null;
  return String(match.winner) === String(match.team_a) ? match.team_b : match.team_a;
}

function setTournamentPlacements(sport, rows, matches = []) {
  if (!sport.tournament.enabled || !sport.tournament.placementAutoDetect) return new Set();
  const byTeam = new Map(rows.map(row => [row.teamId, row]));
  const sportMatches = matches.filter(match => match.match_game === sport.name && hasResultScore(match));
  const assigned = new Set();

  const assignMatch = (match, winnerRank, loserRank) => {
    if (!match?.winner) return;
    const winner = byTeam.get(String(match.winner));
    const loser = byTeam.get(String(matchLoser(match)));
    if (winner) {
      winner.rank = winnerRank;
      assigned.add(winner.teamId);
    }
    if (loser) {
      loser.rank = loserRank;
      assigned.add(loser.teamId);
    }
  };

  const final = sportMatches.find(isFinal);
  if (!final) return new Set();
  assignMatch(final, 1, 2);

  const third = sportMatches.find(isThirdPlace);
  if (third) {
    assignMatch(third, 3, 4);
  } else {
    sportMatches.filter(isSemiFinal).map(matchLoser).filter(id => byTeam.has(String(id))).forEach(id => {
      const row = byTeam.get(String(id));
      row.rank = 3;
      assigned.add(row.teamId);
    });
  }

  const assignRankList = (ids, startRank) => {
    [...new Set(ids.map(String))]
      .map(id => byTeam.get(id))
      .filter(row => row && !assigned.has(row.teamId))
      .sort((a, b) => compareFallback(a, b, sport.rankingRule.league))
      .forEach((row, index) => {
        row.rank = startRank + index;
        assigned.add(row.teamId);
      });
  };

  assignRankList(sportMatches.filter(isQuarterFinal).map(matchLoser).filter(Boolean), 5);
  if (![...assigned].some(id => {
    const rank = byTeam.get(id)?.rank;
    return rank >= 5 && rank <= 8;
  })) {
    assignRankList(sportMatches.filter(isBest8Qualifier).map(match => match.winner).filter(Boolean), 5);
  }

  return assigned;
}

function rankEq(rows, valueSelector) {
  const sortedValues = rows.map(valueSelector).sort((a, b) => b - a);
  rows.forEach(row => { row.winRank = sortedValues.indexOf(valueSelector(row)) + 1; });
}

export function buildSportResultsPayload({ semesterId, sports = [], leagues = [], teams = [], matches = [], sportId = null, overrides = [] }) {
  const payload = [];
  sports.forEach((rawSport, index) => {
    const sport = normalizeSport(rawSport, index);
    if (sportId !== null && sport.id !== sportId) return;

    const rows = buildStats(sport, leagues, teams, matches);
    const manualFor = row => overrides.find(item => item.sport_id === sport.id && String(item.team_id) === row.teamId);
    const participates = row => row.matchesPlayed > 0 || manualFor(row)?.manual_points != null || manualFor(row)?.manual_rank != null;
    const participatedRows = rows
      .filter(participates)
      .sort((a, b) => compareLeague(a, b, sport.rankingRule.league));
    participatedRows.forEach((row, rowIndex) => { row.rank = rowIndex + 1; });

    const assigned = setTournamentPlacements(sport, participatedRows, matches);
    const assignedRanks = participatedRows.filter(row => assigned.has(row.teamId)).map(row => row.rank || 0);
    let nextRank = assignedRanks.length ? Math.max(...assignedRanks) + 1 : 1;
    participatedRows
      .filter(row => !assigned.has(row.teamId))
      .sort((a, b) => compareFallback(a, b, sport.rankingRule.league))
      .forEach(row => { row.rank = nextRank++; });

    rankEq(participatedRows, row => row.wins);
    const teamCount = participatedRows.length;

    rows.forEach(row => {
      const participated = participates(row);
      const formulaInput = {
        rank: manualFor(row)?.manual_rank ?? row.rank,
        finalTournamentParticipant: row.finalTournamentParticipant,
        wins: row.wins,
        tournamentWins: row.tournamentWins,
        winsWithoutThirdPlace: row.winsWithoutThirdPlace,
        tournamentWinsWithoutThirdPlace: row.tournamentWinsWithoutThirdPlace,
        thirdPlaceWins: row.thirdPlaceWins,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        winRank: row.winRank,
        teamCount,
        participated
      };
      payload.push({
        semester_id: String(semesterId),
        sport_id: sport.id,
        team_id: row.teamId,
        rank: participated ? row.rank : null,
        wins: row.wins,
        tournament_wins: row.tournamentWins,
        participated,
        goals_for: row.goalsFor,
        goals_against: row.goalsAgainst,
        win_rank: participated ? row.winRank : null,
        team_count: teamCount,
        calculated_points: participated ? calculateOverallPoints(sport, formulaInput) : 0
      });
    });
  });
  return payload;
}
