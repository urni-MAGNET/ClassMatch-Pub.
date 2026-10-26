const MAX_TEAMS = 256;

export function generateTournamentData({ teams = [], startPoints = [], step = 120, prefix = "bracket", sportId = "", sportName = "", thirdPlace = false, seedOrder = [] } = {}) {
  if (!Array.isArray(teams) || teams.length > MAX_TEAMS) throw new Error("出場チームは256チーム以内にしてください。");
  if (!Number.isFinite(step) || step <= 0) throw new Error("線の長さは正の数にしてください。");
  const ids = new Set();
  const participants = teams.map((team, index) => {
    const teamId = String(team.teamId ?? `${prefix}-team-${index + 1}`);
    if (ids.has(teamId)) throw new Error(`チームIDが重複しています: ${teamId}`);
    ids.add(teamId);
    return { ...team, teamId, teamName: String(team.teamName || `チーム${index + 1}`), sportId, sportName };
  });
  const points = {};
  const drawPairs = [];
  const rounds = [];
  const roundPairs = {};
  const roundPoints = {};
  let current = participants.map((team, index) => {
    const start = startPoints[index] ?? { x: 200, y: 48 + index * 64 };
    if (!Number.isFinite(start.x) || !Number.isFinite(start.y)) throw new Error("始点の座標が不正です。");
    const anchorId = `start-${index + 1}`;
    const pointId = `1-${index + 1}`;
    points[anchorId] = { x: start.x, y: start.y };
    points[pointId] = { x: start.x + step, y: start.y };
    drawPairs.push([anchorId, pointId]);
    return { team, pointId };
  });
  // Reserve a power-of-two bracket. Empty slots only occur in round one.
  const capacity = participants.length ? 2 ** Math.ceil(Math.log2(participants.length)) : 0;
  let seedPositions = [1];
  for (let size = 2; size <= capacity; size *= 2) seedPositions = seedPositions.flatMap(seed => [seed, size + 1 - seed]);
  const ranked = [...new Set(seedOrder)].map(id => current.find(slot => slot.team.teamId === id)).filter(Boolean);
  ranked.push(...current.filter(slot => !ranked.includes(slot)));
  let entry = 0;
  const slots = current;
  current = seedPositions.slice(0, capacity).map(seed => seed > participants.length ? null : seedOrder.length ? ranked[seed - 1] : slots[entry++]);
  let matchOrder = 0;
  roundPoints.Round1 = current.filter(Boolean).map(slot => slot.pointId);
  while (current.length > 1) {
    const round = rounds.length + 1;
    const final = current.length === 2;
    const next = [];
    const matches = [];
    const seeds = [];
    for (let index = 0; index < current.length; index += 2) {
      const a = current[index] || current[index + 1];
      const b = current[index] ? current[index + 1] : null;
      const pointId = `${round + 1}-${next.length + 1}`;
      const pointA = points[a.pointId];
      const pointB = b ? points[b.pointId] : pointA;
      points[pointId] = { x: Math.max(pointA.x, pointB.x) + step, y: (pointA.y + pointB.y) / 2 };
      drawPairs.push([a.pointId, pointId]);
      if (!b) {
        seeds.push({ teamId: a.team.teamId, team: a.team, fromMatchId: a.team.sourceMatchId ?? null, fromPointId: a.pointId, toPointId: pointId, advancesToRound: round + 1 });
        next.push({ team: a.team, pointId });
        continue;
      }
      drawPairs.push([b.pointId, pointId]);
      const matchId = `${prefix}-r${round}-m${matches.length + 1}`;
      const roundPairId = `Round${round}-${matches.length + 1}`;
      roundPairs[roundPairId] = [a.pointId, b.pointId];
      const winner = {
        teamId: `${matchId}-winner`, teamName: final ? "優勝" : `第${round}回戦・第${matches.length + 1}試合の勝者`,
        placeholder: true, sourceMatchId: matchId, leagueId: null, leagueName: null, sportId, sportName
      };
      matches.push({
        matchId, roundPairId, sportId, sportName, round, label: final ? "Final" : `Round ${round}`, order: ++matchOrder,
        teamAId: a.team.teamId, teamBId: b.team.teamId, teamA: a.team, teamB: b.team,
        fromMatchAId: a.team.sourceMatchId ?? null, fromMatchBId: b.team.sourceMatchId ?? null,
        dependsOn: [a.team.sourceMatchId, b.team.sourceMatchId].filter(Boolean),
        pointAId: a.pointId, pointBId: b.pointId, winnerPointId: pointId, winner, advancesTo: null
      });
      next.push({ team: winner, pointId });
    }
    rounds.push({ round, label: final ? "Final" : `Round ${round}`, matches, seeds });
    roundPoints[`Round${round + 1}`] = next.map(slot => slot.pointId);
    current = next;
  }
  const allMatches = rounds.flatMap(round => round.matches);
  // Winner references are resolved after all rounds exist, including carried byes.
  for (const match of allMatches) {
    match.advancesTo = allMatches.find(next => next.dependsOn.includes(match.matchId))?.matchId ?? "champion";
  }
  let thirdPlaceMatch = null;
  const semifinals = rounds.at(-2)?.matches ?? [];
  if (thirdPlace && semifinals.length === 2) {
    const matchId = `${prefix}-third-place`;
    const loser = (match, index) => ({ teamId: `${match.matchId}-loser`, teamName: `準決勝${index + 1}の敗者`, placeholder: true, sourceMatchId: match.matchId, sourceOutcome: 'loser', sportId, sportName });
    const [teamA, teamB] = semifinals.map(loser);
    thirdPlaceMatch = { matchId, sportId, sportName, round: rounds.length, label: 'Third place', order: ++matchOrder,
      teamA, teamB, teamAId: teamA.teamId, teamBId: teamB.teamId, dependsOn: semifinals.map(match => match.matchId),
      fromMatchAId: semifinals[0].matchId, fromMatchBId: semifinals[1].matchId, advancesTo: 'thirdPlace' };
    const x = Math.max(0, ...Object.values(points).map(point => point.x)) + step + 360;
    points['third-a'] = { x, y: 70 }; points['third-b'] = { x, y: 150 }; points['third-winner'] = { x: x + step, y: 110 };
    points['third-start-a'] = { x: x - step, y: 70 }; points['third-start-b'] = { x: x - step, y: 150 };
    drawPairs.push(['third-start-a', 'third-a'], ['third-start-b', 'third-b'], ['third-a', 'third-winner'], ['third-b', 'third-winner']);
    Object.assign(thirdPlaceMatch, { pointAId: 'third-a', pointBId: 'third-b', winnerPointId: 'third-winner' });
    allMatches.push(thirdPlaceMatch);
  }
  const champion = current[0] ? { ...current[0].team, pointId: current[0].pointId } : null;
  return {
    thirdPlace: Boolean(thirdPlace), thirdPlaceMatch,
    enabled: participants.length > 0, advanceTeams: participants.length, teamCount: participants.length,
    teams: participants, roundCount: rounds.length, rounds, seeds: rounds.flatMap(round => round.seeds),
    totalMatches: allMatches.length, matchPairs: allMatches, champion, points, drawPairs, roundPairs, roundPoints,
    geometry: { step, width: Math.max(0, ...Object.values(points).map(point => point.x)) + 170, height: Math.max(0, ...Object.values(points).map(point => point.y)) + 48 }
  };
}
