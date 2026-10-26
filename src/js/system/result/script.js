import { escapeHtml } from "/src/js/common.js";
import QRCode from "https://esm.sh/qrcode@1.5.4";
import { broadcastAnnouncementsSB, publicSupabase, sortMatchesNewestFirst, sortNewestFirst, supabase } from "/src/js/supabase.js";
import { popup } from "/src/js/popup.js";
import { playNotificationSound } from '../../notification-sound.js';
import { completedResultIds, hasNewResults, newestCompletedResultAt, hasResultNewerThan } from '../../notification-state.js';

const params = new URLSearchParams(window.location.search);
const semesterId = params.get("conduct");
const mode = params.get("mode") ?? "auto";
const isAuto = mode === "auto";

let matchesCache = [];
const seenKey = `latest-match-result-at-${semesterId}`;
let latestResultAt = sessionStorage.getItem(seenKey);
let legacyResultIds = null;
let announcementsCache = [];
let teamNameById = new Map();
let currentIndex = Number(sessionStorage.getItem(`result-index-${semesterId}`) ?? 0);

function teamName(id) {
  return teamNameById.get(String(id)) ?? id ?? "";
}


function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

async function hydrateTeamNames(matches = []) {
  const ids = [...new Set(matches.flatMap(row => [row.team_a, row.team_b]).filter(Boolean).map(String))];
  if (!ids.length) return;

  const { data, error } = await supabase.from("leagues_teams").select("id,teams_name").in("id", ids);
  if (error) {
    console.error(error);
    return;
  }
  data?.forEach(team => teamNameById.set(String(team.id), team.teams_name));
}

async function loadMatches(markNewest = false) {
  let { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("semester_id", semesterId)
    .order("played_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    const fallback = await supabase.from("matches").select("*").eq("semester_id", semesterId);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    document.getElementById("leagues-container").innerHTML = `取得中にエラーが発生しました。<br>${error.message}`;
    return;
  }

  matchesCache = sortMatchesNewestFirst(data ?? []);
  const currentLatestResultAt = newestCompletedResultAt(matchesCache);
  const currentResultIds = completedResultIds(matchesCache);
  const receivedNew = currentLatestResultAt
    ? hasResultNewerThan(latestResultAt, currentLatestResultAt)
    : hasNewResults(legacyResultIds, currentResultIds);
  latestResultAt = currentLatestResultAt ?? latestResultAt;
  legacyResultIds = currentResultIds;
  try { if (latestResultAt) sessionStorage.setItem(seenKey, latestResultAt); } catch { /* memory still tracks this visit */ }
  await hydrateTeamNames(matchesCache);
  populateSports();
  render(markNewest || receivedNew);
  if (receivedNew) playNotificationSound('result');
}

function populateSports() {
  const select = document.getElementById("sport-select");
  const games = ["全体の試合結果", ...new Set(matchesCache.map(row => row.match_game).filter(Boolean))];
  select.innerHTML = games.map(game => `<option value="${escapeHtml(game)}">${escapeHtml(game)}</option>`).join("");
}

function rowsForGame(game) {
  return game === "全体の試合結果" ? matchesCache : matchesCache.filter(row => row.match_game === game);
}

function renderCard(row, showSport) {
  const winner = String(row.winner ?? "");
  return `
    <article class="result-row filter">
      <div class="result-game-cell ${showSport ? "" : "result-type-cell"}">
        ${showSport
          ? `<strong>${escapeHtml(row.match_game ?? "")}</strong><span>${escapeHtml(row.match_type ?? "")}</span>`
          : `<strong>${escapeHtml(row.match_type ?? "")}</strong>`}
      </div>
      <div class="result-team-cell ${winner === String(row.team_a) ? "winner" : ""}">${escapeHtml(teamName(row.team_a))}</div>
      <div class="result-score-cell">${escapeHtml(row.score_a ?? "")}</div>
      <div class="result-team-cell ${winner === String(row.team_b) ? "winner" : ""}">${escapeHtml(teamName(row.team_b))}</div>
      <div class="result-score-cell">${escapeHtml(row.score_b ?? "")}</div>
    </article>
  `;
}

function visibleRows(rows) {
  if (!isAuto) return rows;
  const availableHeight = Math.max(window.innerHeight - 126, 240);
  const estimatedRowHeight = 42;
  return rows.slice(0, Math.max(4, Math.floor(availableHeight / estimatedRowHeight) - 1));
}

function render(markNewest = false) {
  const select = document.getElementById("sport-select");
  const games = ["全体の試合結果", ...new Set(matchesCache.map(row => row.match_game).filter(Boolean))];
  let game;

  if (isAuto) {
    game = games[currentIndex % games.length] ?? "全体の試合結果";
    currentIndex = (currentIndex + 1) % Math.max(games.length, 1);
    sessionStorage.setItem(`result-index-${semesterId}`, String(currentIndex));
  } else {
    game = select.value || "全体の試合結果";
  }

  select.value = game;
  document.getElementById("result-title").textContent = game;
  const showSport = game === "全体の試合結果";
  const rows = visibleRows(rowsForGame(game));
  const board = document.getElementById("leagues-container");
  board.innerHTML = rows.length
    ? `
      <div class="result-grid-header">
        <span>${showSport ? "競技名" : "種別"}</span>
        <span>対戦チーム1</span>
        <span>点/セット数</span>
        <span>対戦チーム2</span>
        <span>点/セット数</span>
      </div>
      ${rows.map(row => renderCard(row, showSport)).join("")}
    `
    : "試合結果はまだありません。";
  if (markNewest) board.querySelector(".result-row")?.classList.add("is-new");
}

function renderAnnouncements() {
  const list = document.getElementById("result-announcements-list");
  if (!list) return;
  list.innerHTML = announcementsCache.length
    ? announcementsCache.map(row => `
      <article class="result-announcement">
        <time>${formatTime(row.created_at)}</time>
        <strong>${escapeHtml(row.created_of ?? "連絡")}</strong>
        <p>${escapeHtml(row.body)}</p>
      </article>
    `).join("")
    : "連絡はまだありません。";
}

async function loadBroadcastAnnouncements() {
  try {
    const rows = await broadcastAnnouncementsSB(semesterId);
    announcementsCache = [...(rows ?? [])]
      .filter(row => row.broadcast === true || row.broadcast === "true")
      .sort((a, b) => String(b.created_at ?? b.id).localeCompare(String(a.created_at ?? a.id)));
    renderAnnouncements();
  } catch (error) {
    console.error(error);
    const list = document.getElementById("result-announcements-list");
    if (list) list.textContent = "連絡の取得に失敗しました。";
  }
}

function setupMode() {
  document.body.classList.toggle("result-auto", isAuto);
  document.body.classList.toggle("result-manual", !isAuto);
  document.getElementById("sport-select").hidden = isAuto;
  document.getElementById("reporting").hidden = isAuto;
  document.querySelector(".reporting-wrap").hidden = isAuto;
  document.getElementById("manual-qr-wrap").hidden = !isAuto;

  if (isAuto) {
    const manualUrl = `${location.origin}/system/result/?conduct=${semesterId}&mode=manual`;
    QRCode.toCanvas(document.getElementById("manual-qr"), manualUrl, { width: 132, margin: 1 });
    setInterval(() => render(), 8000);
  }
}

window.addEventListener("resize", () => render());

document.getElementById("sport-select").addEventListener("change", () => render());
document.getElementById("reporting").addEventListener("click", () => {
  if (isAuto) return;
  document.querySelector(".reporting-wrap").classList.toggle("visible");
});
document.getElementById("repoting-button").addEventListener("click", async () => {
  if (isAuto) return;
  const content = document.getElementById("reporting-input").value.trim();
  if (!content) {
    popup("お知らせ", "内容を入力してください。", "warning");
    return;
  }
  const { error } = await publicSupabase.from("matches_report").insert({
    semester_id: semesterId,
    content,
    solved: false
  });
  if (error) {
    popup("お知らせ", `報告に失敗しました。<br>${error.message}`, "error");
    return;
  }
  document.getElementById("reporting-input").value = "";
  document.querySelector(".reporting-wrap").classList.remove("visible");
  popup("お知らせ", "報告しました。", "success");
});

setupMode();
await loadMatches();
await loadBroadcastAnnouncements();
setInterval(() => loadMatches(), 5 * 60 * 1000);
setInterval(() => loadBroadcastAnnouncements(), 60 * 1000);
