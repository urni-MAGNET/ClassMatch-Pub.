import test from "node:test";
import assert from "node:assert/strict";
import { generateTournamentStructure } from "../src/js/classmatch/tournament-structure.js";
import { validateTimetableJSON } from "../src/js/classmatch/timetable-validation.js";

const structure = generateTournamentStructure({ sports: ["s1", "s2"].map(sportId => ({ sportId, sportName: sportId, format: "league", leagues: [{ leagueId: `${sportId}-l`, teams: [{ teamId: `${sportId}-a`, teamName: "A", classId: "class-a" }, { teamId: `${sportId}-b`, teamName: "B", classId: null }] }] })) });
const settings = { sportTimings: Object.fromEntries(["s1", "s2"].map(id => [id, { matchMinutes: 10, beforeMinutes: 0, afterMinutes: 5 }])), days: [{ date: "2026-10-21", availableTimes: [{ startTime: "09:00", endTime: "16:00" }], events: [{ name: "昼休み", startTime: "12:00", endTime: "13:00" }] }] };
const row = (sport, start = "09:00", end = "09:10", occupiedEnd = "09:15") => ({ matchId: structure.sports[sport].leagueMatchPairs[0].matchId, sportId: structure.sports[sport].sportId, date: "2026-10-21", occupiedStart: start, startTime: start, endTime: end, occupiedEnd });
const data = () => ({ schemaVersion: 1, kind: "classmatch-timetable", status: "ok", errors: [], warnings: [], proposals: [{ proposalId: "plan-1", label: "案1", warnings: [], matches: [row(0), row(1, "09:15", "09:25", "09:30")] }] });
const validate = value => validateTimetableJSON(JSON.stringify(value), structure, settings);

test("venue mismatches and shared venue bookings are rejected; legacy rows inferred", () => {
  const located = structuredClone(structure);
  located.sports.forEach(sport => { sport.courts = [{ venue: "体育館", court: "" }]; });
  const value = data(); value.proposals[0].matches = [row(0), row(1)];
  let checked = validateTimetableJSON(JSON.stringify(value), located, settings).proposals[0];
  assert.ok(checked.errors.some(issue => issue.code === "VENUE"));
  assert.ok(checked.warnings.some(issue => issue.code === "VENUE_INFERRED"));
  assert.equal(checked.rows[0].venue, "体育館");
  value.proposals[0].matches[0].venue = "グラウンド";
  checked = validateTimetableJSON(JSON.stringify(value), located, settings).proposals[0];
  assert.ok(checked.errors.some(issue => issue.code === "VENUE_MISMATCH"));
  located.sports[1].courts = [{ venue: "別会場", court: "" }];
  value.proposals[0].matches[0].venue = "体育館";
  checked = validateTimetableJSON(JSON.stringify(value), located, settings).proposals[0];
  assert.ok(!checked.errors.some(issue => issue.code === "VENUE"));
});
test("different courts allow concurrent matches in the same sport; shared courts and unknown assignments fail", () => {
  const located = generateTournamentStructure({ sports: [{ sportId: "s1", sportName: "競技", format: "tournament", courts: [{ venue: "体育館", court: "A" }, { venue: "体育館", court: "B" }], leagues: [{ teams: ["a", "b", "c", "d"].map(teamId => ({ teamId, teamName: teamId, classId: teamId })) }], tournamentSettings: { teamCount: 4, thirdPlace: false } }] });
  const matches = located.sports[0].tournamentMatchPairs;
  const value = data();
  value.proposals[0].matches = matches.map((match, index) => ({ ...row(0, index === 2 ? "09:15" : "09:00", index === 2 ? "09:25" : "09:10", index === 2 ? "09:30" : "09:15"), matchId: match.matchId, venue: "体育館", court: index === 1 ? "B" : "A" }));
  const check = () => validateTimetableJSON(JSON.stringify(value), located, settings).proposals[0];
  assert.equal(check().errors.length, 0);
  value.proposals[0].matches[1].court = "A";
  assert.ok(check().errors.some(issue => issue.code === "VENUE"));
  value.proposals[0].matches[1].court = "C";
  assert.ok(check().errors.some(issue => issue.code === "VENUE_MISMATCH"));
  delete value.proposals[0].matches[1].court;
  assert.ok(check().errors.some(issue => issue.code === "VENUE_MISMATCH"));
});

test("valid plans and touching intervals pass independently", () => {
  const value = data(); value.proposals.push({ ...structuredClone(value.proposals[0]), proposalId: "plan-2" });
  const result = validate(value);
  assert.equal(result.errors.length, 0);
  assert.equal(result.proposals.length, 2);
  assert.ok(result.proposals.every(plan => plan.errors.length === 0));
  assert.ok(!result.proposals[0].warnings.some(issue => issue.code === "CLASS_OVERLAP"));
});
test("compact AI IDs are restored before validation", () => {
  const value = data();
  value.proposals[0].matches = [
    { ...value.proposals[0].matches[0], matchId: "m1", sportId: "s1" },
    { ...value.proposals[0].matches[1], matchId: "m2", sportId: "s2" }
  ];
  const result = validate(value);
  assert.equal(result.proposals[0].errors.length, 0);
  assert.deepEqual(result.proposals[0].rows.map(row => row.matchId), [structure.sports[0].leagueMatchPairs[0].matchId, structure.sports[1].leagueMatchPairs[0].matchId]);
});
test("invalid JSON and malformed nested values produce diagnostics", () => {
  assert.equal(validateTimetableJSON("{", structure, settings).errors[0].code, "JSON");
  for (const proposal of [null, {}, { proposalId: "bad", matches: [null], warnings: [] }]) {
    const value = data(); value.proposals = [proposal];
    assert.ok(validate(value).proposals[0].errors.length);
  }
});
test("duplicate, missing and unknown IDs and team counts are detected", () => {
  const value = data(); value.proposals[0].matches = [row(0), row(0), { ...row(1), sportId: "unknown", matchId: "unknown" }];
  const codes = validate(value).proposals[0].errors.map(issue => issue.code);
  for (const code of ["DUPLICATE", "MISSING", "SPORT", "MATCH", "COUNT", "TEAM_COUNT"]) assert.ok(codes.includes(code), code);
});
test("event, duration, date and class overlaps are detected", () => {
  const value = data(); value.proposals[0].matches = [row(0, "12:00", "12:10", "12:15"), row(1, "12:00", "12:10", "12:15")];
  let result = validate(value).proposals[0];
  assert.ok(result.errors.some(issue => issue.code === "EVENT"));
  assert.ok(result.warnings.some(issue => issue.code === "CLASS_OVERLAP"));
  value.proposals[0].matches[0].date = "2026-10-22";
  value.proposals[0].matches[0].occupiedEnd = "12:20";
  result = validate(value).proposals[0];
  assert.ok(result.errors.some(issue => issue.code === "WINDOW"));
  assert.ok(result.errors.some(issue => issue.code === "DURATION"));
});
test("flexible lunch infers each sport's start and rejects matches crossing the shared end", () => {
  const flexible = structuredClone(settings);
  flexible.days[0].events = [{ name: "昼休み", startMode: "after-morning-matches", endTime: "13:00" }];
  const value = data();
  value.proposals[0].matches = [row(0, "11:30", "11:40", "11:45"), row(1, "11:45", "11:55", "12:00")];
  let checked = validateTimetableJSON(JSON.stringify(value), structure, flexible).proposals[0];
  assert.ok(!checked.errors.some(issue => issue.code === "EVENT"));
  assert.equal(checked.warnings.filter(issue => issue.code === "EVENT_START_INFERRED").length, 2);
  value.proposals[0].matches[1] = row(1, "12:50", "13:00", "13:05");
  checked = validateTimetableJSON(JSON.stringify(value), structure, flexible).proposals[0];
  assert.ok(checked.errors.some(issue => issue.code === "EVENT"));
});
test("infeasible AI responses are displayed without accepting a plan", () => {
  const value = data(); value.status = "infeasible"; value.proposals = []; value.errors = [{ code: "CAPACITY", message: "時間不足", relatedIds: [] }];
  assert.deepEqual(validate(value).errors.map(issue => issue.code), ["AI:CAPACITY", "INFEASIBLE"]);
});
test("tournament dependencies and possible class conflicts are checked", () => {
  const bracket = generateTournamentStructure({ sports: [{ sportId: "s1", format: "tournament", leagues: [{ teams: ["a", "b", "c", "d"].map(teamId => ({ teamId, teamName: teamId, classId: "class-a" })) }], tournamentSettings: { teamCount: 4 } }] });
  const value = data(); value.proposals[0].matches = bracket.sports[0].tournamentMatchPairs.map(match => ({ ...row(0), matchId: match.matchId }));
  const result = validateTimetableJSON(JSON.stringify(value), bracket, settings).proposals[0];
  assert.ok(result.errors.some(issue => issue.code === "DEPENDENCY"));
  assert.ok(result.errors.some(issue => issue.code === "VENUE"));
  assert.ok(result.warnings.some(issue => issue.code === "CLASS_POSSIBLE"));
});
