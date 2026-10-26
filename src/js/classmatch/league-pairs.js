export function generateVisualLeaguePairs(teamCount, squareMatchesPerTeam = 3) {
  if (!Number.isInteger(teamCount) || teamCount < 0) throw new Error("Invalid team count");
  if (teamCount < 2) return [];
  if (teamCount === 2) return [[0, 1]];
  const pairs = Array.from({ length: teamCount }, (_, index) => [index, (index + 1) % teamCount]);
  if (teamCount === 4 && Number(squareMatchesPerTeam) !== 2) pairs.push([0, 2], [1, 3]);
  return pairs;
}
export function visualLeaguePoints(count) {
  return Array.from({ length: count }, (_, index) => {
    const angle = index * 2 * Math.PI / count - Math.PI / 2 + (count === 4 ? Math.PI / 4 : 0);
    const radius = count === 4 ? 42 : 36;
    return { x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) };
  });
}
