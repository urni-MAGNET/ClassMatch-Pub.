import { arrangeEntrants } from "./bracket-state.js";
import { generateVisualLeaguePairs } from "./league-pairs.js";
import { generateTournamentData } from "./tournament-data.js";
import { getSportCourts } from "./courts.js";

const STRUCTURE_SCHEMA_VERSION = 2;

function safeCount(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function selectLeaguePairs(teams, matchesPerTeam) {
  if (teams.length < 2) return { matches: [], matchesPerTeam: 0, appearances: new Map(teams.map(team => [team.teamId, 0])) };
  const maxMatchesPerTeam = teams.length - 1;
  const target = Math.min(safeCount(matchesPerTeam, maxMatchesPerTeam), maxMatchesPerTeam);
  const appearances = new Map(teams.map(team => [team.teamId, 0]));
  const matches = [];
  let round = 0;
  while (Math.min(...appearances.values()) < target) {
    const slots = [...teams];
    if (slots.length % 2) slots.push(null);
    const rotation = [...slots];
    const roundsNeeded = Math.ceil(target / (teams.length - 1));
    for (let cycle = 0; cycle < roundsNeeded; cycle += 1) {
      for (let roundInCycle = 0; roundInCycle < rotation.length - 1 && Math.min(...appearances.values()) < target; roundInCycle += 1) {
        let matchIndex = 0;
        for (let index = 0; index < rotation.length / 2; index += 1) {
          const teamA = rotation[index];
          const teamB = rotation[rotation.length - 1 - index];
          if (!teamA || !teamB || appearances.get(teamA.teamId) >= target || appearances.get(teamB.teamId) >= target) continue;
          matches.push({
            matchId: `league-${round + 1}-${++matchIndex}`,
            round: round + 1,
            teamAId: teamA.teamId,
            teamBId: teamB.teamId
          });
          appearances.set(teamA.teamId, appearances.get(teamA.teamId) + 1);
          appearances.set(teamB.teamId, appearances.get(teamB.teamId) + 1);
        }
        rotation.splice(1, 0, rotation.pop());
        round += 1;
      }
    }
    if (roundsNeeded === 0) break;
    if (Math.min(...appearances.values()) < target) {
      throw new Error(`各チーム${target}試合の対戦表を均等に作成できません。`);
    }
  }
  return { matches, matchesPerTeam: target, appearances };
}

function visualLeagueMatches(teams, pairs, prefix) {
  const rounds = [];
  return pairs.map(([a, b], index) => {
    let round = rounds.findIndex(used => !used.has(a) && !used.has(b));
    if (round < 0) { round = rounds.length; rounds.push(new Set()); }
    rounds[round].add(a);
    rounds[round].add(b);
    return { matchId: `${prefix}-m${index + 1}`, round: round + 1, teamAId: teams[a].teamId, teamBId: teams[b].teamId };
  }).sort((a, b) => a.round - b.round);
}

export function generateTournamentStructure(input = {}) {
  const profileSports = Array.isArray(input.profile?.sports) ? input.profile.sports : [];
  const sourceSports = Array.isArray(input.sports) ? input.sports : [];
  const sports = sourceSports.map((sourceSport, sportIndex) => {
    const profileSport = profileSports.find(item => item.id === sourceSport.sportId) ?? {};
    const requestedFormat = sourceSport.format ?? profileSport.format;
    const format = requestedFormat === "tornament" ? "tournament" : requestedFormat ?? "manual";
    const sportId = String(sourceSport.sportId ?? profileSport.id ?? `sport-${sportIndex + 1}`);
    const sportName = String(sourceSport.sportName ?? profileSport.name ?? "");
    const teams = (sourceSport.leagues ?? []).flatMap((league, leagueIndex) => (league.teams ?? []).map((team, teamIndex) => ({
      ...team,
      teamId: String(team.teamId || `${sportId}-league-${leagueIndex + 1}-team-${teamIndex + 1}`),
      classId: team.classId ? String(team.classId) : null,
      teamName: String(team.teamName ?? "").trim(),
      entryLabel: String(team.entryLabel ?? "").trim() || null,
      leagueId: String(league.leagueId ?? `${sportId}-league-${leagueIndex + 1}`),
      leagueName: String(league.leagueName ?? `グループ ${leagueIndex + 1}`), sportId, sportName
    })).filter(team => team.teamName));

    const matchesPerTeamSetting = sourceSport.leagueSettings?.matchesPerTeam ?? "all";
    const leagueSettings = {
      mode: matchesPerTeamSetting === "all" ? "round_robin" : "limited_round_robin",
      requestedMatchesPerTeam: matchesPerTeamSetting === "all" ? null : safeCount(matchesPerTeamSetting),
      finalistsPerLeague: safeCount(sourceSport.leagueSettings?.finalistsPerLeague)
    };

    const leagues = (sourceSport.leagues ?? []).map((league, leagueIndex) => {
      const leagueId = String(league.leagueId ?? `${sportId}-league-${leagueIndex + 1}`);
      const leagueName = String(league.leagueName ?? `グループ ${leagueIndex + 1}`);
      const leagueTeams = teams.filter(team => team.leagueId === leagueId);
      const requestedMatches = league.matchesPerTeam ?? matchesPerTeamSetting;
      const visualPairs = generateVisualLeaguePairs(leagueTeams.length, requestedMatches);
      // A four-team perimeter follows the same order as the visual vertices.
      const generated = format === "tournament" || league.drawMode === "entries" ? {
        matches: [], matchesPerTeam: 0, appearances: new Map(leagueTeams.map(team => [team.teamId, 0]))
      } : league.drawMode === "visual" ? {} : leagueTeams.length === 4 && Number(requestedMatches) === 2 ? {
        matches: leagueTeams.map((team, index) => ({
          matchId: `league-${index + 1}-1`, round: index % 2 + 1,
          teamAId: team.teamId, teamBId: leagueTeams[(index + 1) % 4].teamId
        })),
        matchesPerTeam: 2,
        appearances: new Map(leagueTeams.map(team => [team.teamId, 2]))
      } : selectLeaguePairs(
        leagueTeams,
        requestedMatches === "all" ? Math.max(0, leagueTeams.length - 1) : safeCount(requestedMatches)
      );
      if (league.drawMode === "visual" && format !== "tournament") {
        generated.matches = visualLeagueMatches(leagueTeams, visualPairs, `${sportId}-${leagueId}`);
        generated.appearances = new Map(leagueTeams.map(team => [team.teamId, 0]));
        generated.matches.forEach(match => {
          for (const id of [match.teamAId, match.teamBId]) generated.appearances.set(id, generated.appearances.get(id) + 1);
        });
        generated.matchesPerTeam = leagueTeams.length === 4 && Number(requestedMatches) !== 2 ? 3 : Math.min(2, Math.max(0, leagueTeams.length - 1));
      }
      const matches = generated.matches.map((match, index) => ({
        ...match, matchId: `${sportId}-${leagueId}-m${index + 1}`, order: index + 1,
        leagueId, leagueName, sportId, sportName,
        teamA: leagueTeams.find(team => team.teamId === match.teamAId),
        teamB: leagueTeams.find(team => team.teamId === match.teamBId)
      }));
      return {
        leagueId, leagueName, sportId, sportName, drawMode: league.drawMode ?? "round_robin",
        teams: leagueTeams,
        matchesPerTeam: Object.fromEntries(generated.appearances),
        requestedMatchesPerTeam: generated.matchesPerTeam,
        matches,
        totalMatches: matches.length,
        advanceTeams: Math.min(leagueTeams.length, safeCount(league.advanceTeams, leagueSettings.finalistsPerLeague))
      };
    });

    const tournamentEnabled = format === "tournament" || Boolean(sourceSport.tournamentSettings?.enabled ?? profileSport.tournament?.enabled);
    const requestedAdvance = safeCount(sourceSport.tournamentSettings?.advanceTeams, profileSport.tournament?.advanceTeams || 0);
    const qualifiers = [];
    for (let rank = 1; rank <= Math.max(0, ...leagues.map(league => league.advanceTeams)); rank += 1) {
      leagues.filter(league => rank <= league.advanceTeams).forEach(league => qualifiers.push({
        teamId: `${sportId}-${league.leagueId}-rank-${rank}`, teamName: `${league.leagueName}-${rank}`,
        leagueId: league.leagueId, leagueName: league.leagueName, sportId, sportName,
        placeholder: true, sourceLeagueId: league.leagueId, sourceRank: rank
      }));
    }
    const source = sourceSport.tournamentSettings?.source ?? (qualifiers.length ? "leagues" : "manual");
    const extraTeams = (sourceSport.tournamentSettings?.extraTeams ?? []).map((team, index) => ({
      teamId: String(team.teamId || `${sportId}-extra-${index + 1}`),
      teamName: String(team.teamName || `自由枠${index + 1}`),
      placeholder: true, custom: true, leagueId: null, leagueName: null, sportId, sportName
    }));
    const count = source === "leagues" ? qualifiers.length + extraTeams.length : safeCount(sourceSport.tournamentSettings?.teamCount, requestedAdvance || teams.length);
    if (count > 256) throw new Error("出場チームは256チーム以内にしてください。");
    const tournamentTeams = source === "leagues" ? [...qualifiers, ...extraTeams] : Array.from({ length: count }, (_, index) => teams[index] ?? {
      teamId: `${sportId}-entry-${index + 1}`, teamName: `チーム${index + 1}`, placeholder: true, leagueId: null, leagueName: null, sportId, sportName
    });
    const arranged = arrangeEntrants(tournamentTeams, sourceSport.tournamentSettings?.slotOrder);
    const thirdPlace = (sourceSport.tournamentSettings?.thirdPlace ?? profileSport.tournament?.thirdPlace) !== false;
    const bracket = generateTournamentData({ teams: tournamentEnabled ? arranged.teams : [], prefix: `${sportId}-bracket`, sportId, sportName, thirdPlace, seedOrder: sourceSport.tournamentSettings?.seedOrder ?? [] });

    return {
      sportId, sportName,
      timing: sourceSport.timing ?? profileSport.timing ?? { matchMinutes: null },
      warnings: [
        ...(arranged.invalid ? ["進出枠の変更により手動配置が無効になりました。自動配置を表示しています。"] : []),
        ...(thirdPlace && tournamentEnabled && !bracket.thirdPlaceMatch ? ["3位決定戦には準決勝2試合が必要です。4チーム以上で対戦枠を生成します。"] : [])
      ],
      format,
      venue: String(sourceSport.venue ?? profileSport.venue ?? "").trim(),
      courts: getSportCourts(sourceSport.courts !== undefined || sourceSport.venue !== undefined ? sourceSport : profileSport),
      teams,
      leagueSettings,
      leagues,
      tournamentSettings: {
        thirdPlace,
        slotOrder: arranged.invalid ? [] : sourceSport.tournamentSettings?.slotOrder ?? [],
        seedOrder: sourceSport.tournamentSettings?.seedOrder ?? [],
        extraTeams,
        enabled: tournamentEnabled,
        requestedAdvanceTeams: requestedAdvance,
        advanceTeams: bracket.advanceTeams,
        source, teamCount: count, qualification: "pending"
      },
      tournament: { ...bracket, enabled: tournamentEnabled },
      leagueMatchPairs: leagues.flatMap(league => league.matches),
      tournamentMatchPairs: bracket.matchPairs,
      totalLeagueMatches: leagues.reduce((sum, league) => sum + league.totalMatches, 0),
      totalMatches: leagues.reduce((sum, league) => sum + league.totalMatches, 0) + bracket.totalMatches
    };
  });

  return {
    schemaVersion: STRUCTURE_SCHEMA_VERSION,
    kind: "classmatch-tournament-structure",
    semesterId: input.semesterId ? String(input.semesterId) : null,
    sports
  };
}

export function validateTournamentStructure(data) {
  if (!data || data.kind !== "classmatch-tournament-structure" || !Array.isArray(data.sports)) {
    throw new Error("大会構造JSONの形式が正しくありません。");
  }
  const ids = new Set();
  data.sports.forEach(sport => sport.teams.forEach(team => {
    if (!team.teamId || !team.teamName) throw new Error("チームIDとチーム名が必要です。");
    if (ids.has(team.teamId)) throw new Error(`チームID「${team.teamId}」が重複しています。`);
    ids.add(team.teamId);
  }));
  return data;
}
