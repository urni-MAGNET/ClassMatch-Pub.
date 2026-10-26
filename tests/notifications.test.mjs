import test from 'node:test';
import assert from 'node:assert/strict';
import { validPassword } from '../src/js/password-policy.js';
import { isOwnAnnouncement, oldestAnnouncementsFirst, completedResultIds, hasNewResults, newestCompletedResultAt, hasResultNewerThan } from '../src/js/notification-state.js';
import { generateTournamentData } from '../src/js/classmatch/tournament-data.js';
import { visualLeaguePoints } from '../src/js/classmatch/league-pairs.js';
test('password policy applies to ASCII letters and digits together, at least eight', () => {
  for (const value of ['abc12345', 'ABCdef12']) assert.equal(validPassword(value), true);
  for (const value of ['abc1234', 'abcdefgh', '12345678', 'abc12345!', 'ａｂｃ12345', 'abc12345\n']) assert.equal(validPassword(value), false);
});
test('announcement targets, broadcast exclusion, chronological history and new completed results', () => {
  assert.equal(isOwnAnnouncement({ created_to: '支部A' }, '1', '支部A'), true);
  assert.equal(isOwnAnnouncement({ created_to: '1' }, '1', '支部A'), true);
  assert.equal(isOwnAnnouncement({ created_to: '支部B' }, '1', '支部A'), false);
  assert.equal(isOwnAnnouncement({ created_to: '支部A', broadcast: true }, '1', '支部A'), false);
  assert.deepEqual(oldestAnnouncementsFirst([{id:2,created_at:'b'}, {id:1,created_at:'a'}]).map(row => row.id), [1,2]);
  assert.deepEqual(completedResultIds([{ id: 1, score_a: null, score_b: null }, { id: 2, score_a: 0, score_b: 1 }]), ['2']);
  assert.equal(hasNewResults(null, ['1']), false);
  assert.equal(hasNewResults(['1'], ['1']), false);
  assert.equal(hasNewResults(['1'], ['1','2']), true);
  assert.equal(newestCompletedResultAt([{ score_a: 1, score_b: 0, created_at: '2026-10-25T01:00:00Z' }, { score_a: null, score_b: null, created_at: '2026-10-25T02:00:00Z' }]), '2026-10-25T01:00:00Z');
  assert.equal(hasResultNewerThan('2026-10-25T01:00:00Z', '2026-10-25T01:00:01Z'), true);
  assert.equal(hasResultNewerThan('2026-10-25T01:00:00Z', '2026-10-25T01:00:00Z'), false);
});
test('third-place boxes have room beyond main bracket at all editable line lengths; square vertices remain square', () => {
  for (const step of [60,120,240]) {
    const data=generateTournamentData({ teams: [1,2,3,4].map(id=>({teamId:String(id),teamName:String(id)})), step, thirdPlace:true });
    assert.ok(data.points['third-start-a'].x - 188 > data.points[data.champion.pointId].x + 148);
  }
  const points=visualLeaguePoints(4);
  assert.ok(Math.abs(points[0].x-points[1].x)<0.001);
  assert.ok(Math.abs(points[0].y-points[3].y)<0.001);
});
