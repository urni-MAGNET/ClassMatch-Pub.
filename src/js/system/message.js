import { clearBranchSession, escapeHtml } from "/src/js/common.js";
import { playNotificationSound } from '../notification-sound.js';
import { isOwnAnnouncement, oldestAnnouncementsFirst } from '../notification-state.js';
import { popup } from "/src/js/popup.js";
import { supabase, branchesSB } from "/src/js/supabase.js";

const params = new URLSearchParams(window.location.search);
const semesterId = params.get("conduct");
const currentBranchId = sessionStorage.getItem("login-branchId");
let currentBranchName = sessionStorage.getItem('branch') ?? '';
const messages = new Map();
const newIds = new Set();


function renderAnnouncement(row, isNew = false) {
  const broadcast = row.broadcast === true || row.broadcast === 'true';
  const own = isOwnAnnouncement(row, currentBranchId, currentBranchName);
  const broadcastLabel = broadcast ? "生徒向けブロードキャスト" : (row.created_to ?? "");
  return `
    <div class="commulist filter radius ${broadcast ? "broadcast" : ""} ${own ? 'is-addressed-to-me' : ''} ${isNew ? "is-new" : ""}" data-id="${escapeHtml(row.id)}">
      <p class="commulist-from">${escapeHtml(row.created_by ?? "")}</p>
      <p class="commulist-to">${own ? '自分宛て：' : ''}${escapeHtml(broadcastLabel)}</p>
      <p class="commulist-type">${escapeHtml(row.created_of ?? "")}</p>
      <p class="commulist-content">${escapeHtml(row.body ?? "")}</p>
    </div>
  `;
}

function renderMessages() {
  const list = document.getElementById('commu-list');
  if (!list) return;
  list.innerHTML = messages.size ? oldestAnnouncementsFirst([...messages.values()]).map(row => renderAnnouncement(row, newIds.has(String(row.id)))).join('') : '業務連絡はまだありません。';
  list.scrollTo({ top: list.scrollHeight, behavior: 'auto' });
}

function scrollToLatestAnnouncement(list) {
  if (!list) return;
  requestAnimationFrame(() => list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }));
}

function renderBranchStatus(branches, onlineIds = new Set()) {
  const row = document.querySelector("#online-display tr");
  if (!row) return;

  row.innerHTML = branches.map(branch => `
    <td class="${onlineIds.has(String(branch.id)) ? "online" : ""}">${branch.branch_name}</td>
  `).join("");
}

function subscribePresence(branches) {
  const onlineIds = new Set();
  const channel = supabase.channel(`branch-presence-${semesterId}`, {
    config: { presence: { key: String(currentBranchId) } }
  });

  channel
    .on("presence", { event: "sync" }, () => {
      onlineIds.clear();
      const state = channel.presenceState();
      Object.keys(state).forEach(key => onlineIds.add(String(key)));
      renderBranchStatus(branches, onlineIds);
    })
    .subscribe(async status => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          branch_id: currentBranchId,
          online_at: new Date().toISOString()
        });
      }
    });

  return channel;
}

async function notice() {
  const { data: announcements, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("semester_id", semesterId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    popup("お知らせ", "業務連絡の取得に失敗しました。", "error");
    return;
  }

  (announcements ?? []).forEach(row => messages.set(String(row.id), row));
  renderMessages();
}

function subscribeMessages() {
  return supabase
    .channel(`messages-realtime-${semesterId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "announcements" },
      payload => {
        if (String(payload.new.semester_id) !== String(semesterId)) return;
        const row = payload.new, id = String(row.id);
        if (messages.has(id)) return;
        messages.set(id, row); newIds.add(id);
        const list = document.getElementById('commu-list');
        if (list) {
          if (!list.querySelector('.commulist')) list.replaceChildren();
          list.insertAdjacentHTML('beforeend', renderAnnouncement(row, true));
          scrollToLatestAnnouncement(list);
        }
        playNotificationSound(isOwnAnnouncement(row, currentBranchId, currentBranchName) ? 'mention' : 'message');
      }
    )
    .subscribe();
}

window.addEventListener("DOMContentLoaded", async () => {
  const token = sessionStorage.getItem("sb-token");
  if (!token || !currentBranchId) {
    clearBranchSession();
    popup("お知らせ", "ログイン情報がありません。もう一度ログインしてください。", "error");
    setTimeout(() => {
      window.location.href = `/system/index.html?conduct=${semesterId ?? ""}`;
    }, 1600);
    return;
  }

  const branches = await branchesSB(semesterId);
  const currentBranch = branches?.find(branch => String(branch.id) === String(currentBranchId));
  if (!currentBranch) {
    clearBranchSession();
    popup("お知らせ", "ログイン情報が一致しません。もう一度ログインしてください。", "error");
    setTimeout(() => {
      window.location.href = `/system/index.html?conduct=${semesterId ?? ""}`;
    }, 1600);
    return;
  }

  const selectEl = document.getElementById("commu-to");
  currentBranchName = currentBranch.branch_name;
  if (selectEl) {
    selectEl.innerHTML = "<option value='' disabled selected>連絡する相手</option>" + branches.map(branch =>
      `<option value="${branch.id}">${branch.branch_name}</option>`
    ).join("");
  }

  renderBranchStatus(branches, new Set([String(currentBranchId)]));
  subscribePresence(branches);
  subscribeMessages();
  await notice();
});

let sendbutton = false;
let broadcastMode = false;
document.getElementById("sendmessage")?.addEventListener("click", sendMessage);
function toggleBroadcastMode() {
  broadcastMode = !broadcastMode;
  const toggle = document.getElementById("broadcast-toggle");
  const toSelect = document.getElementById("commu-to");
  const typeSelect = document.getElementById("commu-type");
  const textarea = document.getElementById("commu-content");

  toggle?.setAttribute("aria-pressed", String(broadcastMode));
  document.querySelector(".communication-wrapper")?.classList.toggle("broadcast-mode", broadcastMode);
  if (toSelect) {
    toSelect.disabled = broadcastMode;
    if (broadcastMode) toSelect.value = "";
  }
  if (typeSelect && broadcastMode && !typeSelect.value) typeSelect.value = "業務連絡";
  if (textarea) textarea.placeholder = broadcastMode ? "生徒に向けて連絡" : "メッセージ";
}

document.addEventListener("click", event => {
  if (event.target.closest("#broadcast-toggle")) toggleBroadcastMode();
});

async function sendMessage() {
  if (sendbutton) return;
  sendbutton = true;

  const text = String(document.getElementById("commu-content")?.value ?? "").trim();
  const toId = document.getElementById("commu-to")?.value;
  const commuof = document.getElementById("commu-type")?.value || "業務連絡";
  const by = sessionStorage.getItem("branch");

  if (!text) {
    popup("お知らせ", "本文を入力してください。", "warning");
    sendbutton = false;
    return;
  }

  let toBranch = null;
  if (!broadcastMode && toId) {
    const { data, error: toError } = await supabase
      .from("semesters_branch")
      .select("id,branch_name")
      .eq("id", toId)
      .single();

    if (toError || !data) {
      console.error(toError);
      popup("お知らせ", "送信先の取得に失敗しました。", "error");
      sendbutton = false;
      return;
    }
    toBranch = data;
  }

  const { error } = await supabase.from("announcements").insert({
    body: text,
    created_by: by,
    created_to: broadcastMode ? "生徒" : (toBranch?.branch_name ?? ""),
    created_of: commuof,
    semester_id: semesterId,
    broadcast: broadcastMode
  });

  if (error) {
    console.error(error);
    popup("お知らせ", `送信中にエラーが発生しました。<br>${error.message}`, "error");
  } else {
    popup("お知らせ", `送信が完了しました。<br>相手: ${broadcastMode ? "生徒向けブロードキャスト" : (toBranch?.branch_name ?? "指定なし")}<br>種別: ${commuof}`, "success");
    document.getElementById("commu-content").value = "";
    document.getElementById("commu-to").value = "";
    document.getElementById("commu-type").value = "";
  }

  sendbutton = false;
}
