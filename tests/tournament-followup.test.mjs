import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSport, calculateOverallPoints } from '../src/js/classmatch/profile.js';
import { buildSportResultsPayload } from '../src/js/classmatch/sport-results.js';
import { localScores } from '../src/js/classmatch/local-scores.js';
import { plannedMatches } from '../src/js/classmatch/scheduled-matches.js';
import { buildTimetableAxisPages, sportTimeTicks, timetableSportSheets } from '../src/js/classmatch/timetable-table.js';
import { tournamentRuntime } from '../src/js/classmatch/tournament-runtime.js';
import { restoreSetup } from '../src/js/classmatch/tournament-setup.js';
const sport = normalizeSport({id:'s',name:'S',format:'manual',scoreRule:{type:'formula',formula:'決勝トーナメント進出チーム * 7',manualEnabled:true}});
const data = {semester:{id:1,name:'大会',sports_config:{sports:[sport]}},classes:[],branches:[],leagues:[{id:10,sport:'S',league_name:'A'}],teams:[1,2,3,4].map(id=>({id,leagues_id:10,teams_name:'T'+id})),matches:[{match_game:'S',match_type:'準々決勝',team_a:1,team_b:2,score_a:0,score_b:1,winner:2},{match_game:'S',match_type:'予選',team_a:3,team_b:4,score_a:2,score_b:0,winner:3}]};
test('final-tournament flag counts both entrants, including a first-match loser; fresh local scores override stale derived rows',async()=>{
 const rows=buildSportResultsPayload({semesterId:1,sports:[sport],leagues:data.leagues,teams:data.teams,matches:data.matches});
 assert.deepEqual(rows.map(row=>row.calculated_points),[7,7,0,0]);
 const snapshot={...structuredClone(data),results:[{sport_id:'s',team_id:1,calculated_points:999,manual_points:12,manual_rank:4,notes:'補正'}]};
 const scores=await localScores(snapshot);assert.equal(scores[0].calculated_points,7);assert.equal(scores[0].manual_points,12);assert.equal(scores[0].manual_rank,4);
 snapshot.matches=[];const refreshed=await localScores(snapshot);assert.equal(refreshed[0].calculated_points,0);assert.equal(refreshed[0].manual_points,12);
 assert.equal(calculateOverallPoints(sport,{finalTournamentParticipant:1}),7);
});
test('planned fixtures retain direct first-round IDs, leave future/final participants null and include third-place dependencies',()=>{
 const input={sports:[{sportId:'s',sportName:'S',format:'tournament',tournamentSettings:{teamCount:5},leagues:[{leagueId:'L',teams:[1,2,3,4,5].map(n=>({teamId:String(n),teamName:'T'+n}))}]}]};
 const rows=plannedMatches(input);assert.equal(rows.length,5);
 assert.ok(rows.filter(row=>row.round===1).every(row=>row.team_a&&row.team_b));
 assert.ok(rows.filter(row=>row.round>1).every(row=>row.team_a===null&&row.team_b===null));
 assert.equal(rows.find(row=>row.phase==='third_place').depends_on.length,2);
 input.sports[0].format='league_then_tournament';input.sports[0].tournamentSettings={enabled:true,source:'leagues'};input.sports[0].leagues[0].advanceTeams=4;
 assert.ok(plannedMatches(input).filter(row=>row.phase!=='league').every(row=>row.team_a===null&&row.team_b===null));
});
test('sport clocks use their own match boundaries and scoped lunch; sport printing preserves all matches',()=>{
 const sports=['a','b'].map(sportId=>({sportId,sportName:sportId,venue:sportId}));
 const settings={days:[{date:'2026-10-21',availableTimes:[{startTime:'09:00',endTime:'13:00'}],events:[{name:'昼休み',sportId:'a',startTime:'12:00',endTime:'12:30'}]}]};
 const rows=sports.map((sport,i)=>({...sport,matchId:sport.sportId,date:'2026-10-21',startTime:'09:00',endTime:i?'09:20':'09:15',occupiedStart:'09:00',occupiedEnd:i?'09:20':'09:15'}));
 const [page]=buildTimetableAxisPages(rows,settings,sports);
 assert.ok(sportTimeTicks(page,'a').some(t=>t.time==='09:15'));assert.ok(!sportTimeTicks(page,'b').some(t=>t.time==='09:15'));
 assert.ok(!sportTimeTicks(page,'b').some(t=>t.time==='12:00'));
 const sheets=timetableSportSheets([page]);assert.equal(sheets.length,2);assert.deepEqual(sheets.flatMap(p=>p.cards.map(c=>c.matchId)),['a','b']);
});
test('basic layout orders survive client-to-database ID remapping',()=>{
 const input=structuredClone(data);input.semester.sports_config.sports=[normalizeSport({id:'s',name:'S',format:'tournament',tournament:{advanceTeams:4}})];input.matches=[];
 input.semester.sports_config.setup=restoreSetup(input);
 const source=input.semester.sports_config.setup.input.sports[0];source.leagues[0].teams.forEach((team,i)=>team.teamId='local-'+(i+1));source.tournamentSettings={enabled:true,teamCount:4,source:'manual',slotOrder:['local-4','local-3','local-2','local-1']};
 assert.deepEqual(tournamentRuntime(input).structure.sports[0].tournament.teams.map(t=>t.teamId),['4','3','2','1']);
});

test('IndexedDB denial falls back to memory; manual-only entries remain in class totals',async()=>{
 const original=globalThis.indexedDB;
 globalThis.indexedDB={open(){throw new Error('Storage is blocked');}};
 try {
  const snapshot=structuredClone(data);snapshot.matches=[];
  snapshot.results=[{sport_id:'s',team_id:1,manual_points:15,manual_rank:2}];
  const scores=await localScores(snapshot);
  assert.equal(scores[0].manual_points,15);assert.equal(scores[0].participated,true);
 } finally { if(original===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=original; }
});
