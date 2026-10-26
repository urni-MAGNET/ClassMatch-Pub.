import { editForms } from './edit-forms.js';
import { escapeHtml, csvEscape, downloadText, normalizeTeamName } from "/src/js/common.js";
import { attachBracketReference } from "/src/js/classmatch/result-reference.js";
import { reconcileTournamentResults } from "./reconcile-results.js";
import QRCode from "https://esm.sh/qrcode@1.5.4";
import { sortMatchesNewestFirst, sortNewestFirst, supabase } from "/src/js/supabase.js";
import { popup } from "/src/js/popup.js";

const params = new URLSearchParams(location.search);
const semesterId = params.get("semester_id");
const editRoot = document.getElementById("edit-root");
const statusEl = document.getElementById("edit-status");

const editableTables = ["semesters_branch", "matches", "matches_report", "announcements"];
const tableLabels = {
  semesters: "実施年度・学期",
  tournament_classes: "学級マスター",
  semesters_branch: "支部",
  leagues: "競技・リーグ",
  leagues_teams: "チーム",
  matches: "試合結果",
  matches_report: "試合結果の誤り報告",
  announcements: "業務連絡"
};

let teamNameById = new Map();
let cachedData = {};

const leagueTeamEditableFields = ["leagues_id", "class_id", "entry_label", "teams_name"];

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}




function parseValue(value) {
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (!Number.isNaN(Number(trimmed)) && /^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

async function fetchAllData() {
  if (!semesterId) {
    setStatus("semester_id が指定されていません。");
    return null;
  }

  const result = {};
  const semesterRes = await supabase.from("semesters").select("*").eq("id", semesterId);
  result.semesters = semesterRes.data ?? [];

  const branchesRes = await supabase.from("semesters_branch").select("*").eq("semester_id", semesterId);
  result.semesters_branch = branchesRes.data ?? [];

  const classesRes = await supabase.from("tournament_classes").select("*").eq("semester_id", String(semesterId));
  result.tournament_classes = classesRes.data ?? [];

  const matchesRes = await supabase.from("matches").select("*").eq("semester_id", semesterId);
  result.matches = sortMatchesNewestFirst(matchesRes.data ?? []);

  const leaguesRes = await supabase.from("leagues").select("*").eq("semester_id", semesterId);
  result.leagues = leaguesRes.data ?? [];

  const announcementsRes = await supabase.from("announcements").select("*").eq("semester_id", semesterId);
  result.announcements = announcementsRes.data ?? [];

  const reportsRes = await supabase.from("matches_report").select("*").eq("semester_id", semesterId);
  result.matches_report = sortNewestFirst(reportsRes.data ?? []);

  const leagueIds = result.leagues.map(row => row.id).filter(Boolean);
  if (leagueIds.length) {
    const teamsRes = await supabase.from("leagues_teams").select("*").in("leagues_id", leagueIds);
    result.leagues_teams = teamsRes.data ?? [];
  } else {
    result.leagues_teams = [];
  }

  teamNameById = new Map(result.leagues_teams.map(team => [String(team.id), team.teams_name]));
  const errors = [
    semesterRes.error,
    classesRes.error,
    branchesRes.error,
    matchesRes.error,
    leaguesRes.error,
    announcementsRes.error,
    reportsRes.error
  ].filter(Boolean);
  setStatus(errors.length ? "一部データの取得に失敗しました。" : `semester_id: ${semesterId}`);
  cachedData = result;
  return result;
}

function renderPasswords(branches) {
  const target = document.getElementById("password-list");
  if (!target) return;
  target.innerHTML = branches.length
    ? branches.map(branch => `<p class="password-row"><span>${escapeHtml(branch.branch_name)}</span><strong>${escapeHtml(branch.passcode ?? "")}</strong></p>`).join("")
    : "支部がありません。";
}

async function renderQr() {
  const canvas = document.getElementById("result-qr");
  if (!canvas) return;
  const url = `${location.origin}/system/result/?conduct=${semesterId}&mode=manual`;
  await QRCode.toCanvas(canvas, url, { width: 180, margin: 1 });
}

async function render() {
  const data = await fetchAllData();
  if (!data || !editRoot) return;

  renderPasswords(data.semesters_branch);
  await renderQr();
  editRoot.innerHTML = "";
  const { createTableSection } = editForms(cachedData, teamNameById, tableLabels);
  editableTables.forEach(tableName => editRoot.appendChild(createTableSection(tableName, data[tableName] ?? [])));
}

function buildInsertPayload(tableName, form) {
  const payload = {};
  new FormData(form).forEach((value, key) => {
    payload[key] = parseValue(value);
  });

  if (tableName !== "leagues_teams") payload.semester_id = semesterId;
  if (tableName === "matches_report") payload.solved = false;
  if (tableName === "matches") {
    setMatchWinner(payload);
    payload.announced = false;
    payload.played_at = payload.played_at ? new Date(payload.played_at).toISOString() : new Date().toISOString();
  }
  return payload;
}

function setMatchWinner(payload) {
  const scoreA = Number(payload.score_a);
  const scoreB = Number(payload.score_b);
  if (String(payload.team_a) === String(payload.team_b)) throw new Error('同じチーム同士の試合は保存できません。');
  payload.winner = scoreA > scoreB ? payload.team_a : scoreA < scoreB ? payload.team_b : [String(payload.team_a), String(payload.team_b)].includes(String(payload.winner)) ? payload.winner : null;
}



function exportMatchesCsv() {
  const rows = cachedData.matches ?? [];
  const header = ["id", "競技", "種別", "チームA", "チームA集計キー", "点A", "チームB", "チームB集計キー", "点B", "勝者", "勝者集計キー"];
  const body = rows.map(row => {
    const teamA = teamNameById.get(String(row.team_a)) ?? row.team_a;
    const teamB = teamNameById.get(String(row.team_b)) ?? row.team_b;
    const winner = teamNameById.get(String(row.winner)) ?? row.winner ?? "";
    return [row.id, row.match_game, row.match_type, teamA, normalizeTeamName(teamA), row.score_a, teamB, normalizeTeamName(teamB), row.score_b, winner, normalizeTeamName(winner)]
      .map(csvEscape)
      .join(",");
  });
  downloadText(`classmatch-results-${semesterId}.csv`, "\uFEFF" + [header.map(csvEscape).join(","), ...body].join("\n"));
}

async function syncSportResultsFromMatches() { await reconcileTournamentResults(semesterId); }

async function syncSportResultsIfNeeded(tableName) {
  if (tableName !== "matches") return;
  try {
    await syncSportResultsFromMatches();
  } catch (error) {
    console.error(error);
    popup("競技別得点の自動更新に失敗しました。", error.message, "error");
  }
}

document.addEventListener("submit", async event => {
  const form = event.target;

  if (form.classList.contains("edit-add-form")) {
    event.preventDefault();
    const tableName = form.dataset.table;
    let payload;
    try { payload = buildInsertPayload(tableName, form); } catch(error) { popup("入力エラー", error.message, "error"); return; }
    try { if (tableName === "matches") payload = await attachBracketReference(supabase, payload); } catch (error) { popup("お知らせ", error.message, "error"); return; }
    const { error } = await supabase.from(tableName).insert(payload);
    if (error) {
      console.error(error);
      popup(`${tableLabels[tableName]}の追加に失敗しました。`, error.message, "error");
      return;
    }
    popup("編集", `${tableLabels[tableName]}を追加しました。`, "success");
    await syncSportResultsIfNeeded(tableName);
    await render();
    return;
  }

  if (!form.classList.contains("edit-row")) return;
  event.preventDefault();

  const payload = {};
  const excludedUpdateFields = form.dataset.table === "leagues_teams"
    ? ["id", ...Object.keys(cachedData.leagues_teams?.find(row => String(row.id) === String(form.dataset.id)) ?? {})
        .filter(key => !leagueTeamEditableFields.includes(key))]
    : ["id", "semester_id", "school_id", "leagues_id", "created_at", "updated_at", "announced", "check", "checked", "bracket_key", "bracket_identity", "bracket_dependencies"];
  new FormData(form).forEach((value, key) => {
    if (!excludedUpdateFields.includes(key)) {
      payload[key] = parseValue(value);
    }
  });
  if (form.dataset.table === "matches") {
    try { setMatchWinner(payload); } catch(error) { popup("入力エラー", error.message, "error"); return; }
    payload.played_at = payload.played_at ? new Date(payload.played_at).toISOString() : null;
  }

  let query = supabase.from(form.dataset.table).update(payload).eq("id", form.dataset.id);
  const { error } = await query;
  if (error) {
    console.error(error);
    popup(`${tableLabels[form.dataset.table]}の保存に失敗しました。`, `${error.message}`, "error");
    return;
  }
  popup("お知らせ", "保存しました。", "success");
  if (form.dataset.table === "semesters" && "sports_config" in payload) {
    window.dispatchEvent(new CustomEvent("classmatch:sports-config-updated"));
  }
  if (false) {
    popup("お知らせ", "チームを更新できませんでした。権限または対象データを確認してください。", "error");
    return;
  }
  await syncSportResultsIfNeeded(form.dataset.table);
  await render();
});

document.addEventListener("click", async event => {
  const target = event.target;

  if (target.classList.contains("edit-add-toggle")) {
    const form = target.closest(".edit-table-section")?.querySelector(".edit-add-form");
    if (!form) return;
    form.hidden = !form.hidden;
    target.textContent = form.hidden ? "新規追加" : "閉じる";
    return;
  }

  if (target.classList.contains("edit-delete")) {
    const form = target.closest(".edit-row");
    if (!confirm(`${tableLabels[form.dataset.table]}の id=${form.dataset.id} を削除しますか？`)) return;
    const { error } = await supabase.from(form.dataset.table).delete().eq("id", form.dataset.id);
    if (error) {
      console.error(error);
      popup("お知らせ", `${tableLabels[form.dataset.table]}の削除に失敗しました。<br>${error.message}`, "error");
      return;
    }
    popup("お知らせ", "削除しました。", "success");
    await syncSportResultsIfNeeded(form.dataset.table);
    await render();
    return;
  }

  const resultBase = `${location.origin}/system/result/?conduct=${semesterId}`;
  if (target.id === "share-system-link") {
    await navigator.clipboard.writeText(`${location.origin}/system/?conduct=${semesterId}`);
    popup("お知らせ", "ログインリンクをコピーしました。", "success");
  }
  if (target.id === "share-result-auto-link") {
    await navigator.clipboard.writeText(`${resultBase}&mode=auto`);
    popup("お知らせ", "試合結果（自動版）のリンクをコピーしました。", "success");
  }
  if (target.id === "share-result-manual-link") {
    await navigator.clipboard.writeText(`${resultBase}&mode=manual`);
    popup("お知らせ", "試合結果（手動版）のリンクをコピーしました。", "success");
  }
  if (target.id === "download-result-qr") {
    const canvas = document.getElementById("result-qr");
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `classmatch-result-qr-${semesterId}.png`;
    link.click();
  }
  if (target.id === "export-matches-csv") exportMatchesCsv();
  if (target.id === "delete-semester") {
    const name = cachedData.semesters?.[0]?.name ?? "";
    if (!confirm(`システム「${name}」を削除しますか？`)) return;
    const { error } = await supabase.from("semesters").delete().eq("id", semesterId);
    if (error) {
      popup("お知らせ", `削除に失敗しました。${error.message}`, "error");
      return;
    }
    location.href = "/mypage/";
  }
});

window.addEventListener('classmatch:matches-updated', () => render().catch(error => setStatus(error.message)));
render().catch(error => setStatus(error.message));
