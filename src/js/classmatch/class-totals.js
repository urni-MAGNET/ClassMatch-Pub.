import { normalizeSport } from './profile.js';
function teamsForSport(state,sport){const ids=state.leagues.filter(league=>league.sport===sport.name).map(league=>String(league.id));return state.teams.filter(team=>ids.includes(String(team.leagues_id)));}
export function aggregateClassTotals(state) {
  const totals = new Map(state.classes.map(item => [String(item.id), { classRow: item, total: 0, entries: 0 }]));
  (state.semester?.sports_config?.sports || []).forEach(rawSport => {
    const sport = normalizeSport(rawSport);
    const pointsByClass = new Map();
    teamsForSport(state, sport).forEach(team => {
      if (!team.class_id) return;
      const result = state.results.find(row=>row.sport_id===sport.id&&String(row.team_id)===String(team.id)) || {};
      if (result.participated === false) return;
      const points = (result.manual_points ?? result.calculated_points ?? null);
      if (points === null) return;
      const key = String(team.class_id);
      pointsByClass.set(key, [...(pointsByClass.get(key) || []), Number(points) || 0]);
    });
    pointsByClass.forEach((points, classId) => {
      const bucket = totals.get(classId);
      if (!bucket) return;
      const method = sport.scoreRule.classAggregation;
      const sportPoints = method === "best"
        ? Math.max(...points)
        : method === "average"
          ? points.reduce((sum, value) => sum + value, 0) / points.length
          : points.reduce((sum, value) => sum + value, 0);
      bucket.total += sportPoints;
      bucket.entries += points.length;
    });
  });
  return [...totals.values()].sort((a, b) => b.total - a.total || a.classRow.sort_order - b.classRow.sort_order);
}
