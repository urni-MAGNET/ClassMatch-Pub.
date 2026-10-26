import { getSportCourts, courtKey } from "./courts.js";

export const timetableMinute = value => {
  if (typeof value === "number") return value;
  const [hour, min] = String(value ?? "").split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(min) ? hour * 60 + min : NaN;
};
export const timetableTime = value => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.round(value % 60)).padStart(2, "0")}`;

// The date belongs to the page; positions are local minutes on that date (no timezone conversion).
export function createTimetableAxis(startMinute, endMinute, pixelsPerMinute = 3) {
  if (![startMinute, endMinute, pixelsPerMinute].every(Number.isFinite) || endMinute <= startMinute || pixelsPerMinute <= 0) throw new RangeError("時間軸の範囲・倍率が不正です。");
  return { startMinute, endMinute, pixelsPerMinute, height: (endMinute - startMinute) * pixelsPerMinute };
}
export const timeToY = (axis, value) => (timetableMinute(value) - axis.startMinute) * axis.pixelsPerMinute;
export const yToTime = (axis, y) => axis.startMinute + y / axis.pixelsPerMinute;

// Future editors can apply this patch to the original JSON match identified by matchId.
export function timetableMovePatch(row, axis, y, date = row.date) {
  const start = Math.round(yToTime(axis, y));
  const delta = start - timetableMinute(row.occupiedStart);
  const keys = ["occupiedStart", "startTime", "endTime", "occupiedEnd"];
  if (keys.some(key => timetableMinute(row[key]) + delta < 0 || timetableMinute(row[key]) + delta >= 1440)) throw new RangeError("開催日の範囲外です。");
  return { matchId: row.matchId, date, ...Object.fromEntries(keys.map(key => [key, timetableTime(timetableMinute(row[key]) + delta)])) };
}

function buildSportColumns(sports) {
  return sports.map(sport => ({ sportId: sport.sportId, sportName: sport.sportName,
    children: (getSportCourts(sport).length ? getSportCourts(sport) : [{ venue: "", court: "" }]).map(location => ({
      ...location, id: `${sport.sportId}:${courtKey(location.venue, location.court)}`,
      label: location.venue ? `${location.venue}${location.court ? ` / ${location.court}` : ""}` : "場所未設定"
    }))
  }));
}

export function timetableTeamName(entry, id, sport) {
  if (entry?.sourceLeagueId) {
    const league = sport?.leagues?.find(item => item.leagueId === entry.sourceLeagueId);
    return `${league?.leagueName ?? entry.leagueName ?? entry.sourceLeagueId} ${entry.sourceRank}位`;
  }
  if (entry?.sourceMatchId) return entry.teamName || `${entry.sourceMatchId}の勝者`;
  return sport?.teams?.find(team => team.teamId === (entry?.teamId ?? id))?.teamName || entry?.teamName || id || "未定";
}

// Current settings contain global events. Optional scopes are respected when supplied by a caller.
export function eventAppliesToCourt(event, sportId, court) {
  if (event.sportId && event.sportId !== sportId) return false;
  if (event.sportIds && !event.sportIds.includes(sportId)) return false;
  if (event.venue !== undefined && event.venue !== court.venue) return false;
  if (event.court !== undefined && event.court !== court.court) return false;
  if (event.courts && !event.courts.some(item => item.venue === court.venue && item.court === court.court)) return false;
  return true;
}

export function resolveFlexibleEvents(day, cards, sports) {
  return (day.events ?? []).flatMap(event => {
    if (event.scope === "each-sport") return sports.flatMap(sport => resolveFlexibleEvents({ ...day, events: [{ ...event, scope: undefined, sportId: sport.sportId }] }, cards, sports));
    if (event.startMode !== "after-morning-matches") return event;
    return sports.filter(sport => !event.sportId || event.sportId === sport.sportId).map(sport => {
      const morning = cards.filter(card => card.sportId === sport.sportId && card.occupiedEnd < event.endTime);
      const fallback = (day.availableTimes ?? []).map(slot => slot.startTime).sort()[0] ?? event.endTime;
      return { ...event, sportId: sport.sportId, startTime: morning.map(card => card.occupiedEnd).sort().at(-1) ?? fallback };
    });
  });
}

function positionPage(page, start, end, scale) {
  const axis = createTimetableAxis(start, end, scale);
  const ticks = new Set([start, end]);
  for (let tick = Math.ceil(start / 30) * 30; tick <= end; tick += 30) ticks.add(tick);
  const position = row => ({ ...row, top: timeToY(axis, row.occupiedStart ?? row.startTime), height: (timetableMinute(row.occupiedEnd ?? row.endTime) - timetableMinute(row.occupiedStart ?? row.startTime)) * scale });
  return { ...page, ...axis,
    ticks: [...ticks].sort((a, b) => a - b).map(value => ({ time: timetableTime(value), top: timeToY(axis, value) })),
    events: page.events.filter(row => timetableMinute(row.startTime) >= start && timetableMinute(row.endTime) <= end).map(position),
    cards: page.cards.filter(row => timetableMinute(row.occupiedStart) >= start && timetableMinute(row.occupiedEnd) <= end).map(row => ({ ...position(row), matchTop: (timetableMinute(row.startTime) - timetableMinute(row.occupiedStart)) * scale, matchHeight: (timetableMinute(row.endTime) - timetableMinute(row.startTime)) * scale }))
  };
}

export function buildTimetableAxisPages(rows, settings, sports, options = {}) {
  const columns = buildSportColumns(sports);
  return [...settings.days].sort((a, b) => a.date.localeCompare(b.date)).map(day => {
    const cards = rows.filter(row => row.date === day.date).map(row => {
      const sport = sports.find(sport => sport.sportId === row.sportId);
      const columnIndex = columns.findIndex(column => column.sportId === row.sportId);
      const children = columns[columnIndex]?.children ?? [];
      const venue = row.venue ?? (children.length === 1 ? children[0].venue : "");
      const court = row.court ?? (children.length === 1 ? children[0].court : "");
      return { ...row, venue, court, columnIndex, childIndex: children.findIndex(child => child.venue === venue && child.court === court),
        teamNames: [timetableTeamName(row.match?.teamA, row.match?.teamAId, sport), timetableTeamName(row.match?.teamB, row.match?.teamBId, sport)] };
    });
    const events = resolveFlexibleEvents(day, cards, sports);
    const minutes = [...(day.availableTimes ?? []), ...events, ...cards].flatMap(row => [timetableMinute(row.occupiedStart ?? row.startTime), timetableMinute(row.occupiedEnd ?? row.endTime)]).filter(Number.isFinite);
    const start = minutes.length ? Math.min(...minutes) : 540;
    const end = minutes.length ? Math.max(...minutes) : 600;
    return positionPage({ date: day.date, columns, cards, events }, start, Math.max(start + 1, end), options.pixelsPerMinute ?? 3);
  });
}

export function sportTimeTicks(page, sportId) {
  const values = new Set([timetableTime(page.startMinute), timetableTime(page.endMinute)]);
  page.cards.filter(card => card.sportId === sportId).forEach(card => { values.add(card.startTime); values.add(card.endTime); });
  page.events.filter(event => !event.sportId || event.sportId === sportId).forEach(event => { values.add(event.startTime); values.add(event.endTime); });

  return [...values].sort().map(time => ({ time, top: timeToY(page, time) }));
}

// Split horizontally at courts, vertically only where no occupied match/event crosses the cut.
// Very long connected runs are scaled as one band instead of clipping matches.
export function paginateTimetable(pages, { maxCourts = 4, minutesPerPage = 150, maxHeight = 510 } = {}) {
  if (maxCourts < 1 || minutesPerPage <= 0 || maxHeight <= 0) throw new RangeError("ページ設定が不正です。");
  return pages.flatMap(page => {
    const flat = page.columns.flatMap(column => column.children.map(child => ({ column, child })));
    const groups = [];
    for (let i = 0; i < flat.length; i += maxCourts) groups.push(flat.slice(i, i + maxCourts));
    if (!groups.length) groups.push([]);
    const spans = [...page.cards.map(card => [timetableMinute(card.occupiedStart), timetableMinute(card.occupiedEnd)]), ...page.events.map(event => [timetableMinute(event.startTime), timetableMinute(event.endTime)])];
    const boundaries = [...new Set([page.endMinute, ...spans.flat()])].sort((a, b) => a - b);
    const bands = [];
    for (let start = page.startMinute; start < page.endMinute;) {
      const target = Math.min(start + minutesPerPage, page.endMinute);
      const safe = value => !spans.some(([a, b]) => a < value && value < b);
      const before = boundaries.filter(value => value > start && value <= target && safe(value));
      const end = safe(target) ? target : before.at(-1) ?? boundaries.find(value => value > target && safe(value));
      bands.push([start, end]); start = end;
    }
    return bands.flatMap(([start, end]) => groups.map(group => {
      const columns = [];
      for (const { column, child } of group) {
        let found = columns.find(item => item.sportId === column.sportId);
        if (!found) { found = { ...column, children: [] }; columns.push(found); }
        found.children.push(child);
      }
      const cards = page.cards.filter(card => group.some(({ column, child }) => column.sportId === card.sportId && child.venue === card.venue && child.court === card.court)).map(card => {
        const columnIndex = columns.findIndex(column => column.sportId === card.sportId);
        return { ...card, columnIndex, childIndex: columns[columnIndex].children.findIndex(child => child.venue === card.venue && child.court === card.court) };
      });
      return positionPage({ ...page, columns, cards }, start, end, Math.min(3, maxHeight / (end - start)));
    }));
  });
}

// Clipboard export: one record per match, never separate buffer rows; keep every time and ID.
export function buildTimetablePages(rows, settings, sports) {
  return buildTimetableAxisPages(rows, settings, sports).map(page => ({ date: page.date,
    headers: ["競技", "実施場所", "コート", "占有開始", "試合開始", "試合終了", "占有終了", "チーム1", "チーム2", "試合ID", "チーム1 ID", "チーム2 ID"],
    intervals: [...page.cards.map(card => [page.columns[card.columnIndex]?.sportName, card.venue, card.court, card.occupiedStart, card.startTime, card.endTime, card.occupiedEnd, ...card.teamNames, card.matchId, card.match?.teamAId ?? card.match?.teamA?.teamId, card.match?.teamBId ?? card.match?.teamB?.teamId]),
      ...page.events.map(event => [event.name, event.venue ?? "全体", event.court ?? "", event.startTime, event.startTime, event.endTime, event.endTime, "", "", "", "", ""])]
  }));
}
export function timetablePagesTSV(pages) {
  const cell = value => {
    const text = String(value ?? "").replace(/[\t\r\n]/g, " ");
    return /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  };
  return pages.map(page => [[page.date], page.headers, ...page.intervals].map(row => row.map(cell).join("\t")).join("\n")).join("\n\n");
}

// One printed sheet per sport per date. Shared real-time coordinates are preserved.
export function timetableSportSheets(pages) {
 return pages.flatMap(page=>page.columns.flatMap(column=>{
  const cards=page.cards.filter(card=>card.sportId===column.sportId).map(card=>({...card,columnIndex:0}));
  const events=page.events.filter(event=>column.children.some(child=>eventAppliesToCourt(event,column.sportId,child)));
  return paginateTimetable([{...page,columns:[column],cards,events}],{maxCourts:Number.MAX_SAFE_INTEGER,minutesPerPage:1440,maxHeight:510});
 }));
}
