import { collectClasses, restoreClasses, restoreTournamentInput } from './create.js';
import { collectTournamentInput } from './create-structure-data.js';
import { appendBranch } from './script.js';
import { validateSetup, restoreSetup } from '/src/js/classmatch/tournament-setup.js';
import { loadTournament, saveSetup, saveConfig } from './tournament-store.js';
import { collectTimetableForm } from './timetable-form-data.js';
import { popup } from '/src/js/popup.js';

const id = new URLSearchParams(location.search).get('semester_id');
const editing = location.pathname.includes('/edit/');
const documents = location.pathname.includes('/documents/');
const button = document.getElementById('register-new-system');
const status = document.createElement('p'); status.className = 'save-status'; status.setAttribute('role', 'status'); button.before(status);
if (editing && !documents) status.textContent = '参加チーム・組み合わせを変更すると、対象競技のトーナメント結果をリセットします。';
let loaded = null, savedSetup = null, busy = false;
let baseline = null, dirtyFrame = null;
let timetableEditedDuringLoad = false;
if (documents) {
  for (const target of ['create-timetable', 'create-timetable-import'].map(targetId => document.getElementById(targetId)).filter(Boolean)) {
    target.addEventListener('input', () => { if (!loaded) timetableEditedDuringLoad = true; });
    target.addEventListener('change', () => { if (!loaded) timetableEditedDuringLoad = true; });
  }
}
const quickSave = editing && !documents ? document.createElement('button') : null;
if (quickSave) {
  quickSave.type = 'button'; quickSave.className = 'basic-settings-update';
  quickSave.textContent = '基本設定を更新'; quickSave.hidden = true;
  quickSave.addEventListener('click', () => button.click());
  document.body.append(quickSave);
}
function message(text, level = 'info') { status.textContent = text; status.dataset.level = level; }

export function collectSetup() {
  return { version: 2, name: document.getElementById('conduct-semester').value.trim(),
    input: collectTournamentInput(), classes: collectClasses(), classProfile: window.classMatchImportedClassProfile ?? savedSetup?.classProfile ?? null,
    branches: [...document.querySelectorAll('#sport-branch .register-branch')].map(row => ({ name: row.querySelector('span').textContent, dbId: row.dataset.dbId || null })),
    timetable: (editing && !documents) || !window.classMatchTimetableReady ? savedSetup?.timetable ?? null : collectTimetableForm()
  };
}
function setupFingerprint() {
  try { return JSON.stringify(collectSetup()); } catch { return null; }
}
function checkDirty() {
  dirtyFrame = null;
  if (!quickSave || baseline === null || busy) return;
  quickSave.hidden = setupFingerprint() === baseline;
}
function scheduleDirtyCheck() {
  if (quickSave && dirtyFrame === null) dirtyFrame = requestAnimationFrame(checkDirty);
}
async function resetBaseline() {
  if (!quickSave) return;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  baseline = setupFingerprint(); quickSave.hidden = true;
}
async function restore(data) {
  savedSetup = restoreSetup(data);
  document.getElementById('conduct-semester').value = savedSetup.name;
  restoreClasses(savedSetup.classes);
  window.classMatchImportedClassProfile = savedSetup.classProfile;
  if (savedSetup.classProfile) document.getElementById('imported-class-profile-summary').textContent = savedSetup.classProfile.profileName;
  if (savedSetup.input.profile.sports.length) await restoreTournamentInput(savedSetup.input);
  document.getElementById('sport-branch').replaceChildren();
  savedSetup.branches.forEach(branch => appendBranch(branch.name, branch.dbId));
  if (savedSetup.timetable?.settings && !timetableEditedDuringLoad) {
    window.classMatchPendingTimetable = savedSetup.timetable;
    window.dispatchEvent(new CustomEvent('classmatch:restore-timetable', { detail: savedSetup.timetable }));
  }
  const timetableInput = document.getElementById('timetable-json-input');
  if (!timetableEditedDuringLoad) timetableInput.value = savedSetup.timetable?.json ?? '';
  window.classMatchPendingTimetableAutoLoad = !timetableEditedDuringLoad && Boolean(savedSetup.timetable?.json?.trim());
  window.classMatchSkippedTimetableAutoLoad = timetableEditedDuringLoad;
  // Keep the established event payload intact for document/rendering consumers.
  window.dispatchEvent(new CustomEvent('classmatch:setup-loaded', { detail: data }));
  if (timetableEditedDuringLoad) message('保存済みタイムテーブルを取得しましたが、読込中に編集された内容を優先して自動反映しませんでした。', 'warning');
  await resetBaseline();
}

button.addEventListener('click', async () => {
  if (busy) return;
  busy = true; button.disabled = true; if (quickSave) quickSave.disabled = true;
  try {
    if (documents && !window.classMatchTimetableReady) throw new Error('タイムテーブル画面の読み込みを待ってください。読み込みに失敗した場合は再読み込みしてください。');
    const setup = collectSetup();
    const { errors, warnings } = validateSetup(setup);
    if (errors.length && !documents) { message(`保存できません\n${errors.join('\n')}`, 'error'); return; }
    message(warnings.length ? `以下は未設定でも保存できます\n${warnings.join('\n')}\n保存中…` : '保存中…', warnings.length ? 'warning' : 'info');
    if (documents) {
      const config = structuredClone(loaded.semester.sports_config);
      config.setup = { ...config.setup, timetable: setup.timetable };
      config.sports = config.sports.map(sport => {
        const minutes = setup.timetable?.settings?.sportTimings[sport.id]?.matchMinutes;
        return { ...sport, timing: { ...sport.timing, matchMinutes: Number.isInteger(minutes) && minutes > 0 ? minutes : sport.timing?.matchMinutes ?? null } };
      });
      loaded.semester.sports_config = await saveConfig(id, config, config.revision ?? 0);
      message('タイムテーブルの設定・入力JSONを保存しました。検証結果は「読み込み・検証」で確認できます。');
      popup('保存しました', 'タイムテーブルの設定・入力JSONを保存しました。', 'success');
      return;
    }
    const result = await saveSetup({ id: editing ? loaded?.semester.id ?? id : null, schoolId: loaded?.semester.school_id ?? sessionStorage.getItem('schoolid'), setup, revision: loaded?.semester.sports_config?.revision ?? 0 });
    if (editing) {
      loaded = await loadTournament(result.id); await restore(loaded);
      message(`保存しました。${warnings.length ? '\n警告（後から設定可）\n' + warnings.join('\n') : ''}`, warnings.length ? 'warning' : 'info');
      popup('保存しました', warnings.length ? `基本設定を保存しました。<br>${warnings.join('<br>')}` : '基本設定を保存しました。', warnings.length ? 'warning' : 'success');
    } else location.href = `/mypage/edit/basic/?semester_id=${encodeURIComponent(result.id)}`;
  } catch (error) {
    message(`保存できませんでした: ${error.message}`, 'error');
    popup('保存できませんでした', error.message.replaceAll('\n', '<br>'), 'error');
  }
  finally { busy = false; button.disabled = false; if (quickSave) quickSave.disabled = false; scheduleDirtyCheck(); }
});

if (quickSave) {
  const main = document.querySelector('main');
  main.addEventListener('input', scheduleDirtyCheck);
  main.addEventListener('change', scheduleDirtyCheck);
  main.addEventListener('click', event => { if (event.target.closest('button')) setTimeout(scheduleDirtyCheck); });
  for (const target of ['sports-root', 'class-master-list', 'sport-branch'].map(id => document.getElementById(id)).filter(Boolean)) {
    new MutationObserver(scheduleDirtyCheck).observe(target, { childList: true, subtree: true });
  }
}

if (editing) {
  button.textContent = documents ? 'タイムテーブルの設定を保存' : '基本設定を保存';
  button.disabled = true;
  document.querySelector('main > h1').textContent = documents ? '大会資料作成' : '基本設定編集';
  if (!id) message('大会IDが指定されていません。マイページから大会を選択してください。', 'error');
  else loadTournament(id).then(async data => { loaded = data; await restore(data); button.disabled = false; message(documents ? '読み込みました。' : '読み込みました。参加チーム・組み合わせを変更すると、対象競技のトーナメント結果をリセットします。'); }).catch(error => message(error.message, 'error'));
}
