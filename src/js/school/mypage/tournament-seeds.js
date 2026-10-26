import { node } from '/src/js/common.js';
export function renderSeedControls(container, card, teams, refresh) {
  container.replaceChildren();
  const order = JSON.parse(card.dataset.seedOrder || '[]');
  const controls = [];
  for (let index = 0; index < Math.min(4, teams.length); index++) {
    const label = node('label', `第${index + 1}シード `);
    const select = node('select'); select.className = 'league-select';
    select.add(new Option('指定なし', ''));
    teams.forEach(team => select.add(new Option(team.teamName, team.teamId)));
    select.value = order[index] ?? '';
    select.onchange = () => {
      if (select.value) controls.forEach(other => { if (other !== select && other.value === select.value) other.value = ''; });
      card.dataset.seedOrder = JSON.stringify(controls.map(control => control.value).filter(Boolean)); refresh();
    };
    controls.push(select); label.append(select); container.append(label);
  }
}
