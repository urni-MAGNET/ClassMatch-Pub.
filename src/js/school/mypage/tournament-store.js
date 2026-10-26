import { plannedMatches } from '/src/js/classmatch/scheduled-matches.js';
import { supabase } from '/src/js/supabase.js';
export async function loadTournament(id) {
  const requests = await Promise.all([
    supabase.from('semesters').select('*').eq('id', id).single(),
    supabase.from('tournament_classes').select('*').eq('semester_id', id).order('sort_order'),
    supabase.from('leagues').select('*').eq('semester_id', id),
    supabase.from('semesters_branch').select('*').eq('semester_id', id),
    supabase.from('matches').select('*').eq('semester_id', id)
  ]);
  for (const result of requests) if (result.error) throw result.error;
  const [semester, classes, leagues, branches, matches] = requests.map(result => result.data);
  const teams = leagues.length ? await supabase.from('leagues_teams').select('*').in('leagues_id', leagues.map(row => row.id)) : { data: [] };
  if (teams.error) throw teams.error;
  return { semester, classes, leagues, branches, matches, teams: teams.data };
}
export async function saveSetup({ id = null, schoolId, setup, revision = 0 }) {
  if (!schoolId) throw new Error('ログイン情報を確認できません。再ログインしてから保存してください。');
  setup = { ...setup, plannedMatches: plannedMatches(setup.input) };
  const tournamentId = id == null ? null : String(id).trim();
  if (!tournamentId) {
    // Drafts and browser-restored DOM can contain IDs from another tournament.
    // A new tournament must always create its own branch rows.
    setup = { ...setup, branches: (setup.branches ?? []).map(({ dbId: _discarded, ...branch }) => branch) };
  } else {
    const latest = await supabase.from('semesters_branch').select('id,branch_name').eq('semester_id', tournamentId);
    if (latest.error) throw new Error(`支部情報を更新できませんでした: ${latest.error.message}`);
    const idsByName = new Map((latest.data ?? []).map(row => [row.branch_name.trim(), String(row.id)]));
    setup = { ...setup, branches: (setup.branches ?? []).map(branch => ({
      ...branch,
      // Never send an ID merely because it was cached in the page. Only IDs
      // confirmed to belong to this tournament in the latest query are valid.
      dbId: idsByName.get(branch.name.trim()) ?? null
    })) };
  }
  const save = () => supabase.rpc('save_tournament_setup', { p_id: tournamentId, p_school_id: schoolId, p_setup: setup, p_revision: revision });
  let { data, error } = await save();
  // A branch may have been deleted and recreated without changing the semester
  // revision. Reconcile stale browser IDs by name and retry the atomic save once.
  if (error?.message?.includes('支部が変更されています') && tournamentId) {
    const latest = await supabase.from('semesters_branch').select('id,branch_name').eq('semester_id', tournamentId);
    if (!latest.error) {
      const idsByName = new Map((latest.data ?? []).map(row => [row.branch_name.trim(), String(row.id)]));
      setup = { ...setup, branches: (setup.branches ?? []).map(branch => ({ ...branch, dbId: idsByName.get(branch.name.trim()) ?? null })) };
      ({ data, error } = await save());
    }
  }
  if (error) {
    console.error('save_tournament_setup failed', error);
    if (error.code === 'PGRST202' || error.code === '42883') throw new Error('保存機能のDB更新が必要です。Supabase SQL Editorで supabase/tournament_setup.sql を適用してください。入力内容は保持されています。');
    const detail = [error.message, error.details, error.hint].filter(Boolean).join(' / ');
    throw new Error(detail || `保存APIでエラーが発生しました（${error.code || 'HTTP 400'}）。`);
  }
  return data;
}
export async function saveConfig(id, config, revision, matches = null) {
  const next = { ...config, revision: revision + 1 };
  if (matches !== null) {
    const { error } = await supabase.rpc('save_tournament_state', { p_id: String(id), p_config: next, p_revision: revision, p_matches: matches.filter(match => match.managed) });
    if (error) throw new Error(error.message);
    return next;
  }
  let query = supabase.from('semesters').update({ sports_config: next }).eq('id', id);
  query = revision ? query.eq('sports_config->>revision', String(revision)) : query.or('sports_config->>revision.is.null,sports_config->>revision.eq.0');
  const { data, error } = await query.select('id');
  if (error) throw error;
  if (data?.length !== 1) throw new Error('別の画面で更新されました。再読み込みしてから保存してください。');
  return next;
}
