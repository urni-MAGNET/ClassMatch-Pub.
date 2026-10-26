const unique = values => [...new Set(values.filter(Boolean))];

export function createTimetableAliases(structure) {
  const aliases = { sport: new Map(), team: new Map(), league: new Map(), match: new Map(), class: new Map() };
  const add = (map, value, prefix) => {
    if (value === null || value === undefined || value === "") return null;
    const id = String(value);
    if (!map.has(id)) map.set(id, `${prefix}${map.size + 1}`);
    return map.get(id);
  };
  for (const sport of structure?.sports ?? []) {
    add(aliases.sport, sport.sportId, "s");
    for (const team of sport.teams ?? []) {
      add(aliases.team, team.teamId, "t");
      add(aliases.class, team.classId, "c");
    }
    for (const league of sport.leagues ?? []) add(aliases.league, league.leagueId, "l");
    for (const match of [...(sport.leagueMatchPairs ?? []), ...(sport.tournamentMatchPairs ?? [])]) {
      add(aliases.match, match.matchId, "m");
      for (const entry of [match.teamA, match.teamB]) {
        if (entry?.teamId && !entry.sourceMatchId && !entry.sourceLeagueId) add(aliases.team, entry.teamId, "t");
      }
    }
  }
  return aliases;
}

function possibleTeams(entry, sport, matches, visited = new Set()) {
  if (!entry) return [];
  if (entry.sourceMatchId) {
    if (visited.has(entry.sourceMatchId)) return [];
    const match = matches.get(entry.sourceMatchId);
    const next = new Set(visited).add(entry.sourceMatchId);
    return match ? unique([...possibleTeams(match.teamA, sport, matches, next), ...possibleTeams(match.teamB, sport, matches, next)]) : [];
  }
  if (entry.sourceLeagueId) return sport.teams.filter(team => team.leagueId === entry.sourceLeagueId).map(team => team.teamId);
  return entry.teamId ? [entry.teamId] : [];
}

function compactSlot(entry, fallbackTeamId, sport, matches, aliases) {
  const value = entry ?? (fallbackTeamId ? { teamId: fallbackTeamId } : null);
  const candidates = possibleTeams(value, sport, matches).map(id => aliases.team.get(id)).filter(Boolean);
  if (value?.sourceMatchId) return {
    fromMatch: aliases.match.get(value.sourceMatchId),
    outcome: value.sourceOutcome === "loser" ? "loser" : "winner",
    candidates
  };
  if (value?.sourceLeagueId) return {
    fromLeague: aliases.league.get(String(value.sourceLeagueId)),
    rank: Number(value.sourceRank),
    candidates
  };
  return { team: aliases.team.get(value?.teamId ?? fallbackTeamId) ?? null };
}

export function compactTimetableInput(structure, settings, tournamentInfo = {}, instructions = "") {
  const aliases = createTimetableAliases(structure);
  const sports = (structure.sports ?? []).map(sport => {
    const allMatches = [...sport.leagueMatchPairs, ...sport.tournamentMatchPairs];
    const matches = new Map(allMatches.map(match => [match.matchId, match]));
    const compactMatches = allMatches.map(match => {
      const prerequisites = new Set(match.dependsOn ?? []);
      for (const entry of [match.teamA, match.teamB]) {
        if (entry?.sourceLeagueId) sport.leagueMatchPairs.filter(row => row.leagueId === entry.sourceLeagueId).forEach(row => prerequisites.add(row.matchId));
      }
      return {
        id: aliases.match.get(match.matchId),
        slots: [
          compactSlot(match.teamA, match.teamAId, sport, matches, aliases),
          compactSlot(match.teamB, match.teamBId, sport, matches, aliases)
        ],
        after: [...prerequisites].map(id => aliases.match.get(id)).filter(Boolean)
      };
    });
    return {
      id: aliases.sport.get(sport.sportId),
      name: sport.sportName,
      courts: sport.courts,
      timing: settings.sportTimings[sport.sportId],
      teams: [...aliases.team.entries()]
        .filter(([id]) => sport.teams.some(team => String(team.teamId) === id) || allMatches.some(match => [match.teamA, match.teamB].some(entry => String(entry?.teamId ?? "") === id && !entry?.sourceMatchId && !entry?.sourceLeagueId)))
        .map(([id, alias]) => {
          const team = sport.teams.find(entry => String(entry.teamId) === id);
          return { id: alias, class: team?.classId ? aliases.class.get(String(team.classId)) ?? null : null };
        }),
      matches: compactMatches
    };
  });
  const days = settings.days.map(day => ({ ...day, events: (day.events ?? []).flatMap(event => {
    if (event.scope === "each-sport") return sports.map(sport => ({ ...event, scope: undefined, sportId: sport.id }));
    return [{ ...event, sportId: event.sportId ? aliases.sport.get(event.sportId) : undefined }];
  }) }));
  return {
    data: { schemaVersion: 1, kind: "classmatch-timetable-input", idEncoding: "compact-v2", tournamentName: String(tournamentInfo?.name ?? ""), timezone: "Asia/Tokyo", days, sports, instructions: String(instructions).trim() },
    aliases
  };
}

export function expandTimetableOutputIds(data, structure) {
  const aliases = createTimetableAliases(structure);
  const reverse = new Map();
  for (const map of Object.values(aliases)) for (const [original, alias] of map) reverse.set(alias, original);
  const expanded = structuredClone(data);
  const restore = value => typeof value === "string" ? reverse.get(value) ?? value : value;
  for (const proposal of expanded?.proposals ?? []) {
    for (const row of proposal?.matches ?? []) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      row.matchId = restore(row.matchId);
      row.sportId = restore(row.sportId);
    }
    for (const warning of proposal?.warnings ?? []) if (Array.isArray(warning.relatedIds)) warning.relatedIds = warning.relatedIds.map(restore);
  }
  for (const key of ["errors", "warnings"]) for (const entry of expanded?.[key] ?? []) if (Array.isArray(entry.relatedIds)) entry.relatedIds = entry.relatedIds.map(restore);
  return expanded;
}
