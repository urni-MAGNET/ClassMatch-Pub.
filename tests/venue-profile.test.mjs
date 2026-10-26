import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSport, validateProfile, tournamentConfigFromProfile } from "../src/js/classmatch/profile.js";
import { generateTournamentStructure } from "../src/js/classmatch/tournament-structure.js";
import { generateTimetablePrompt } from "../src/js/classmatch/timetable-prompt.js";

test("venue persists through profile, tournament structure and AI input", () => {
  assert.equal(normalizeSport({ name: "競技" }).venue, "");
  const profile = validateProfile({ profileName: "場所", sports: [{ id: "s", name: "競技", venue: " 第１体育館  ", format: "league" }] });
  assert.equal(profile.sports[0].venue, "第1体育館");
  assert.equal(tournamentConfigFromProfile(profile).sports[0].venue, "第1体育館");
  const structure = generateTournamentStructure({ profile, sports: [{ sportId: "s", leagues: [] }] });
  assert.equal(structure.sports[0].venue, "第1体育館");
  const settings = { sportTimings: { s: { matchMinutes: 10, beforeMinutes: 0, afterMinutes: 5 } }, days: [{ date: "2026-10-21", availableTimes: [{ startTime: "09:00", endTime: "16:00" }], events: [] }] };
  const prompt = generateTimetablePrompt(structure, settings);
  assert.deepEqual(JSON.parse(prompt.split("入力JSON:\n")[1]).sports[0].courts, [{ venue: "第1体育館", court: "" }]);
  assert.match(prompt, /"court":"選択したコート"/);
});
test("multiple courts persist and normalized duplicate courts are rejected", () => {
  const profile = validateProfile({ profileName: "複数", sports: [{ id: "s", name: "競技", courts: [{ venue: " 体育館 ", court: "Ａ" }, { venue: "体育館", court: "B" }] }] });
  assert.deepEqual(profile.sports[0].courts, [{ venue: "体育館", court: "A" }, { venue: "体育館", court: "B" }]);
  const structure = generateTournamentStructure({ profile, sports: [{ sportId: "s", leagues: [] }] });
  assert.deepEqual(structure.sports[0].courts, profile.sports[0].courts);
  assert.throws(() => validateProfile({ profileName: "重複", sports: [{ name: "競技", courts: [{ venue: "体育館", court: "A" }, { venue: "体育館", court: "Ａ" }] }] }), /重複/);
});
