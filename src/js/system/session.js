import { clearBranchSession } from "/src/js/common.js";
import { popup } from "/src/js/popup.js";
import { branchesSB, semesterNameSB } from "/src/js/supabase.js";
import { version } from "/src/js/version.js";

const params = new URLSearchParams(window.location.search);
const semesterId = params.get("conduct");
const branchId = sessionStorage.getItem("login-branchId");


document.addEventListener("DOMContentLoaded", async () => {
  const branches = await branchesSB(semesterId);
  const semester = await semesterNameSB(semesterId);
  const branch = branches?.find(b => String(b.id) === String(branchId));

  if (!semesterId || !branch) {
    clearBranchSession();
    popup("お知らせ", "ログイン情報を確認できませんでした。もう一度ログインしてください。", "error");
    setTimeout(() => {
      window.location.href = `/system/index.html?conduct=${semesterId ?? ""}`;
    }, 1600);
    return;
  }

  sessionStorage.setItem("branch", branch.branch_name);
  sessionStorage.setItem("semester", semester?.name ?? "");

  const headerTitle = document.querySelector(".header-title");
  if (headerTitle) {
    headerTitle.innerHTML = `${branch.branch_name}<small>${version}</small>`;
  }
});

document.getElementById("logout")?.addEventListener("click", () => {
  clearBranchSession();
  location.href = `/system/index.html?conduct=${semesterId ?? ""}`;
});
