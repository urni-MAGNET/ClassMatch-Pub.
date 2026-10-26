import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const school = '11111111-1111-4111-8111-111111111111';
const classId = '22222222-2222-4222-8222-222222222222';
let migration = null;
try {
  migration = await fs.readFile(new URL('../supabase/tournament_setup.sql', import.meta.url), 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
test('PostgreSQL save transactions: create, ID mapping, update, rollback, revision conflict and scope', { skip: migration ? false : 'SQL migration is not included in this repository' }, async () => {
  const db = new PGlite();
  try {
    // Representative existing schema. Production RLS/schema still needs deployment verification.
    await db.exec(`create schema auth; create function auth.uid() returns uuid language sql as $$ select '${school}'::uuid $$;
      create role anon; create role authenticated;
      create table semesters(id bigint generated always as identity primary key, school_id uuid, name text, sports_config jsonb);
      create table tournament_classes(id uuid primary key, semester_id text, class_code text, class_name text, sort_order int, unique(semester_id,class_code));
      create table leagues(id bigint generated always as identity primary key, semester_id bigint references semesters(id), sport text, league_name text);
      create table leagues_teams(id bigint generated always as identity primary key, leagues_id bigint references leagues(id), teams_name text, class_id uuid references tournament_classes(id), entry_label text);
      create table semesters_branch(id bigint generated always as identity primary key, semester_id bigint references semesters(id), branch_name text, passcode text);
      create table matches(id bigint generated always as identity primary key, semester_id bigint references semesters(id), match_game text, match_type text, team_a bigint references leagues_teams(id), team_b bigint references leagues_teams(id), score_a int, score_b int, winner bigint, played_at timestamptz);
      create table sport_results(semester_id text, sport_id text, team_id bigint references leagues_teams(id), manual_points numeric, rank int, wins int, tournament_wins int, goals_for int, goals_against int, win_rank int, team_count int, calculated_points numeric, participated boolean);
    `);
    await db.exec(migration);
    await db.exec(migration); // idempotent migration
    const setup = { name: '2026', classes: [{ classId, classCode: '1A', className: '1A' }], branches: [{ name: '本部', dbId: '999' }], input: { profile: { profileName: 'P', profileVersion: 1, sports: [{ id: 's', name: 'S', timing: { matchMinutes: 12 } }] }, sports: [{ sportId: 's', sportName: 'S', tournamentSettings: { enabled: true }, leagues: [{ leagueId: 'local-league', leagueName: 'L', teams: [{ teamId: 'local-a', teamName: 'A', classId }, { teamId: 'local-b', teamName: 'B' }, { teamId: 'local-c', teamName: 'C', placeholder: true }] }] }] } };
    const save = async (id, value, revision) => (await db.query('select save_tournament_setup($1,$2,$3::jsonb,$4) as saved', [id, school, JSON.stringify(value), revision])).rows[0].saved;
    setup.plannedMatches = [
      { match_key:'s-league-1',sport_id:'s',sport_name:'S',phase:'league',round:1,team_a:'local-a',team_b:'local-b',depends_on:[] },
      { match_key:'s-final',sport_id:'s',sport_name:'S',phase:'final_tournament',round:2,team_a:null,team_b:null,source_a:{matchId:'s-league-1'},depends_on:['s-league-1'] }
    ];
    const created = await save(null, setup, 0);
    const scheduled = (await db.query('select * from scheduled_matches order by round')).rows;
    assert.equal(scheduled.length,2); assert.ok(scheduled[0].team_a); assert.equal(scheduled[1].team_a,null); assert.equal(scheduled[1].team_b,null);
    assert.equal(scheduled[0].team_a.toString(), created.config.setup.input.sports[0].leagues[0].teams[0].dbId);

    assert.equal(created.config.revision, 1);
    const persisted = created.config.setup;
    assert.ok(persisted.input.sports[0].leagues[0].dbId);
    assert.ok(persisted.input.sports[0].leagues[0].teams[0].dbId);
    assert.equal((await db.query('select count(*)::int as n from leagues_teams')).rows[0].n, 2);
    const passcode = (await db.query('select passcode from semesters_branch')).rows[0].passcode;
    persisted.name = '2026 改';
    const edited = await save(created.id, persisted, 1);
    assert.equal(edited.config.revision, 2);
    assert.equal((await db.query('select count(*)::int as n from leagues_teams')).rows[0].n, 2);
    assert.equal((await db.query('select passcode from semesters_branch')).rows[0].passcode, passcode);
    await assert.rejects(save(created.id, persisted, 1), /別の画面/);
    const invalid = structuredClone(persisted); invalid.input.sports[0].leagues[0].teams[0].classId = '33333333-3333-4333-8333-333333333333';
    await assert.rejects(save(null, invalid, 0), /学級|duplicate/);
    assert.equal((await db.query('select count(*)::int as n from semesters')).rows[0].n, 1);
    await assert.rejects(db.query('select save_tournament_setup($1,$2,$3::jsonb,$4)', [created.id, 'other-school', JSON.stringify(persisted), 2]), /認証/);
    const league = persisted.input.sports[0].leagues[0];
    const matches = [{ bracket_key: 's-final', bracket_identity: 'fingerprint', match_game: 'S', match_type: '決勝', team_a: league.teams[0].dbId, team_b: league.teams[1].dbId, score_a: 2, score_b: 0, winner: league.teams[0].dbId }];
    await db.query('select save_tournament_state($1,$2::jsonb,$3,$4::jsonb)', [created.id, JSON.stringify(edited.config), 2, JSON.stringify(matches)]);
    assert.equal((await db.query('select count(*)::int as n from matches')).rows[0].n, 1);
    await db.query('select save_tournament_state($1,$2::jsonb,$3,$4::jsonb)', [created.id, JSON.stringify(edited.config), 3, '[]']);
    assert.equal((await db.query('select count(*)::int as n from matches')).rows[0].n, 0);
    const parent = { ...matches[0], bracket_key: 's-semi', bracket_dependencies: [] };
    const final = { ...matches[0], bracket_key: 's-final', bracket_dependencies: ['s-semi'] };
    const third = { ...matches[0], bracket_key: 's-third', bracket_dependencies: ['s-semi'] };
    await db.query('select save_tournament_state($1,$2::jsonb,$3,$4::jsonb)', [created.id, JSON.stringify(edited.config), 4, JSON.stringify([parent, final, third])]);
    await db.query('update matches set score_a=3 where bracket_key=$1', ['s-semi']);
    assert.deepEqual((await db.query('select bracket_key from matches')).rows.map(row => row.bracket_key), ['s-semi']);
    await assert.rejects(db.query('select save_tournament_state($1,$2::jsonb,$3,$4::jsonb)', [created.id, JSON.stringify(edited.config), 5, JSON.stringify([parent, final, third])]), /別の画面/);
    // A partial setup is a valid, reloadable transaction.
    const partial = structuredClone(setup); partial.plannedMatches = []; partial.classes = []; partial.branches = []; partial.input.sports[0].leagues = [];
    const minimal = await save(null, partial, 0); assert.equal(minimal.config.setup.input.sports[0].leagues.length, 0);
    // SECURITY DEFINER keeps the explicitly authorized transaction independent
    // from incomplete or restrictive child/parent RLS policies.
    await db.exec('grant usage on schema public,auth to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated; grant usage,select on all sequences in schema public to authenticated; alter table semesters enable row level security; drop policy tournament_setup_owner_update on semesters; set role authenticated');
    assert.equal((await save(minimal.id,partial,1)).config.revision,2);
    await db.exec('reset role'); await db.exec(migration); await db.exec('set role authenticated');
    await db.exec('reset role');
    // Unknown references must roll back the complete transaction.
    const badPlan=structuredClone(partial); badPlan.plannedMatches=[{match_key:'bad',team_a:'another-tournament'}];
    await assert.rejects(save(minimal.id,badPlan,2), /未登録/);
    assert.equal((await db.query('select sports_config from semesters where id=$1',[minimal.id])).rows[0].sports_config.revision,2);

  } finally { await db.close(); }
});
