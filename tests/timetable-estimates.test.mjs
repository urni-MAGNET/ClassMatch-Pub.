import test from "node:test";
import assert from "node:assert/strict";
import { availableMinutes, durationLabel, sportTimeEstimate } from "../src/js/classmatch/timetable-estimates.js";

test("available minutes add valid windows", () => {
  assert.equal(availableMinutes([
    { startTime: "09:00", endTime: "12:00" },
    { startTime: "13:00", endTime: "16:20" }
  ]), 380);
  assert.equal(availableMinutes([{ startTime: "16:00", endTime: "09:00" }, { startTime: "", endTime: "" }]), 0);
});

test("sport estimate includes buffers and divides by courts", () => {
  assert.deepEqual(sportTimeEstimate(
    { totalMatches: 25, courts: [{}, {}] },
    { matchMinutes: 20, beforeMinutes: 2, afterMinutes: 3 }
  ), { matchCount: 25, minutesPerMatch: 25, totalMinutes: 625, courtCount: 2, estimatedMinutes: 313 });
  assert.equal(sportTimeEstimate({ totalMatches: 4, courts: [] }, { matchMinutes: 10, beforeMinutes: 0, afterMinutes: 5 }).courtCount, 1);
});

test("duration labels show minutes and hours", () => {
  assert.equal(durationLabel(45), "45分");
  assert.equal(durationLabel(150), "150分（2時間30分）");
  assert.equal(durationLabel(120), "120分（2時間）");
});
