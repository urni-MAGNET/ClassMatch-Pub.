// Small shared browser utilities; no application state or database access.
export function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
export function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
export const compactName = value => String(value ?? '').normalize('NFKC').replace(/\s/g,'').trim();
export const csvEscape = value => '"' + String(value ?? '').replaceAll('"','""') + '"';
export function downloadText(filename, content, type = 'text/csv;charset=utf-8') { const url = URL.createObjectURL(new Blob([content], { type })); const link = node('a'); link.href=url; link.download=filename; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }

export function normalizeTeamName(name) {
  return String(name ?? "")
    .replace(/[ 　]+/g, "")
    .replace(/[-ー－][A-Za-zＡ-Ｚａ-ｚ]$/i, "")
    .replace(/[（(][A-Za-zＡ-Ｚａ-ｚ][）)]$/i, "");
}

export function compareTuple(a, b) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

export function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

export function safeString(value, fallback = "") {
  return String(value ?? fallback).replace(/[<>]/g, "").trim();
}

export function safeNumber(value, fallback = 0, minimum = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, number) : fallback;
}

export function clearBranchSession() {
  sessionStorage.removeItem("login-branchId");
  sessionStorage.removeItem("sb-token");
  sessionStorage.removeItem("auth-mode");
}

export function safeText(value, max = 120) {
  return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
}

export function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
}

export function routeForBranch(branchName, semesterId) {
  if (branchName?.includes("アナウンス")) return `/system/announcements/?conduct=${encodeURIComponent(semesterId ?? "")}`;
  if (branchName?.includes("システム管理")) return `/system/core/?conduct=${encodeURIComponent(semesterId ?? "")}`;
  return `/system/manage/?conduct=${encodeURIComponent(semesterId ?? "")}`;
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
