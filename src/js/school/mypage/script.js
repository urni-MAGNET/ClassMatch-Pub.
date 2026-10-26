import { popup } from '/src/js/popup.js';
import { compactName } from '/src/js/common.js';
const sportBaseName = name => compactName(name).replace(/^(男子|女子|男|女)/, '').replace(/(男子|女子|男|女)$/, '');
const container = document.getElementById('sport-branch');
const duplicate = name => [...(container?.querySelectorAll('.register-branch span') ?? [])].some(item => compactName(item.textContent) === compactName(name));
const status = document.createElement('p'); status.setAttribute('role','status'); container?.after(status);
export function appendBranch(name, dbId = null) {
  if (!container || !compactName(name)) return false;
  if (duplicate(name)) { status.textContent = '同じ名前の支部は追加できません: ' + name; return false; }
  const row = document.createElement('p'); row.className = 'register-branch filter radius';
  row.innerHTML = '<span></span><button type="button" class="remove-branch" aria-label="削除">×</button>';
  row.querySelector('span').textContent=name.trim(); if(dbId)row.dataset.dbId=dbId; container.append(row); return true;
}
function namesFor(button) {
  const sports = window.classMatchImportedProfile?.sports ?? [];
  if(button.id==='register-sport-branch')return sports.map(sport=>sport.name+'支部');
  if(button.id==='register-gender-branch')return [...new Set(sports.map(sport=>sportBaseName(sport.name)+'支部'))];
  return [button.closest('.branch-manual-row')?.querySelector('.add-branch')?.value.trim()].filter(Boolean);
}
const buttons = () => [...document.querySelectorAll('#register-sport-branch,#register-gender-branch,.add-branch-btn')];
function update() { buttons().forEach(button=>{const names=namesFor(button);button.disabled=names.length>0 && names.every(duplicate);button.title=button.disabled?'同じ名前の支部が登録済みです。':'';}); }
document.addEventListener('click',event=>{
  const button=event.target.closest('#register-sport-branch,#register-gender-branch,.add-branch-btn');
  if(button){
    const names=namesFor(button);
    if(!names.length){status.textContent='大会テンプレートまたは支部名を入力してください。';return;}
    const duplicates=names.filter(duplicate);
    names.filter(name=>!duplicate(name)).forEach(name=>appendBranch(name));
    status.textContent=duplicates.length?'同じ名前の支部は追加できません: '+duplicates.join('、'):'支部を追加しました。同じ名前での追加はできません。';update();
  }
  if(event.target.closest('.remove-branch')){event.target.closest('.register-branch')?.remove();status.textContent='';update();}
});
document.addEventListener('input',event=>{if(event.target.matches('.add-branch')){status.textContent=duplicate(event.target.value)?'同じ名前の支部は追加できません。':'';update();}});
if(container)new MutationObserver(update).observe(container,{childList:true});
['アナウンス支部','システム管理者'].forEach(name=>appendBranch(name));
