import test from "node:test";
import assert from "node:assert/strict";
import { generateTournamentStructure } from "../src/js/classmatch/tournament-structure.js";
import { generateTimetablePrompt } from "../src/js/classmatch/timetable-prompt.js";

const structure = generateTournamentStructure({ sports: [{ sportId: "s1", sportName: "競技", format: "league", leagues: [{ leagueId: "l1", teams: [{ teamId: "a", teamName: "A", classId: "c1" }, { teamId: "b", teamName: "B", classId: "c2" }], advanceTeams: 2 }], tournamentSettings: { enabled: true, source: "leagues" } }] });
const settings = { sportTimings: { s1: { matchMinutes: 10, beforeMinutes: 2, afterMinutes: 3 } }, days: ["2026-10-11", "2026-10-12"].map(date => ({ date, availableTimes: [{ startTime: "09:00", endTime: "16:00" }], events: [{ name: "昼休み", startTime: "12:00", endTime: "13:00" }] })) };

test("prompt preserves scheduling constraints with compact IDs", () => {
  const prompt = generateTimetablePrompt(structure, settings, { name: "大会" }, "午後に決勝");
  const data = JSON.parse(prompt.split("入力JSON:\n")[1]);
  assert.equal(data.days.length, 2);
  assert.equal(data.instructions, "午後に決勝");
  assert.equal(data.idEncoding, "compact-v2");
  assert.deepEqual(data.sports[0].teams[0], { id: "t1", class: "c1" });
  assert.equal(data.sports[0].matches.length, structure.sports[0].totalMatches);
  assert.ok(data.sports[0].matches.every(match => /^m\d+$/.test(match.id)));
  assert.ok(data.sports[0].matches.every(match => match.slots.length === 2));
  assert.ok(data.sports[0].matches.every(match => !("a" in match) && !("b" in match)));
  assert.doesNotMatch(JSON.stringify(data), /teamAId|teamBId|tournamentMatchPairs|leagueMatchPairs/);
  assert.match(prompt, /classmatch-timetable/);
  assert.match(prompt, /infeasible/);
  assert.match(prompt, /全候補が同時に/);
});

test("compact slots preserve winner and loser semantics", () => {
  const semifinalA = { matchId: "semi-a", teamA: { teamId: "a" }, teamB: { teamId: "b" }, dependsOn: [] };
  const semifinalB = { matchId: "semi-b", teamA: { teamId: "c" }, teamB: { teamId: "d" }, dependsOn: [] };
  const final = { matchId: "final", teamA: { sourceMatchId: "semi-a" }, teamB: { sourceMatchId: "semi-b" }, dependsOn: ["semi-a", "semi-b"] };
  const third = { matchId: "third", teamA: { sourceMatchId: "semi-a", sourceOutcome: "loser" }, teamB: { sourceMatchId: "semi-b", sourceOutcome: "loser" }, dependsOn: ["semi-a", "semi-b"] };
  const custom = structuredClone(structure);
  custom.sports[0].teams = ["a", "b", "c", "d"].map((teamId, index) => ({ teamId, classId: `c${index + 1}` }));
  custom.sports[0].leagueMatchPairs = [];
  custom.sports[0].tournamentMatchPairs = [semifinalA, semifinalB, final, third];
  const data = JSON.parse(generateTimetablePrompt(custom, settings).split("入力JSON:\n")[1]);
  assert.deepEqual(data.sports[0].matches[2].slots.map(slot => slot.outcome), ["winner", "winner"]);
  assert.deepEqual(data.sports[0].matches[3].slots.map(slot => slot.outcome), ["loser", "loser"]);
  assert.deepEqual(data.sports[0].matches[2].slots[0].candidates, ["t1", "t2"]);
});

test("UUID-heavy structures are omitted from the compact prompt", () => {
  const uuid = "123e4567-e89b-12d3-a456-426614174000";
  const heavy = structuredClone(structure);
  heavy.sports[0].sportId = `${uuid}-sport`;
  heavy.sports[0].teams.forEach((team, index) => { team.teamId = `${uuid}-team-${index}`; team.classId = `${uuid}-class-${index}`; });
  const localSettings = structuredClone(settings);
  localSettings.sportTimings = { [`${uuid}-sport`]: settings.sportTimings.s1 };
  const prompt = generateTimetablePrompt(heavy, localSettings, { name: "大会", profile: { duplicated: "x".repeat(300000) } });
  assert.doesNotMatch(prompt, /123e4567|duplicated/);
  assert.ok(prompt.length < 10000, `prompt length: ${prompt.length}`);
});

test("invalid dates, overlapping windows and invalid duration fail", () => {
  for (const mutate of [
    s => { s.days[0].date = "2026-02-30"; },
    s => { s.days[1].date = s.days[0].date; },
    s => { s.days[0].availableTimes.push({ startTime: "10:00", endTime: "11:00" }); },
    s => { s.sportTimings.s1.matchMinutes = 0; },
    s => { s.days[0].events[0].endTime = "11:00"; }
  ]) {
    const copy = structuredClone(settings);
    mutate(copy);
    assert.throws(() => generateTimetablePrompt(structure, copy));
  }
});

test("an event may start after each sport's last morning match", () => {
  const copy = structuredClone(settings);
  copy.days[0].events = [{ name: "昼休み", startMode: "after-morning-matches", endTime: "13:00" }];
  const prompt = generateTimetablePrompt(structure, copy);
  const data = JSON.parse(prompt.split("入力JSON:\n")[1]);
  assert.equal(data.days[0].events[0].startTime, undefined);
  assert.equal(data.days[0].events[0].startMode, "after-morning-matches");
  assert.match(prompt, /午前に配置すると決めた全試合/);
});

test("an each-sport event is expanded to one scoped event per sport", () => {
  const copy = structuredClone(settings);
  copy.days[0].events = [{ name: "昼休み", scope: "each-sport", startMode: "after-morning-matches", endTime: "13:00" }];
  const data = JSON.parse(generateTimetablePrompt(structure, copy).split("入力JSON:\n")[1]);
  assert.equal(data.days[0].events.length, structure.sports.length);
  assert.deepEqual(data.days[0].events.map(event => event.sportId), data.sports.map(sport => sport.id));
  assert.ok(data.days[0].events.every(event => event.scope === undefined));
});
