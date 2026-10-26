import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.CLASSMATCH_PLAYWRIGHT_MODULE || 'playwright');
const artifactRoot = path.resolve('artifacts.local'); await fs.mkdir(artifactRoot, { recursive: true });
const artifacts = await fs.mkdtemp(path.join(artifactRoot, 'magnet-upgrade-'));

const profile = { profileName: '大会', profileVersion: 1, sports: [{ id: 's', name: 'サッカー', format: 'tournament', timing: { matchMinutes: 12 }, tournament: { enabled: true, advanceTeams: 4, thirdPlace: true, placementAutoDetect: true }, scoreRule: { type: 'formula', formula: 'もし(順位 > 0, 勝利数 * 10 + 40 / 順位, 0)' } }] };
const fixture = { semesters: [{ id: 1, school_id: 'school', name: '2026年度', sports_config: { schemaVersion: 2, sports: profile.sports, revision: 1 } }], leagues: [{ id: 10, semester_id: 1, sport: 'サッカー', league_name: '参加チーム' }], leagues_teams: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, leagues_id: 10, teams_name: `T${i + 1}`, class_id: `c${i + 1}`, entry_label: '' })), tournament_classes: Array.from({ length: 4 }, (_, i) => ({ id: `c${i + 1}`, semester_id: '1', class_code: `1${i}`, class_name: `学級${i + 1}`, sort_order: i })), semesters_branch: [{ id: 1, semester_id: 1, branch_name: 'システム管理者', passcode: '1234' }], matches: [], sport_results: [], matches_report: [], announcements: [] };
const mock = `
const read = () => JSON.parse(localStorage.getItem('test-db'));
const write = db => localStorage.setItem('test-db', JSON.stringify(db));
export const sortNewestFirst = rows => rows; export const sortMatchesNewestFirst = rows => rows;
export async function coreScoreDataSB(id) { const db=read();return {semester:db.semesters.find(s=>String(s.id)===String(id)),leagues:db.leagues,teams:db.leagues_teams,classes:db.tournament_classes,matches:db.matches,results:db.sport_results}; }
export const supabase = {
 channel(){const q={on(){return q;},subscribe(){return q;}};return q;},
 from(table) { let mode='read', payload, predicates=[], single=false;
 const q = { select(){ return q; }, single(){single=true;return q;}, maybeSingle(){single=true;return q;}, order(){return q;},
 eq(key,value){predicates.push(row => String(key.includes("->>") ? row[key.split("->>")[0]]?.[key.split("->>")[1]] : row[key])===String(value));return q;}, in(key,values){predicates.push(row => values.map(String).includes(String(row[key])));return q;}, or(){return q;},
 insert(value){mode='insert';payload=value;return q;}, upsert(value){mode='upsert';payload=value;return q;}, update(value){mode='update';payload=value;return q;}, delete(){mode='delete';return q;},
 then(resolve){const db=read();let rows=db[table]??=[];let selected=rows.filter(row=>predicates.every(fn=>fn(row)));
 if(mode==='insert'){selected=(Array.isArray(payload)?payload:[payload]).map(row=>({...row,id:rows.length+1}));rows.push(...selected);}
 if(mode==='update') selected.forEach(row=>Object.assign(row,payload));
 if(mode==='upsert'){selected=(Array.isArray(payload)?payload:[payload]);for(const row of selected){const old=rows.find(item=>item.team_id===row.team_id&&item.sport_id===row.sport_id);if(old)Object.assign(old,row);else rows.push(row);}}
 if(mode==='delete')rows=rows.filter(row=>!selected.includes(row));db[table]=rows;write(db);resolve({data:single?selected[0]:selected,error:null});}
 };return q; },
 async rpc(name,args){const db=read();if(name==='save_tournament_setup'){
 const setup=structuredClone(args.p_setup);let sem=db.semesters.find(row=>String(row.id)===String(args.p_id));if(!sem){sem={id:db.semesters.length+1,school_id:args.p_school_id};db.semesters.push(sem);}
 for(const sport of setup.input.sports)for(const league of sport.leagues){league.dbId ||= String(100+db.leagues.length);if(!db.leagues.some(row=>String(row.id)===league.dbId))db.leagues.push({id:league.dbId,semester_id:sem.id,sport:sport.sportName,league_name:league.leagueName});for(const team of league.teams){if(team.placeholder)continue;team.dbId ||= String(100+db.leagues_teams.length);const row={id:team.dbId,leagues_id:league.dbId,teams_name:team.teamName,class_id:team.classId,entry_label:team.entryLabel};const old=db.leagues_teams.find(item=>String(item.id)===team.dbId);if(old)Object.assign(old,row);else db.leagues_teams.push(row);}}
 sem.name=setup.name;sem.sports_config={...sem.sports_config,revision:(args.p_revision??0)+1,sports:setup.input.profile.sports,setup};write(db);return {data:{id:sem.id,config:sem.sports_config},error:null};}
 if(name==='save_tournament_state'){const sem=db.semesters.find(row=>String(row.id)===String(args.p_id));if((sem.sports_config.revision??0)!==args.p_revision)return {error:{message:'競合'}};sem.sports_config=args.p_config;db.matches=db.matches.filter(row=>!row.bracket_key);db.matches.push(...args.p_matches.map((row,i)=>({...row,id:1000+i})));write(db);return {error:null};}
 return {error:{message:'Unexpected RPC'}};
 }
};`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CLASSMATCH_BROWSER_EXECUTABLE });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } }); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(fixture => { if (!localStorage.getItem('test-db')) localStorage.setItem('test-db', JSON.stringify(fixture)); sessionStorage.setItem('schoolid', 'school'); }, fixture);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'esm.sh' && url.pathname.startsWith('/qrcode')) return route.fulfill({ contentType: 'text/javascript', body: 'export default {toCanvas:async()=>{}};' });
    if (url.hostname !== 'localhost') return route.abort();
    if (['/src/js/school/mypage/login.js','/src/js/system/session.js','/src/js/system/message.js'].includes(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: '' });
    if (url.pathname === '/src/js/supabase.js') return route.fulfill({ contentType: 'text/javascript', body: mock });
    try { const file = path.resolve('.' + url.pathname + (url.pathname.endsWith('/') ? 'index.html' : '')); const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }; await route.fulfill({ body: await fs.readFile(file), contentType: types[path.extname(file)] || 'text/plain' }); }
    catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await page.goto('http://localhost:4179/mypage/edit/basic/?semester_id=1');
  await page.waitForFunction(() => document.querySelector('.save-status').textContent.includes('読み込みました'));
  assert.equal(await page.locator('.basic-settings-update').isHidden(), true);
  assert.equal(await page.locator('.sport-match-minutes').inputValue(), '12');
  assert.equal(await page.locator('.team-wrap').count(), 4);
  for (const step of [60, 240]) {
    await page.locator('.tournament-line-length').fill(String(step));
    await page.waitForFunction(step => window.classMatchTournamentData?.sports[0].tournament.geometry.step === step, step);
    const alignment = await page.evaluate(() => {
      const stage = document.querySelector('.tournament-stage'), bounds = stage.getBoundingClientRect();
      const box = [...stage.querySelectorAll('span.tournament-team')].find(node => node.textContent === '準決勝1の敗者').getBoundingClientRect();
      const point = window.classMatchTournamentData.sports[0].tournament.points['third-start-a'];
      return [Math.abs(box.right - bounds.left - stage.clientLeft - point.x), Math.abs(box.top + box.height/2 - bounds.top - stage.clientTop - point.y)];
    });
    assert.ok(alignment.every(delta => delta < 1), `third place alignment: ${alignment}`);
  }
  assert.equal(await page.locator('.league-teams').first().inputValue(), 'T1');
  await page.locator('.sport-match-minutes').fill('15');
  await page.waitForFunction(() => !document.querySelector('.basic-settings-update').hidden);
  await page.locator('.basic-settings-update').click();
  await page.waitForFunction(() => document.querySelector('.save-status').textContent.startsWith('保存しました'));
  assert.equal(await page.locator('.basic-settings-update').isHidden(), true);
  await page.reload(); await page.waitForFunction(() => document.querySelector('.sport-match-minutes')?.value === '15');
  assert.equal(await page.locator('.team-wrap').count(), 4);
  assert.equal(await page.locator('#create-timetable').isVisible(), false);
  await page.goto('http://localhost:4179/mypage/edit/?semester_id=1');
  await page.locator('.bracket-match').first().waitFor();
  assert.equal(await page.locator('.bracket-match').count(), 4);
  assert.equal(await page.locator('.initial-slot').count(), 0);
  async function result(index, a, b) {
    const form = page.locator('.bracket-match').nth(index);
    await form.locator('[name=A]').fill(String(a)); await form.locator('[name=B]').fill(String(b)); await form.locator('button[type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('.tournament-operations').inert);
  }
  await result(0, 2, 0); await result(1, 2, 0);
  await result(2, 2, 0); await result(3, 2, 0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('test-db')).matches.length), 4);
  await result(0, 0, 3);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('test-db')).matches.length), 2);
  assert.equal(await page.locator('.bracket-match').nth(3).locator('[name=A]').inputValue(), '');
  assert.match(await page.locator('.bracket-match').nth(3).textContent(), /T1/);
  await page.locator('.edit-row[data-table=matches] select[name=team_a]').first().waitFor();
  assert.match(await page.locator('.edit-row[data-table=matches] select[name=team_a]').first().textContent(), /T1/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('test-db')).sport_results.length), 0);
  await page.screenshot({ path: path.join(artifacts, 'operations.png'), fullPage: true });
  await page.goto('http://localhost:4179/mypage/edit/documents/?semester_id=1');
  await page.locator('.document-sheet').first().waitFor();
  assert.equal(await page.locator('#create-timetable').isVisible(), true);
  assert.equal(await page.locator('#timetable-sports .matchMinutes').inputValue(), '15');
  await page.locator('.day-date').fill('2026-10-21');
  await page.locator('#generate-timetable-prompt').click();
  assert.ok((await page.locator('#timetable-prompt').inputValue()).length > 100);
  await page.locator('#register-new-system').click();
  await page.waitForFunction(() => document.querySelector('.save-status').textContent.includes('保存しました'));
  await page.reload(); await page.waitForFunction(() => document.querySelector('.day-date')?.value === '2026-10-21');
  await page.screenshot({ path: path.join(artifacts, 'documents.png'), fullPage: true });
  await page.evaluate(() => document.body.classList.add('print-documents')); await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.document-sheet').first().isVisible(), true);
  assert.equal(await page.locator('#create-timetable').isVisible(), false);
  const pdf = await page.pdf({ path: path.join(artifacts, 'sport-documents.pdf'), preferCSSPageSize: true, printBackground: true });
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length, 1);
  await page.evaluate(() => document.body.classList.add('print-documents'));
  await page.locator('.document-sheet').screenshot({ path: path.join(artifacts, 'document-print.png') });
  await page.emulateMedia({ media: 'screen' });
  await page.goto('http://localhost:4179/mypage/score-profile/');
  await page.locator('.edit-formula').click();
  const formula = page.locator('.formula-editor textarea'); await formula.fill('もし(順位 > 0, 勝利数 * 10, 0)');
  assert.match(await page.locator('.formula-editor output').textContent(), /10点/);
  await page.locator('.formula-editor [data-apply]').click();
  assert.match(await page.locator('[data-field=score-formula]').inputValue(), /もし/);
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('.edit-formula').click();
  await page.waitForFunction(() => document.querySelector('.formula-editor').getBoundingClientRect().right <= innerWidth + 1);
  await page.screenshot({ path: path.join(artifacts, 'formula-mobile.png') });
  assert.ok(await page.locator('.formula-editor').evaluate(el => el.getBoundingClientRect().width <= innerWidth));
  await page.goto('http://localhost:4179/mypage/create/');
  await page.evaluate(async profile => { const { applyProfile, restoreClasses } = await import('/src/js/school/mypage/create.js'); applyProfile(profile); restoreClasses([]); }, profile);
  await page.locator('.add-branch').fill('運営本部'); await page.locator('.add-branch-btn').click();
  assert.equal(await page.locator('.add-branch-btn').isDisabled(),true);
  await page.locator('.add-branch').fill(' 運営本部 ');
  assert.equal(await page.locator('.add-branch-btn').isDisabled(),true);
  assert.equal(await page.locator('#sport-branch span').filter({hasText:'運営本部'}).count(),1);
  await page.locator('#conduct-semester').fill('最低限の大会'); await page.locator('#register-new-system').click();
  await page.waitForURL('**/edit/basic/?semester_id=2');
  await page.waitForFunction(() => document.querySelector('.save-status').textContent.includes('読み込みました'));
  assert.equal(await page.locator('.team-wrap').count(), 4);
  await page.route('**/src/js/school/mypage/optional-timetable.js', route => route.fulfill({ status: 503, contentType: 'text/javascript', body: '' }));
  await page.goto('http://localhost:4179/mypage/create/');
  await page.waitForFunction(() => document.getElementById('timetable-status').textContent.includes('読み込めません'));
  await page.evaluate(async profile => { const { applyProfile, restoreClasses } = await import('/src/js/school/mypage/create.js'); applyProfile(profile); restoreClasses([]); }, profile);
  await page.locator('#conduct-semester').fill('タイムテーブル機能なし'); await page.locator('#register-new-system').click();
  await page.waitForURL('**/edit/basic/?semester_id=3');

  await page.evaluate(() => {
    const db=JSON.parse(localStorage.getItem('test-db'));
    const sem=db.semesters[0];sem.sports_config.sports[0].format='league_then_tournament';sem.sports_config.sports[0].rankingRule={league:['wins','goalDifference','manual']};
    sem.sports_config.setup.input.sports[0].format='league_then_tournament';
    sem.sports_config.setup.input.sports[0].tournamentSettings={enabled:true,source:'leagues',teamCount:4,thirdPlace:true};
    const league=sem.sports_config.setup.input.sports[0].leagues[0];league.advanceTeams=4;league.drawMode='round_robin';
    db.matches=[];for(let a=1;a<=4;a++)for(let b=a+1;b<=4;b++)db.matches.push({id:db.matches.length+1,semester_id:1,match_game:'サッカー',match_type:'予選',team_a:a,team_b:b,score_a:2,score_b:0,winner:a});
    delete sem.sports_config.bracketResults;delete sem.sports_config.bracketSlots;localStorage.setItem('test-db',JSON.stringify(db));
  });
  await page.goto('http://localhost:4179/mypage/edit/basic/?semester_id=1');
  await page.waitForFunction(()=>document.querySelector('.save-status')?.textContent.includes('読み込みました'));
  const slots=page.locator('.tournament-slot-select');assert.equal(await slots.count(),4);
  await page.waitForFunction(()=>document.querySelector('.tournament-slot-select')?.textContent.includes('T1'));
  const values=await slots.evaluateAll(nodes=>nodes.map(node=>node.value));await slots.first().selectOption(values[3]);
  await page.waitForFunction(value=>document.querySelector('.tournament-slot-select')?.value===value,values[3]);
  assert.equal(new Set(await slots.evaluateAll(nodes=>nodes.map(node=>node.value))).size,4);
  await page.locator('#register-new-system').click();await page.waitForFunction(()=>document.querySelector('.save-status').textContent.startsWith('保存しました'));
  await page.reload();await page.waitForFunction(value=>document.querySelector('.tournament-slot-select')?.value===value,values[3]);
  assert.equal(await page.locator('svg path[data-from="third-start-a"]').count(),1);
  await page.screenshot({path:path.join(artifacts,'qualifier-selects.png'),fullPage:true});
  await page.evaluate(() => {
    const db=JSON.parse(localStorage.getItem('test-db'));
    const league=db.semesters[0].sports_config.setup.input.sports[0].leagues[0];
    league.drawMode='visual'; league.matchesPerTeam=2;
    localStorage.setItem('test-db',JSON.stringify(db));
  });
  await page.goto('http://localhost:4179/mypage/edit/documents/?semester_id=1');
  await page.locator('.document-bracket svg').waitFor();
  assert.equal(await page.locator('.document-league svg line').count(),4);
  assert.equal(await page.locator('.document-bracket h3').textContent(),'決勝トーナメント');
  assert.ok(await page.locator('.document-bracket svg rect').count() >= 4);
  assert.ok(await page.locator('.document-diagram line, .document-diagram path').evaluateAll(nodes => nodes.every(node => node.getAttribute('stroke') === '#a32b2b')));
  await page.evaluate(() => document.body.classList.add('print-documents'));
  await page.emulateMedia({media:'print'});
  await page.screenshot({path:path.join(artifacts,'league-and-finals-print.png'),fullPage:true});
  const combinedPdf=await page.pdf({path:path.join(artifacts,'league-and-finals.pdf'),format:'A4',landscape:true,printBackground:true});
  assert.equal((combinedPdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1);
  await page.emulateMedia({media:'screen'});
  await page.goto('http://localhost:4179/system/core/?conduct=1');
  await page.locator('[data-core-view=scores]').click();
  await page.locator('.core-score-row').first().waitFor();
  assert.equal(await page.locator('.core-score-row').count(),4);
  await page.locator('#core-calculate-scores').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('test-db')).sport_results.length),0);
  assert.deepEqual(errors, []);
  await page.evaluate(() => localStorage.removeItem('classmatch-score-profile'));
  await page.goto('http://localhost:4179/mypage/score-profile/');
  assert.equal(await page.locator('[data-field="third-place"]').isChecked(),true);
  await page.goto('http://localhost:4179/mypage/create/');
  const earlyThird = await page.evaluate(async () => {
    const {applyProfile}=await import('/src/js/school/mypage/create.js');
    const {collectTournamentInput}=await import('/src/js/school/mypage/create-structure-data.js');
    applyProfile({profileName:'標準',sports:[{id:'s',name:'S',format:'tournament',tournament:{enabled:true}}]});
    return collectTournamentInput().sports[0].tournamentSettings.thirdPlace;
  });
  assert.equal(earlyThird,true);
  await page.waitForFunction(()=>document.querySelector('.tournament-third-place')?.checked);
  console.log('PASS: shared basic form, duration persistence, incomplete creation, semifinal/final/third progression and invalidation, document print, timetable save/restore, Japanese formula panel, mobile layout');
  console.log(`Screenshots: ${artifacts}`);
} finally { await browser.close(); }
