import { FORMULA_ALIASES, evaluateScoreFormula, parseScoreFormula } from '/src/js/classmatch/score-formula.js';

export function openFormulaEditor(target) {
  const dialog = document.createElement('dialog');
  dialog.className = 'formula-editor';
  dialog.setAttribute('aria-labelledby', 'formula-editor-title');
  dialog.innerHTML = `<header><h2 id="formula-editor-title">総合得点の計算式</h2><button type="button" data-close aria-label="閉じる">×</button></header>
    <label>計算式<textarea rows="5" spellcheck="false" aria-label="計算式を編集"></textarea></label>
    <p>項目を押すとカーソル位置に挿入します。日本語・英語のどちらも使えます。</p>
    <div class="formula-tokens"></div><details><summary>プレビュー用の値</summary><div class="formula-values"></div></details>
    <output role="status" aria-live="polite"></output><footer><button type="button" data-apply>計算式を反映</button></footer>`;
  const input = dialog.querySelector('textarea'); input.value = target.value;
  const values = {};
  for (const [name, key] of Object.entries(FORMULA_ALIASES)) {
    const label = document.createElement('label'); label.textContent = name;
    const number = document.createElement('input'); number.type = 'number'; number.value = key === 'teamCount' ? '8' : '1';
    values[key] = number; label.append(number); dialog.querySelector('.formula-values').append(label);
  }
  const preview = () => {
    try {
      const result = evaluateScoreFormula(input.value, Object.fromEntries(Object.entries(values).map(([key, node]) => [key, Number(node.value)])));
      dialog.querySelector('output').textContent = `プレビュー: ${result}点（上記のサンプル値で計算）`;
    } catch (error) { dialog.querySelector('output').textContent = error.message; }
  };
  for (const token of [...Object.keys(FORMULA_ALIASES), '+', '-', '*', '/', '>', '<', '>=', '<=', '==', '!=', 'かつ', 'または', '!', '(', ')', 'もし(, , )', '最大(, )', '最小(, )', '四捨五入()', '切り捨て()', '切り上げ()']) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = token;
    button.addEventListener('click', () => { input.setRangeText(` ${token} `, input.selectionStart, input.selectionEnd, 'end'); input.focus(); preview(); });
    dialog.querySelector('.formula-tokens').append(button);
  }
  dialog.addEventListener('input', preview);
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.querySelector('[data-apply]').onclick = () => {
    try { parseScoreFormula(input.value); target.value = input.value; target.dispatchEvent(new Event('input', { bubbles: true })); dialog.close(); }
    catch (error) { dialog.querySelector('output').textContent = error.message; }
  };
  dialog.addEventListener('close', () => { dialog.remove(); target.focus(); });
  document.body.append(dialog); dialog.showModal(); preview();
}
