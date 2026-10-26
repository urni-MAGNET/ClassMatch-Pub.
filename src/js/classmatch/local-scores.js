import { tournamentRuntime } from './tournament-runtime.js';
import { buildSportResultsPayload } from './sport-results.js';
// Every invocation uses a freshly loaded semester snapshot. Old cached results never
// replace a failed network request. IndexedDB is optional (private mode/quota fallback).
export async function cacheScoreSnapshot(data) {
  if (typeof indexedDB === 'undefined') return;
  const owner = typeof sessionStorage === 'undefined' ? '' : [sessionStorage.getItem('auth-mode'),sessionStorage.getItem('schoolid')].join(':');
  await new Promise(resolve => {
    const request=indexedDB.open('magnet-score-cache',1); request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');
    request.onerror=()=>resolve();request.onblocked=()=>resolve();
    request.onsuccess=()=>{const db=request.result;try{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({ fetchedAt:Date.now(), data:structuredClone({ semester:data.semester,leagues:data.leagues,teams:data.teams,matches:data.matches,classes:data.classes,results:data.results }) },owner+':'+String(data.semester.id));tx.oncomplete=tx.onerror=tx.onabort=()=>{db.close();resolve();};}catch{db.close();resolve();}};
  });
}
export async function localScores(data) {
  await cacheScoreSnapshot(data).catch(() => {});
  const overrides=data.results??[];
  const rows=buildSportResultsPayload({semesterId:data.semester.id,sports:data.semester.sports_config?.sports??[],leagues:data.leagues,teams:data.teams,matches:tournamentRuntime({...data,branches:data.branches??[]}).effectiveMatches,overrides});
  return rows.map(row=>{const manual=overrides.find(item=>item.sport_id===row.sport_id&&String(item.team_id)===row.team_id);return {...row,manual_rank:manual?.manual_rank??null,manual_points:manual?.manual_points??null,notes:manual?.notes??''};});
}
