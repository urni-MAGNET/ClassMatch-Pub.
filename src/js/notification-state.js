export function isOwnAnnouncement(row, branchId, branchName) {
  if (row.broadcast === true || row.broadcast === 'true') return false;
  const to = String(row.created_to ?? '').trim();
  return Boolean(to && ((branchId && to === String(branchId)) || (branchName && to === branchName.trim())));
}
export function oldestAnnouncementsFirst(rows) {
  return [...rows].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}
export function completedResultIds(rows) {
  return rows.filter(row => [row.score_a, row.score_b].every(score => score !== null && score !== undefined && score !== '' && Number.isFinite(Number(score))))
    .map(row => String(row.id));
}
export function hasNewResults(previous, current) {
  if (!Array.isArray(previous)) return false;
  const seen = new Set(previous);
  return current.some(id => !seen.has(id));
}
export function newestCompletedResultAt(rows) {
  return rows.filter(row => [row.score_a, row.score_b].every(score => score !== null && score !== undefined && score !== '' && Number.isFinite(Number(score))))
    .map(row => String(row.created_at ?? row.played_at ?? ''))
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
}
export function hasResultNewerThan(previous, current) {
  return Boolean(previous && current && String(current) > String(previous));
}
