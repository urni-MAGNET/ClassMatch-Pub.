import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.CLASSMATCH_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless:true, executablePath:process.env.CLASSMATCH_BROWSER_EXECUTABLE });
const mock = `
const user={id:'school',email:'test@example.com',identities:[]};
export const worker=async()=>({ok:true,json:async()=>({status:'ok'})});
export const branchesSB=async()=>[{id:1,branch_name:'支部A'}];
export const broadcastAnnouncementsSB=async()=>[];
export const sortNewestFirst=rows=>rows; export const sortMatchesNewestFirst=rows=>rows;
export const supabase={
 auth:{getSession:async()=>({data:{session:{user}}}),getUser:async()=>({data:{user}}),
 signOut:async()=>{sessionStorage.setItem('signouts',String(Number(sessionStorage.getItem('signouts')||0)+1));return {error:{message:'test failure'}};},
 signUp:async()=>{window.signups=(window.signups||0)+1;return {error:{message:'test'}};},
 signInWithPassword:async()=>({error:null}),
 updateUser:async()=>{window.updates=(window.updates||0)+1;return {error:window.failUpdate?{message:'更新失敗'}:null};}},
 from(table){let single=false;const q={select(){return q},eq(){return q},in(){return q},order(){return q},single(){single=true;return q},maybeSingle(){single=true;return q},
 then(resolve){const rows=table==='schools'?[{id:'school',name:'テスト学校'}]:table==='announcements'?window.announcements:table==='matches'?window.matches:[];resolve({data:single?rows[0]:rows,error:null});}};return q;},
 channel(name){const q={on(type,filter,fn){if(type==='postgres_changes')window.receive=fn;return q},subscribe(){return q},presenceState(){return {}},track:async()=>{}};return q;}
}; export const publicSupabase=supabase;`;
try {
 const page=await browser.newPage({viewport:{width:1400,height:1000}}), errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
   sessionStorage.setItem('sb-token','test'); sessionStorage.setItem('login-branchId','1');sessionStorage.setItem('branch','支部A');
   window.sounds=[];window.Audio=class {constructor(url){this.url=url} pause(){} play(){window.sounds.push(this.url);return window.denyAudio?Promise.reject(new Error('denied')):Promise.resolve()}};
   window.announcements=[{id:2,created_at:'2026-10-14T10:00:00',created_to:'支部B',body:'後の連絡'}, {id:1,created_at:'2026-10-14T09:00:00',created_to:'支部A',body:'最初の連絡'}];
   window.matches=[{id:1,match_game:'S',match_type:'予選',team_a:1,team_b:2,score_a:1,score_b:0}];
   window.intervals=[];window.setInterval=(fn,ms)=>{window.intervals.push({fn,ms});return window.intervals.length};
 });
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='esm.sh'&&url.pathname.startsWith('/qrcode'))return route.fulfill({contentType:'text/javascript',body:'export default {toCanvas:async()=>{}};'});
  if(url.hostname!=='localhost')return route.abort();
  if(url.pathname==='/src/js/supabase.js')return route.fulfill({contentType:'text/javascript',body:mock});
  if(['/src/js/load.js','/src/js/animation.js','/src/js/system/session.js','/src/js/system/core/result.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
  try { const file=path.resolve('.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};return route.fulfill({body:await fs.readFile(file),contentType:types[path.extname(file)]||'application/octet-stream'}); }
  catch { return route.fulfill({status:404,body:''}); }
 });
 async function open(url){await page.goto('http://localhost:4179'+url);await page.addStyleTag({content:'.classmatch-loading{display:none!important}'});}
 await open('/system/core/?conduct=1');
 await page.locator('.commulist').first().waitFor();
 assert.deepEqual(await page.locator('.commulist').evaluateAll(nodes=>nodes.map(n=>n.dataset.id)),['1','2']);
 assert.equal(await page.locator('.is-addressed-to-me').count(),1);
 assert.deepEqual(await page.evaluate(()=>window.sounds),[]);
 await page.evaluate(()=>window.receive({new:{id:3,semester_id:1,created_to:'支部B',body:'新着'}}));
 assert.ok((await page.evaluate(()=>window.sounds.at(-1))).endsWith('/announcement.mp3'));
 await page.evaluate(()=>window.receive({new:{id:4,semester_id:1,created_to:'支部A',body:'自分宛て'}}));
 assert.ok((await page.evaluate(()=>window.sounds.at(-1))).endsWith('/mention.mp3'));
 assert.deepEqual(await page.locator('.commulist').evaluateAll(nodes=>nodes.map(n=>n.dataset.id)),['1','2','3','4']);
 assert.equal(await page.locator('.is-addressed-to-me').count(),2);
 await page.evaluate(()=>window.receive({new:{id:4,semester_id:1,created_to:'支部A',body:'重複'}}));
 assert.equal(await page.evaluate(()=>window.sounds.length),2);
 await page.evaluate(async()=>{const {popup}=await import('/src/js/popup.js');popup('タイトル','本文','warning');});
 assert.equal(await page.locator('.popup-title').textContent(),'タイトル');
 assert.equal(await page.locator('.popup-content').textContent(),'本文');
 assert.ok((await page.evaluate(()=>window.sounds.at(-1))).endsWith('/notification-warning.mp3'));
 await page.evaluate(async()=>{window.denyAudio=true;const {popup}=await import('/src/js/popup.js');popup('拒否時も表示','本文','success');});
 assert.equal(await page.locator('.popup-title').textContent(),'拒否時も表示');
 await open('/system/result/?conduct=1&mode=manual');
 await page.locator('.result-row').first().waitFor();
 assert.equal(await page.evaluate(()=>window.sounds.length),0);
 await page.evaluate(async()=>{window.matches.push({id:2,match_game:'S',match_type:'予選',team_a:1,team_b:2,score_a:0,score_b:2});await window.intervals.find(x=>x.ms===300000).fn();});
 assert.equal(await page.locator('.result-row').count(),2);
 assert.ok((await page.evaluate(()=>window.sounds.at(-1))).endsWith('/match-result.mp3'));
 await page.evaluate(async()=>{await window.intervals.find(x=>x.ms===300000).fn();});
 assert.equal(await page.evaluate(()=>window.sounds.length),1);
 await open('/mypage/account/');
 await page.locator('#account-name-input').waitFor();
 await page.locator('#logout').click();assert.equal(await page.locator('.logout-checking').isVisible(),true);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('signouts')),null);
 await page.locator('#logout-cancel-btn').click();assert.equal(await page.locator('.logout-checking').isVisible(),false);
 await page.locator('#logout').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.logout-checking').isVisible(),false);
 await page.locator('#logout').click();await page.locator('#logout-submit-btn').click();
 await page.waitForFunction(()=>sessionStorage.getItem('signouts')==='1');
 assert.equal(await page.locator('#logout-submit-btn').isDisabled(),false);
 await page.locator('#logout-cancel-btn').click();
 await page.locator('#current-password-input').fill('oldpass1');await page.locator('#new-password-input').fill('abcdefgh');await page.locator('#password-edit').click();
 assert.equal(await page.evaluate(()=>window.updates||0),0);
 await page.locator('#new-password-input').fill('newpass1');await page.locator('#password-edit').click();
 await page.waitForFunction(()=>window.updates===1);
 await open('/mypage/account/passwordreset.html');
 await page.locator('#password-input').fill('abcdefgh');await page.locator('#password-input-re').fill('abcdefgh');await page.locator('#password-reset-submit-btn').click();
 assert.equal(await page.evaluate(()=>window.updates||0),0);
 await page.evaluate(()=>window.failUpdate=true);
 await page.locator('#password-input').fill('newpass1');await page.locator('#password-input-re').fill('newpass1');await page.locator('#password-reset-submit-btn').click();
 await page.waitForFunction(()=>window.updates===1);
 assert.equal(await page.locator('.popup-title').textContent(),'パスワード更新に失敗しました。');
 await open('/');await page.evaluate(()=>document.querySelector('.signup-popup').classList.add('active'));
 await page.locator('#school-name').fill('学校');await page.locator('#school-email').fill('test@example.com');
 await page.locator('#login-password').fill('12345678');await page.locator('#login-password-re').fill('12345678');await page.locator('#submit-account-btn').click();
 assert.equal(await page.evaluate(()=>window.signups||0),0);
 await page.locator('#login-password').fill('newpass1');await page.locator('#login-password-re').fill('newpass1');await page.locator('#submit-account-btn').click();
 await page.waitForFunction(()=>window.signups===1);
 assert.deepEqual(errors,[]);
 console.log('PASS: chronological realtime messages, mention styling/sound, popup arguments/audio denial, new-result sound, logout dialog, signup/change/reset password validation');
} finally {await browser.close();}
