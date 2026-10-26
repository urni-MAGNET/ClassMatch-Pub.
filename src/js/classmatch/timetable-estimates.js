const minute = value => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : NaN;
};

export function availableMinutes(windows = []) {
  return windows.reduce((total, window) => {
    const start = minute(window.startTime);
    const end = minute(window.endTime);
    return total + (Number.isFinite(start) && end > start ? end - start : 0);
  }, 0);
}

export function sportTimeEstimate(sport, timing = {}) {
  const matchCount = Math.max(0, Number(sport?.totalMatches) || 0);
  const matchMinutes = Number(timing.matchMinutes);
  const beforeMinutes = Number(timing.beforeMinutes);
  const afterMinutes = Number(timing.afterMinutes);
  const valid = Number.isFinite(matchMinutes) && matchMinutes > 0
    && Number.isFinite(beforeMinutes) && beforeMinutes >= 0
    && Number.isFinite(afterMinutes) && afterMinutes >= 0;
  const minutesPerMatch = valid ? matchMinutes + beforeMinutes + afterMinutes : null;
  const courtCount = Math.max(1, Array.isArray(sport?.courts) && sport.courts.length ? sport.courts.length : 1);
  const totalMinutes = valid ? matchCount * minutesPerMatch : null;
  return {
    matchCount,
    minutesPerMatch,
    totalMinutes,
    courtCount,
    estimatedMinutes: valid ? Math.ceil(totalMinutes / courtCount) : null
  };
}

export function durationLabel(minutes) {
  if (!Number.isFinite(minutes)) return "未計算";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${minutes}分（${hours}時間${rest ? `${rest}分` : ""}）` : `${minutes}分`;
}
