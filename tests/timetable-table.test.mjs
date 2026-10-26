import test from "node:test";
import assert from "node:assert/strict";
import { buildTimetableAxisPages, buildTimetablePages, timetablePagesTSV, createTimetableAxis, timeToY, yToTime, timetableMovePatch, paginateTimetable, eventAppliesToCourt, resolveFlexibleEvents } from "../src/js/classmatch/timetable-table.js";
import { timetableWorkbookXML } from "../src/js/classmatch/timetable-excel.js";
import { fixture } from "./timetable-fixture.mjs";
const { rows, settings, sports } = fixture;
test("shared absolute axis, mixed 16+2+2 and 10+2+3, adjoining matches, gaps, courts and dates", () => {
  const [page, second] = buildTimetableAxisPages(rows, settings, sports);
  assert.equal(page.date, "2026-10-21"); assert.equal(second.cards.length, 0);
  assert.deepEqual(page.cards.map(card => card.height), [60, 45, 60, 60]);
  assert.equal(page.cards[0].top + page.cards[0].height, page.cards[2].top);
  assert.equal(page.cards[0].top, page.cards[1].top);
  assert.equal(page.cards[0].matchTop, 6); assert.equal(page.cards[0].matchHeight, 48);
  assert.equal(page.cards[1].matchHeight, 30);
  assert.equal(page.cards[3].top - (page.cards[2].top + page.cards[2].height), 30);
  assert.deepEqual(page.cards[0].teamNames, ["25R", "27R"]);
  assert.deepEqual(page.cards[3].teamNames, ["L 1位", "第1回戦の勝者"]);
  assert.equal(page.cards[3].match, rows[3].match);
  assert.deepEqual(page.columns.map(column => column.children.length), [2, 1]);
  assert.equal(page.events[0].height, 30); assert.equal(page.events[1].top, 540);
  assert.equal(timeToY(page, "09:30"), 90);
});
test("inverse axis and immutable JSON move patch", () => {
  const axis = createTimetableAxis(540, 840, 2.5);
  for (const minute of [540, 550, 570, 650.25, 839]) assert.equal(yToTime(axis, timeToY(axis, minute)), minute);
  const snapshot = JSON.stringify(rows[0]);
  assert.deepEqual(timetableMovePatch(rows[0], axis, 75, "2026-10-22"), { matchId: "m1", date: "2026-10-22", occupiedStart: "09:30", startTime: "09:32", endTime: "09:48", occupiedEnd: "09:50" });
  assert.equal(JSON.stringify(rows[0]), snapshot);
  assert.throws(() => createTimetableAxis(0, 1, 0));
  assert.throws(() => timetableMovePatch(rows[0], axis, -10000));
});
test("short spans have exact height with no visual minimum", () => {
  const page = buildTimetableAxisPages([{ ...rows[0], occupiedEnd: "09:11", endTime: "09:11", startTime: "09:10" }], settings, sports)[0];
  assert.equal(page.cards[0].height, 3);
});
test("pagination preserves every match once, repeats courts/clocks, and never cuts events", () => {
  const pages = buildTimetableAxisPages(rows, settings, sports);
  const sheets = paginateTimetable(pages, { maxCourts: 1, minutesPerPage: 25 });
  assert.equal(sheets.flatMap(sheet => sheet.cards).length, rows.length);
  for (const sheet of sheets) {
    assert.ok(sheet.height <= 510);
    assert.equal(sheet.columns.flatMap(column => column.children).length, 1);
    for (const item of [...sheet.cards, ...sheet.events]) assert.ok(item.top >= 0 && item.top + item.height <= sheet.height);
    assert.equal(sheet.ticks[0].top, 0);
  }
  assert.equal(sheets.filter(sheet => sheet.events.some(event => event.name === "昼休み")).length, 6);
});
test("scoped event does not cover other courts", () => {
  assert.equal(eventAppliesToCourt({ venue: "校庭", court: "A" }, "s", sports[0].courts[0]), true);
  assert.equal(eventAppliesToCourt({ sportIds: ["b"] }, "s", sports[0].courts[0]), false);
  assert.equal(eventAppliesToCourt({ court: "A" }, "s", sports[0].courts[1]), false);
});
test("flexible lunch expands per sport from its final morning match", () => {
  const day = { date: "2026-10-21", availableTimes: [{ startTime: "09:00", endTime: "16:00" }], events: [{ name: "昼休み", startMode: "after-morning-matches", endTime: "13:00" }] };
  const events = resolveFlexibleEvents(day, rows, sports);
  assert.deepEqual(events.map(event => [event.sportId, event.startTime, event.endTime]), [["s", "10:20", "13:00"], ["b", "09:25", "13:00"]]);
});
test("spreadsheet details keep both teams, all four times and IDs without buffer rows", () => {
  const records = buildTimetablePages(rows, settings, sports);
  assert.equal(records[0].intervals.length, rows.length + 2);
  assert.deepEqual(records[0].intervals[0].slice(3, 10), ["09:10", "09:12", "09:28", "09:30", "25R", "27R", "m1"]);
  const tsv = timetablePagesTSV([{ date: "2026-10-21", headers: ["時間", "=1+1"], intervals: [["09:00", "@bad\tname\nnext"]] }]);
  assert.match(tsv, /'=1\+1/); assert.match(tsv, /'@bad name next/);
  const workbook = timetableWorkbookXML(buildTimetableAxisPages(rows, settings, sports), records, { title: "大会<&>" });
  assert.match(workbook, /ss:MergeDown="19"/); assert.match(workbook, /ss:MergeDown="14"/);
  assert.match(workbook, /大会&lt;&amp;&gt;/); assert.match(workbook, /ss:Type="Number"/);
  assert.match(workbook, /25R/); assert.match(workbook, /27R/); assert.match(workbook, /m1/);
  assert.match(workbook, /2026-10-22 明細/); assert.doesNotMatch(workbook, /ss:Formula/);
});
