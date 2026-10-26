import { escapeHtml } from '/src/js/common.js';
export function editForms(cachedData, teamNameById, tableLabels) {
 const leagueTeamEditableFields = ['leagues_id','class_id','entry_label','teams_name'];
 const formatValue=value=>value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
function leagueLabel(league) {
  if (!league) return "不明なリーグ";
  return `${league.sport ?? "競技未設定"} > ${league.league_name ?? "リーグ名未設定"}`;
}

function createField(labelText, name, options = {}) {
  const label = document.createElement("label");
  label.textContent = labelText;

  let control;
  if (options.choices) {
    control = document.createElement("select");
    control.innerHTML = [
      options.placeholder ? `<option value="">${escapeHtml(options.placeholder)}</option>` : "",
      ...options.choices.map(choice =>
        `<option value="${escapeHtml(choice.value)}">${escapeHtml(choice.label)}</option>`
      )
    ].join("");
  } else {
    control = document.createElement("input");
    control.type = options.type ?? "text";
    if (options.placeholder) control.placeholder = options.placeholder;
  }

  control.className = "filter";
  control.name = name;
  if (options.required) control.required = true;
  if (options.value !== undefined) control.value = options.value;
  label.appendChild(control);
  return label;
}

function addFormDefinition(tableName) {
  const leagues = cachedData.leagues ?? [];
  const teams = cachedData.leagues_teams ?? [];
  const classes = cachedData.tournament_classes ?? [];
  const teamChoices = teams.map(team => ({
    value: team.id,
    label: `${leagueLabel(leagues.find(league => String(league.id) === String(team.leagues_id)))} > ${team.teams_name}`
  }));

  const definitions = {
    tournament_classes: [
      ["学級コード", "class_code", { required: true, placeholder: "例: 1A" }],
      ["学級名", "class_name", { required: true, placeholder: "例: 1年A組" }],
      ["表示順", "sort_order", { type: "number", value: 0 }]
    ],
    semesters_branch: [
      ["支部名", "branch_name", { required: true, placeholder: "例: バスケットボール支部" }],
      ["パスコード", "passcode", { required: true, placeholder: "例: 1234" }]
    ],
    leagues: [
      ["競技名", "sport", { required: true, placeholder: "例: 男子バスケットボール" }],
      ["リーグ名", "league_name", { required: true, placeholder: "例: Aリーグ" }]
    ],
    leagues_teams: [
      ["所属リーグ", "leagues_id", {
        required: true,
        placeholder: "リーグを選択",
        choices: leagues.map(league => ({ value: league.id, label: leagueLabel(league) }))
      }],
      ["学級", "class_id", {
        placeholder: "学級を選択",
        choices: classes.map(item => ({ value: item.id, label: item.class_name }))
      }],
      ["区分", "entry_label", { placeholder: "例: A、B" }],
      ["チーム名", "teams_name", { required: true, placeholder: "例: 1年A組-A" }]
    ],
    matches: [
      ["競技名", "match_game", { required: true, placeholder: "例: 男子バスケットボール" }],
      ["種別", "match_type", { required: true, placeholder: "例: 予選" }],
      ["実施日時", "played_at", { type: "datetime-local" }],
      ["チームA", "team_a", { required: true, placeholder: "チームを選択", choices: teamChoices }],
      ["得点A", "score_a", { required: true, type: "number" }],
      ["チームB", "team_b", { required: true, placeholder: "チームを選択", choices: teamChoices }],
      ["得点B", "score_b", { required: true, type: "number" }]
    ],
    matches_report: [
      ["報告内容", "content", { required: true, placeholder: "誤りの内容" }]
    ],
    announcements: [
      ["送信元", "created_by", { required: true, placeholder: "例: システム管理支部" }],
      ["送信先", "created_to", { placeholder: "例: 全支部" }],
      ["種別", "created_of", { placeholder: "例: 業務連絡" }],
      ["本文", "body", { required: true, placeholder: "連絡内容" }]
    ]
  };
  return definitions[tableName] ?? [];
}

function createAddForm(tableName) {
  const form = document.createElement("form");
  form.className = "edit-add-form";
  form.dataset.table = tableName;
  form.hidden = true;

  addFormDefinition(tableName).forEach(([label, name, options]) => {
    form.appendChild(createField(label, name, options));
  });

  const submit = document.createElement("button");
  submit.className = "filter filterhover edit-add-submit";
  submit.type = "submit";
  submit.textContent = "追加する";
  form.appendChild(submit);
  return form;
}

function createEditRow(tableName, row) {
  const form = document.createElement("form");
  form.className = "edit-row";
  form.dataset.table = tableName;
  form.dataset.id = row.id;

  const hiddenTechnicalFields = tableName === "leagues_teams"
    ? new Set(Object.keys(row).filter(key => !["id", ...leagueTeamEditableFields].includes(key)))
    : new Set([
      "id", "semester_id", "school_id", "leagues_id",
      "created_at", "updated_at", "announced", "check", "checked", "bracket_key", "bracket_identity", "bracket_dependencies"
    ]);

  Object.entries(row).filter(([key]) => !hiddenTechnicalFields.has(key)).forEach(([key, value]) => {
    const label = document.createElement("label");
    label.textContent = key;

    let input;
    if (tableName === 'matches' && ['team_a','team_b','winner'].includes(key)) {
      input = document.createElement('select');
      input.add(new Option(key === 'winner' ? '同点・未定' : '選択してください', ''));
      const leagues = (cachedData.leagues ?? []).filter(league => league.sport === row.match_game).map(league => String(league.id));
      (cachedData.leagues_teams ?? []).filter(team => leagues.includes(String(team.leagues_id))).forEach(team => input.add(new Option(team.teams_name, String(team.id))));
      if (value != null && ![...input.options].some(option => option.value === String(value))) input.add(new Option(teamNameById.get(String(value)) ?? '削除済みチーム', String(value)));
      input.value = value ?? '';
      label.textContent = { team_a: 'チームA', team_b: 'チームB', winner: '同点時の勝者' }[key];
    } else if (tableName === "leagues_teams" && key === "class_id") {
      input = document.createElement("select");
      input.innerHTML = `<option value="">未紐付け</option>` + (cachedData.tournament_classes ?? []).map(item =>
        `<option value="${escapeHtml(item.id)}">${escapeHtml(item.class_name)}</option>`
      ).join("");
      input.value = value ?? "";
      label.textContent = "学級";
    } else if (tableName === "leagues_teams" && key === "leagues_id") {
      input = document.createElement("select");
      input.innerHTML = (cachedData.leagues ?? []).map(league =>
        `<option value="${escapeHtml(league.id)}">${escapeHtml(leagueLabel(league))}</option>`
      ).join("");
      input.value = value;
    } else if (tableName === "leagues_teams" && key === "id") {
      input = document.createElement("input");
      input.value = formatValue(value);
      input.readOnly = true;
    } else {
      input = document.createElement("input");
      input.value = formatValue(value);
    }

    input.className = "filter";
    input.name = key;
    label.appendChild(input);
    form.appendChild(label);
  });

  const actions = document.createElement("div");
  actions.className = "edit-row-actions";
  actions.innerHTML = tableName === "semesters"
    ? `<button class="filter filterhover edit-save" type="submit">保存</button>`
    : `
      <button class="filter filterhover edit-save" type="submit">保存</button>
      <button class="filter filterhover edit-delete" type="button">削除</button>
    `;
  form.appendChild(actions);
  return form;
}

function appendRows(section, tableName, rows) {
  if (tableName !== "leagues_teams") {
    if (!rows.length) {
      section.insertAdjacentHTML("beforeend", `<p class="edit-empty">データがありません。</p>`);
      return;
    }
    rows.forEach(row => section.appendChild(createEditRow(tableName, row)));
    return;
  }

  const leagues = cachedData.leagues ?? [];
  if (!leagues.length) {
    section.insertAdjacentHTML("beforeend", `<p class="edit-empty">先にリーグを追加してください。</p>`);
    return;
  }

  leagues.forEach(league => {
    const group = document.createElement("div");
    group.className = "league-team-group";
    group.innerHTML = `
      <h3>${escapeHtml(leagueLabel(league))}</h3>
      <p class="league-team-group-meta">league id: ${escapeHtml(league.id)}</p>
    `;
    const leagueTeams = rows.filter(team => String(team.leagues_id) === String(league.id));
    if (leagueTeams.length) {
      leagueTeams.forEach(team => group.appendChild(createEditRow(tableName, team)));
    } else {
      group.insertAdjacentHTML("beforeend", `<p class="edit-empty">所属チームがありません。</p>`);
    }
    section.appendChild(group);
  });
}

function createTableSection(tableName, rows) {
  const section = document.createElement("section");
  section.className = "edit-table-section filter";

  const heading = document.createElement("div");
  heading.className = "edit-table-heading";
  heading.innerHTML = `<h2>${escapeHtml(tableLabels[tableName] ?? tableName)}</h2>`;
  if (tableName !== "semesters") {
    const button = document.createElement("button");
    button.className = "filter filterhover edit-add-toggle";
    button.type = "button";
    button.textContent = "新規追加";
    heading.appendChild(button);
  }
  section.appendChild(heading);

  if (tableName !== "semesters") section.appendChild(createAddForm(tableName));
  appendRows(section, tableName, rows);
  return section;
}


 return { createTableSection };
}
