import test from "node:test";
import assert from "node:assert/strict";
import { generateTournamentData } from "../src/js/classmatch/tournament-data.js";
import { generateVisualLeaguePairs } from "../src/js/classmatch/league-pairs.js";
import { generateTournamentStructure } from "../src/js/classmatch/tournament-structure.js";
import { validateProfile } from "../src/js/classmatch/profile.js";

const teams = count => Array.from({ length: count }, (_, index) => ({ teamId: `t${index + 1}`, teamName: `Team ${index + 1}` }));

for (const [count, expectedRounds, expectedSeeds] of [[8, 3, [0, 0, 0]], [7, 3, [1, 0, 0]], [5, 3, [3, 0, 0]], [3, 2, [1, 0]]]) {
  test(`${count} teams: match order, byes, references, points and champion`, () => {
    const data = generateTournamentData({ teams: teams(count), prefix: `test-${count}`, step: 100 });
    assert.equal(data.totalMatches, count - 1);
    assert.equal(data.roundCount, expectedRounds);
    assert.deepEqual(data.rounds.map(round => round.seeds.length), expectedSeeds);
    assert.equal(data.rounds.at(-1).label, "Final");
    assert.equal(data.rounds.at(-1).matches.length, 1);
    assert.equal(data.champion.sourceMatchId, data.rounds.at(-1).matches[0].matchId);
    const all = data.matchPairs;
    assert.equal(new Set(all.map(match => match.matchId)).size, count - 1);
    const firstParticipants = data.rounds[0].matches.flatMap(match => [match.teamAId, match.teamBId]).concat(data.rounds[0].seeds.map(seed => seed.teamId));
    assert.equal(new Set(firstParticipants).size, count);
    for (const round of data.rounds) {
      const entrants = round.matches.flatMap(match => [match.teamAId, match.teamBId]).concat(round.seeds.map(seed => seed.teamId));
      assert.equal(new Set(entrants).size, entrants.length);
      for (const seed of round.seeds) {
        assert.equal(data.points[seed.fromPointId].y, data.points[seed.toPointId].y);
        assert.ok(data.drawPairs.some(([a, b]) => a === seed.fromPointId && b === seed.toPointId));
      }
      for (const match of round.matches) {
        assert.ok(match.teamA.teamName && match.teamB.teamName);
        for (const id of match.dependsOn) {
          const previous = all.find(item => item.matchId === id);
          assert.ok(previous.round < match.round && previous.order < match.order);
          assert.equal(previous.advancesTo, match.matchId);
        }
        const a = data.points[match.pointAId], b = data.points[match.pointBId], winner = data.points[match.winnerPointId];
        assert.deepEqual(data.roundPairs[match.roundPairId], [match.pointAId, match.pointBId]);
        assert.equal(winner.y, (a.y + b.y) / 2);
        assert.equal(winner.x, Math.max(a.x, b.x) + 100);
      }
    }
    for (const [a, b] of data.drawPairs) assert.ok(data.points[a] && data.points[b]);
    assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
  });
}

test("DOM start coordinates, no mutation and safe regeneration", () => {
  const input = teams(3);
  const original = structuredClone(input);
  const starts = input.map((_, index) => ({ x: 215, y: 50 + index * 75 }));
  const data = generateTournamentData({ teams: input, startPoints: starts, step: 80 });
  assert.deepEqual(data.points["start-1"], starts[0]);
  assert.deepEqual(data.points["1-1"], { x: 295, y: 50 });
  assert.deepEqual(input, original);
  assert.equal(generateTournamentData({ teams: teams(8) }).totalMatches, 7);
  assert.equal(generateTournamentData({ teams: teams(0) }).champion, null);
  assert.equal(generateTournamentData({ teams: teams(1) }).champion.teamId, "t1");
  assert.throws(() => generateTournamentData({ teams: [input[0], input[0]] }), /重複/);
  assert.throws(() => generateTournamentData({ teams: teams(257) }), /256/);
  assert.throws(() => generateTournamentData({ teams: input, step: -1 }));
});

test("tournament JSON aliases, editable entry counts and no league matches", () => {
  for (const format of ["tournament", "tornament"]) {
    const profile = validateProfile({ profileName: "Direct bracket", sports: [{ id: "soccer", name: "Soccer", format, tournament: { enabled: false, teamCount: 12 } }] });
    assert.equal(profile.sports[0].format, "tournament");
    assert.equal(profile.sports[0].tournament.enabled, true);
    assert.equal(profile.sports[0].tournament.advanceTeams, 12);
    const data = generateTournamentStructure({ profile, sports: [{ sportId: "soccer", format, tournamentSettings: { enabled: false, source: "manual", teamCount: 12 }, leagues: [{ leagueId: "entries", drawMode: "entries", teams: teams(12) }] }] });
    assert.equal(data.sports[0].totalLeagueMatches, 0);
    assert.equal(data.sports[0].tournament.totalMatches, 12);
    assert.ok(data.sports[0].tournament.thirdPlaceMatch);
    assert.deepEqual(data.sports[0].tournament.roundPairs["Round1-1"], ["1-2", "1-3"]);
    assert.deepEqual(data.sports[0].tournament.roundPairs["Round2-1"], ["2-1", "2-2"]);
  }
  const defaults = validateProfile({ sports: [{ name: "Default", format: "tournament" }] });
  assert.equal(defaults.sports[0].tournament.advanceTeams, 8);
});

test("league SVG edges equal exported pairs for 0 through 8 teams", () => {
  for (let count = 0; count <= 8; count += 1) {
    for (const squareMode of [2, 3]) {
      const pairs = generateVisualLeaguePairs(count, squareMode);
      const data = generateTournamentStructure({ sports: [{ sportId: "soccer", sportName: "Soccer", leagues: [{ leagueId: "A", leagueName: "League A", drawMode: "visual", matchesPerTeam: squareMode, teams: teams(count) }] }] });
      const league = data.sports[0].leagues[0];
      const expected = pairs.map(([a, b]) => [teams(count)[a].teamId, teams(count)[b].teamId].sort().join(":" )).sort();
      const actual = league.matches.map(match => [match.teamAId, match.teamBId].sort().join(":" )).sort();
      assert.deepEqual(actual, expected);
      for (const match of league.matches) {
        assert.equal(match.teamA.teamName, teams(count).find(team => team.teamId === match.teamAId).teamName);
        assert.equal(match.leagueName, "League A");
        assert.equal(match.sportName, "Soccer");
      }
      for (const round of new Set(league.matches.map(match => match.round))) {
        const ids = league.matches.filter(match => match.round === round).flatMap(match => [match.teamAId, match.teamBId]);
        assert.equal(new Set(ids).size, ids.length);
      }
    }
  }
});

test("league qualifiers create named placeholder teams and later winner slots", () => {
  const data = generateTournamentStructure({ sports: [{
    sportId: "soccer", sportName: "Soccer", tournamentSettings: { enabled: true, source: "leagues" },
    leagues: [
      { leagueId: "A", leagueName: "League A", advanceTeams: 2, drawMode: "visual", teams: teams(3) },
      { leagueId: "B", leagueName: "League B", advanceTeams: 1, drawMode: "visual", teams: teams(3).map(team => ({ ...team, teamId: `B-${team.teamId}` })) }
    ]
  }] });
  const sport = data.sports[0];
  assert.deepEqual(sport.tournament.teams.map(team => team.teamName), ["League A-1", "League B-1", "League A-2"]);
  assert.equal(sport.tournament.totalMatches, 2);
  const final = sport.tournament.rounds.at(-1).matches[0];
  assert.equal(final.teamB.sourceMatchId, sport.tournament.rounds[0].matches[0].matchId);
  assert.equal(final.teamA.sourceRank, 1);
  assert.equal(final.teamA.leagueId, "A");
});

test("league finals accept additional named custom slots", () => {
  const data = generateTournamentStructure({ sports: [{
    sportId: "soccer", sportName: "Soccer", tournamentSettings: {
      enabled: true, source: "leagues", extraTeams: [{ teamId: "wildcard", teamName: "推薦枠", placeholder: true }]
    },
    leagues: [{ leagueId: "A", leagueName: "League A", advanceTeams: 2, teams: teams(3) }]
  }] });
  assert.equal(data.sports[0].tournament.teamCount, 3);
  assert.equal(data.sports[0].tournament.teams.find(team => team.teamId === "wildcard").teamName, "推薦枠");
  assert.equal(data.sports[0].tournamentSettings.extraTeams[0].custom, true);
});

test("manual count, direct participants, disabled tournament and old round robin", () => {
  const input = { sports: [{ sportId: "soccer", tournamentSettings: { enabled: true, source: "manual", teamCount: 8 }, leagues: [{ teams: teams(3) }] }] };
  const sport = generateTournamentStructure(input).sports[0];
  assert.equal(sport.leagues[0].matches.length, 3);
  assert.equal(sport.tournament.teamCount, 8);
  assert.equal(sport.tournament.teams[0].teamId, "t1");
  assert.equal(sport.tournament.teams[7].placeholder, true);
  input.sports[0].tournamentSettings.enabled = false;
  assert.equal(generateTournamentStructure(input).sports[0].tournament.totalMatches, 0);
});
