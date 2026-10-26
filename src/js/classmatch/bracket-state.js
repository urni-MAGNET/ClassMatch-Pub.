export function arrangeEntrants(teams, order = []) {
  const byId = new Map(teams.map(team => [team.teamId, team]));
  const valid = order.length === teams.length && new Set(order).size === teams.length && order.every(id => byId.has(id));
  return { teams: valid ? order.map(id => byId.get(id)) : teams, invalid: order.length > 0 && !valid };
}

// Resolve winners and semifinal losers in dependency order. A result is usable only
// when both its participants AND all upstream result fingerprints still match.
export function resolveBracket(bracket, results = {}) {
  const resolved = new Map();
  const invalidated = [];
  const resolve = team => {
    if (!team?.sourceMatchId) return team?.placeholder ? null : team;
    const previous = resolved.get(team.sourceMatchId);
    return previous?.[team.sourceOutcome === 'loser' ? 'loser' : 'winner'] ?? null;
  };
  for (const match of bracket.matchPairs) {
    const teamA = resolve(match.teamA), teamB = resolve(match.teamB);
    const lineage = match.dependsOn.map(id => resolved.get(id)?.fingerprint ?? null);
    const identity = JSON.stringify([teamA?.teamId ?? null, teamB?.teamId ?? null, lineage]);
    const saved = results[match.matchId];
    const valid = teamA && teamB && saved?.identity === identity && (!saved.teamAId || saved.teamAId === teamA.teamId) && (!saved.teamBId || saved.teamBId === teamB.teamId) && Number.isFinite(saved.scoreA) && Number.isFinite(saved.scoreB)
      && saved.scoreA >= 0 && saved.scoreB >= 0 && (saved.scoreA !== saved.scoreB || [teamA.teamId, teamB.teamId].includes(saved.winnerId));
    if (saved && !valid) invalidated.push(match.matchId);
    const winner = valid ? saved.scoreA > saved.scoreB ? teamA : saved.scoreB > saved.scoreA ? teamB : saved.winnerId === teamA.teamId ? teamA : teamB : null;
    const loser = winner ? winner.teamId === teamA.teamId ? teamB : teamA : null;
    resolved.set(match.matchId, { ...match, teamA, teamB, identity, winner, loser, result: valid ? saved : null,
      fingerprint: valid ? [teamA.teamId, teamB.teamId, saved.scoreA, saved.scoreB, winner.teamId, lineage] : null });
  }
  return { matches: [...resolved.values()], invalidated };
}

export function matchType(match, rounds) {
  if (match.label === 'Third place') return '3位決定戦';
  const remaining = rounds - match.round;
  return remaining === 0 ? '決勝' : remaining === 1 ? '準決勝' : remaining === 2 ? '準々決勝' : `トーナメント第${match.round}回戦`;
}
