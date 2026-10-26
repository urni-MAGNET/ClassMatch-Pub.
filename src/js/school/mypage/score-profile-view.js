import { escapeHtml } from '/src/js/common.js';
import { RANKING_RULES,SPORT_FORMATS,FORMULA_VARIABLES } from '/src/js/classmatch/profile.js';
function options(list, selected) {
  return list.map(([value, label]) =>
    `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`
  ).join("");
}

function rankingChecks(sport) {
  return RANKING_RULES.map(([value, label]) => `
    <label class="inline-check">
      <input type="checkbox" data-field="rankingRule" value="${value}"
        ${sport.rankingRule.league.includes(value) ? "checked" : ""}
        ${value === "manual" ? "disabled" : ""}>
      ${label}
    </label>
  `).join("");
}

function pointRows(sport) {
  const entries = Object.entries(sport.scoreRule.points)
    .filter(([key]) => key !== "participation")
    .sort(([a], [b]) => Number(a) - Number(b));
  return entries.map(([rank, points]) => `
    <div class="compact-row point-row">
      <label>順位<input class="filter" type="number" min="1" data-field="point-rank" value="${rank}"></label>
      <label>点数<input class="filter" type="number" data-field="point-value" value="${points}"></label>
      <button class="filter filterhover remove-point" type="button">削除</button>
    </div>
  `).join("");
}

function bonusRows(sport) {
  return sport.scoreRule.bonus.map(item => `
    <div class="compact-row bonus-row">
      <label>加点元
        <select class="filter" data-field="bonus-field">
          <option value="wins" ${item.field === "wins" ? "selected" : ""}>勝利数</option>
          <option value="tournamentWins" ${item.field === "tournamentWins" ? "selected" : ""}>トーナメント勝利数</option>
          <option value="winsWithoutThirdPlace" ${item.field === "winsWithoutThirdPlace" ? "selected" : ""}>三位決定戦を除いた勝利数</option>
          <option value="tournamentWinsWithoutThirdPlace" ${item.field === "tournamentWinsWithoutThirdPlace" ? "selected" : ""}>三位決定戦を除いたトーナメント勝利数</option>
          <option value="thirdPlaceWins" ${item.field === "thirdPlaceWins" ? "selected" : ""}>三位決定戦の勝利数</option>
          <option value="goalsFor" ${item.field === "goalsFor" ? "selected" : ""}>総得点</option>
        </select>
      </label>
      <label>1回あたり<input class="filter" type="number" data-field="bonus-multiply" value="${item.multiply}"></label>
      <button class="filter filterhover remove-bonus" type="button">削除</button>
    </div>
  `).join("");
}

export function courtRow(location = {}) {
  return `<div class="compact-row court-row"><label>実施場所<input class="filter" data-field="venue" value="${escapeHtml(location.venue ?? "")}" placeholder="例: 第1体育館"></label><label>コート<input class="filter" data-field="court" value="${escapeHtml(location.court ?? "")}" placeholder="例: Aコート"></label><button class="filter filterhover remove-court" type="button" aria-label="コートを削除" title="コートを削除">×</button></div>`;
}

export function sportCard(sport, index) {
  const article = document.createElement("article");
  article.className = "profile-sport-card filter";
  article.dataset.index = index;
  article.innerHTML = `
    <div class="profile-sport-heading">
      <h2>${escapeHtml(sport.name || `競技 ${index + 1}`)}</h2>
      <button class="filter filterhover remove-profile-sport" type="button">競技を削除</button>
    </div>

    <div class="profile-grid three">
      <label>競技名<input class="filter" data-field="name" value="${escapeHtml(sport.name)}"></label>
      <label>競技ID<input class="filter" data-field="id" value="${escapeHtml(sport.id)}" pattern="[a-zA-Z0-9_-]+"></label>
      <label>競技形式
        <select class="filter" data-field="format">${options(SPORT_FORMATS, sport.format)}</select>
      </label>
    </div>

    <label>試合時間（分・未設定可）<input class="filter" type="number" min="1" step="1" data-field="match-minutes" value="${sport.timing.matchMinutes ?? ""}"></label>
    <fieldset><legend>実施場所・コート</legend><div class="court-rows">${sport.courts.map(courtRow).join("")}</div><button class="filter filterhover add-court" type="button">コートを追加</button></fieldset>
    <div class="profile-setting-grid">
      <fieldset>
        <legend>リーグ／グループ</legend>
        <label class="inline-check"><input type="checkbox" data-field="groups-enabled" ${sport.groups.enabled ? "checked" : ""}>グループを使う</label>
        <label>デフォルトのグループ数<input class="filter" type="number" min="1" data-field="groups-count" value="${sport.groups.defaultCount}"></label>
      </fieldset>

      <fieldset>
        <legend>決勝トーナメント</legend>
        <label class="inline-check"><input type="checkbox" data-field="tournament-enabled" ${sport.tournament.enabled ? "checked" : ""}>決勝トーナメントを使う</label>
        <label class="inline-check"><input type="checkbox" data-field="third-place" ${sport.tournament.thirdPlace !== false ? "checked" : ""}>3位決定戦を使う</label>
        <label>進出チーム数<input class="filter" type="number" min="0" data-field="advance-teams" value="${sport.tournament.advanceTeams}"></label>
        <label class="inline-check"><input type="checkbox" data-field="placement-auto" ${sport.tournament.placementAutoDetect ? "checked" : ""}>結果から1〜4位を自動判定する</label>
      </fieldset>
    </div>

    <fieldset>
      <legend>順位決定ルール（上から優先）</legend>
      <div class="ranking-checks">${rankingChecks(sport)}</div>
      <p class="field-help">手動は必ず最後の逃げ道として有効になります。</p>
    </fieldset>

    <fieldset>
      <legend>総合得点ルール</legend>
      <div class="profile-grid two">
        <label>計算方式
          <select class="filter" data-field="score-type">
            <option value="placement" ${sport.scoreRule.type === "placement" ? "selected" : ""}>順位点</option>
            <option value="metrics" ${sport.scoreRule.type === "metrics" ? "selected" : ""}>勝利数などの加点</option>
            <option value="hybrid" ${sport.scoreRule.type === "hybrid" ? "selected" : ""}>順位点＋加点</option>
            <option value="formula" ${sport.scoreRule.type === "formula" ? "selected" : ""}>計算式</option>
            <option value="manual" ${sport.scoreRule.type === "manual" ? "selected" : ""}>手動のみ</option>
          </select>
        </label>
        <label>参加点<input class="filter" type="number" data-field="participation" value="${sport.scoreRule.points.participation ?? 0}"></label>
      </div>
      <h3>順位ごとの点数</h3>
      <div class="point-rows">${pointRows(sport)}</div>
      <button class="filter filterhover add-point" type="button">順位点を追加</button>
      <h3>勝利数などに応じた加点</h3>
      <div class="bonus-rows">${bonusRows(sport)}</div>
      <button class="filter filterhover add-bonus" type="button">加点ルールを追加</button>
      <label>計算式
        <textarea class="filter" data-field="score-formula" rows="3" placeholder="if(winRank <= 8, wins * 10 + teamCount * 8 / winRank, 0)">${escapeHtml(sport.scoreRule.formula ?? "")}</textarea>
      </label>
      <button type="button" class="edit-formula filter filterhover">計算式を編集</button>
      <label>同じ学級から複数エントリーがある場合
        <select class="filter" data-field="class-aggregation">
          <option value="sum" ${sport.scoreRule.classAggregation === "sum" ? "selected" : ""}>すべて合計</option>
          <option value="best" ${sport.scoreRule.classAggregation === "best" ? "selected" : ""}>最高得点のみ</option>
          <option value="average" ${sport.scoreRule.classAggregation === "average" ? "selected" : ""}>平均</option>
        </select>
      </label>
      <p class="field-help">利用可能な変数: ${Object.entries(FORMULA_VARIABLES).map(([key, label]) => `${key}（${label}）`).join("、")}。関数: if, min, max, round, floor, ceil</p>
      <label class="inline-check"><input type="checkbox" data-field="manual-enabled" checked disabled>手動得点入力を許可する（常時有効）</label>
    </fieldset>
  `;
  return article;
}
