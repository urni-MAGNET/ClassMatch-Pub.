import { compactName } from '../common.js';
import { validateProfile } from './profile.js';

export function validateSetup(setup) {
  const errors = [], warnings = [];
  if (!setup.name?.trim()) errors.push('実施年度・学期を入力してください。');
  try { validateProfile(setup.input?.profile); } catch (error) { errors.push(error.message); }
  const branchNames = (setup.branches ?? []).map(branch => compactName(branch.name));
  if (branchNames.some(name => !name) || new Set(branchNames).size !== branchNames.length) errors.push('運営支部の名前が空欄または重複しています。');
  const classIds = new Set(), codes = new Set(), teamIds = new Set(), leagueIds = new Set();
  for (const row of setup.classes ?? []) {
    if (!row.classCode?.trim() || !row.className?.trim()) errors.push('学級コードと学級名を入力してください。');
    if (classIds.has(row.classId) || codes.has(row.classCode?.trim())) errors.push('学級IDまたは学級コードが重複しています。');
    classIds.add(row.classId); codes.add(row.classCode?.trim());
  }
  if (!classIds.size) warnings.push('学級マスターが未設定です。後から基本設定で追加できます。');
  if (!setup.classProfile) warnings.push('学級テンプレートは未設定です。学級マスターの直接入力でも利用できます。');
  for (const sport of setup.input?.sports ?? []) {
    let count = 0;
    for (const league of sport.leagues ?? []) {
      if (leagueIds.has(league.leagueId)) errors.push('グループIDが重複しています。');
      leagueIds.add(league.leagueId);
      for (const team of league.teams ?? []) {
        if (teamIds.has(team.teamId)) errors.push('チームIDが重複しています。');
        teamIds.add(team.teamId);
        if (team.classId && !classIds.has(team.classId)) errors.push('削除された学級を参照するチームがあります。学級を選び直してください。');
        if (team.placeholder) warnings.push(`${sport.sportName}: 未入力のチーム枠は下書きとして保存します。`);
        else { count++; if (!team.classId) warnings.push(`${team.teamName}: 学級未紐付けのため学級別得点に含まれません。`); }
      }
    }
    if (!count) warnings.push(`${sport.sportName}: 参加チームは後から登録できます。`);
    const minutes = setup.input.profile?.sports.find(item => item.id === sport.sportId)?.timing?.matchMinutes;
    if (!minutes) warnings.push(`${sport.sportName}: 試合時間は未設定です。`);
  }
  if (!setup.timetable?.json) warnings.push('タイムテーブルは未設定です。大会運営には影響しません。');
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

// Old tournaments are reconstructed from their relational data, never from a
// newly generated template that would discard existing IDs and team names.
export function restoreSetup(data) {
  const config = data.semester.sports_config ?? {};
  const saved = config.setup;
  const legacySports = [...new Set(data.leagues.map(row => row.sport).filter(Boolean))].map((name, index) => ({ id: `legacy-sport-${index + 1}`, name, format: 'manual' }));
  const profile = { profileName: config.templateSource?.profileName ?? data.semester.name, profileVersion: config.templateSource?.profileVersion ?? 1, sports: config.sports?.length ? config.sports : legacySports };
  const sports = profile.sports.map(sport => {
    const previous = saved?.input?.sports?.find(item => item.sportId === sport.id);
    return { ...previous, sportId: sport.id, sportName: sport.name, format: sport.format,
      tournamentSettings: previous?.tournamentSettings ?? { enabled: sport.tournament?.enabled, thirdPlace: sport.tournament?.thirdPlace, source: sport.format === 'tournament' ? 'manual' : 'leagues', teamCount: sport.tournament?.advanceTeams ?? 0 },
      leagues: data.leagues.filter(row => row.sport === sport.name).map(league => {
        const oldLeague = previous?.leagues?.find(item => String(item.dbId) === String(league.id));
        const teams = data.teams.filter(row => String(row.leagues_id) === String(league.id));
        return { ...oldLeague, leagueId: oldLeague?.leagueId ?? String(league.id), dbId: String(league.id), leagueName: league.league_name,
          drawMode: oldLeague?.drawMode ?? (sport.format === 'tournament' ? 'entries' : 'round_robin'), matchesPerTeam: oldLeague?.matchesPerTeam ?? 'all', advanceTeams: oldLeague?.advanceTeams ?? 0,
          teams: [...teams.map(team => { const old = oldLeague?.teams?.find(item => String(item.dbId) === String(team.id)); return {
            ...old, teamId: old?.teamId ?? String(team.id), dbId: String(team.id), teamName: team.teams_name, classId: team.class_id, entryLabel: team.entry_label ?? '', placeholder: false
          }; }), ...(oldLeague?.teams?.filter(team => team.placeholder && !team.dbId) ?? [])]
        };
      })
    };
  });
  return { ...saved, name: data.semester.name, input: { profile, sports }, classProfile: saved?.classProfile ?? null,
    classes: (data.classes ?? []).map(row => ({ classId: row.id, classCode: row.class_code, className: row.class_name })),
    branches: (data.branches ?? []).map(row => ({ dbId: String(row.id), name: row.branch_name })), timetable: saved?.timetable ?? null };
}
