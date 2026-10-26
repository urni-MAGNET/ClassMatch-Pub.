import { tournamentRuntime } from '/src/js/classmatch/tournament-runtime.js';
import { leagueDiagram, bracketDiagram } from '/src/js/classmatch/document-diagrams.js';
import { node } from '/src/js/common.js';
const root=node('section');root.id='tournament-documents';
const controls=node('div',undefined,'no-print');controls.innerHTML='<h2>大会資料</h2><label>競技<select aria-label="資料種別"><option value="all">全競技（各競技1ページ）</option></select></label><button type="button">印刷・PDF保存</button>';
const sheets=node('div',undefined,'document-sheets');root.append(controls,sheets);document.getElementById('create-timetable').before(root);
const select=controls.querySelector('select');select.onchange=()=>{for(const page of sheets.children)page.hidden=select.value!=='all'&&page.dataset.sportId!==select.value;};
controls.querySelector('button').onclick=()=>{document.body.classList.add('print-documents');window.print();};
window.addEventListener('afterprint',()=>document.body.classList.remove('print-documents'));
document.getElementById('create-timetable-import').addEventListener('click',()=>document.body.classList.remove('print-documents'));
window.addEventListener('classmatch:setup-loaded',event=>{
 try{const data=event.detail,runtime=tournamentRuntime(data);sheets.replaceChildren();select.length=1;
 for(const sport of runtime.structure.sports){
  select.add(new Option(sport.sportName,sport.sportId));const page=node('article',undefined,'document-sheet');page.dataset.sportId=sport.sportId;page.append(node('h2',data.semester.name+' / '+sport.sportName));
  const diagrams=node('div',undefined,'document-sport-diagrams');
  if(sport.format!=='tournament')for(const league of sport.leagues){const group=node('section',undefined,'document-league');group.append(node('h3',league.leagueName),leagueDiagram(league,runtime.effectiveMatches.filter(row=>row.match_game===sport.sportName)));diagrams.append(group);}
  if(sport.tournament.enabled){const group=node('section',undefined,'document-bracket');group.append(node('h3',sport.format==='tournament'?'トーナメント':'決勝トーナメント'),bracketDiagram(sport));diagrams.append(group);}
  const footer=node('footer',undefined,'document-footer');footer.append(node('strong','MAGNET'));
  page.append(diagrams,footer);sheets.append(page);
 }
 if(!sheets.children.length)sheets.append(node('p','基本設定に大会データを登録してください。'));
 }catch(error){sheets.textContent=error.message;}
});
