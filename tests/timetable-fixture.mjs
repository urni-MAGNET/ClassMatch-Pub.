const sports = [
  { sportId: "s", sportName: "サッカー", courts: [{ venue: "校庭", court: "A" }, { venue: "校庭", court: "B" }], teams: [{ teamId: "a", teamName: "25R" }, { teamId: "b", teamName: "27R" }] },
  { sportId: "b", sportName: "バスケットボール", courts: [{ venue: "体育館", court: "A" }] }
];
const settings = { days: ["2026-10-22", "2026-10-21"].map(date => ({ date, availableTimes: [{ startTime: "09:00", endTime: "14:00" }], events: [{ name: "開会式", startTime: "09:00", endTime: "09:10" }, { name: "昼休み", startTime: "12:00", endTime: "13:00" }] })) };
const rows = [
  { matchId: "m1", date: "2026-10-21", sportId: "s", venue: "校庭", court: "A", occupiedStart: "09:10", startTime: "09:12", endTime: "09:28", occupiedEnd: "09:30", match: { teamAId: "a", teamBId: "b" } },
  { matchId: "m2", date: "2026-10-21", sportId: "b", occupiedStart: "09:10", startTime: "09:12", endTime: "09:22", occupiedEnd: "09:25", match: { teamA: { teamName: "11R" }, teamB: { teamName: "12R" } } },
  { matchId: "m3", date: "2026-10-21", sportId: "s", venue: "校庭", court: "A", occupiedStart: "09:30", startTime: "09:32", endTime: "09:48", occupiedEnd: "09:50", match: { teamAId: "a", teamBId: "b" } },
  { matchId: "m4", date: "2026-10-21", sportId: "s", venue: "校庭", court: "B", occupiedStart: "10:00", startTime: "10:02", endTime: "10:18", occupiedEnd: "10:20", match: { teamA: { teamId: "rank1", sourceLeagueId: "L", sourceRank: 1 }, teamB: { teamId: "winner", sourceMatchId: "m1", teamName: "第1回戦の勝者" } } }
];
export const fixture = { rows, settings, sports };
