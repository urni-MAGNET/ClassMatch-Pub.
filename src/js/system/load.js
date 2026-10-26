import { routeForBranch } from '/src/js/common.js';
import { popup } from "/src/js/popup.js";
import { supabase } from "/src/js/supabase.js";
import { version } from "/src/js/version.js";

const params = new URLSearchParams(window.location.search);
const semesterId = params.get("conduct");
const branchId = sessionStorage.getItem("login-branchId");


document.addEventListener("DOMContentLoaded", async () => {
  const { data, error } = await supabase
    .from("public_semesters_view")
    .select("*")
    .eq("semester_id", semesterId)
    .single();

  if (error) console.error(error);

  const { data: branches, error: branchesError } = await supabase
    .from("public_semesters_branch_view")
    .select("*")
    .eq("semester_id", semesterId);

  if (branchesError) {
    console.error(branchesError);
    popup("お知らせ", "支部を取得できませんでした。リンクを確認してください。", "error");
    return;
  }

  if (branchId) {
    const branch = branches?.find(b => String(b.id) === String(branchId));
    if (branch) {
      window.location.href = routeForBranch(branch.branch_name, semesterId);
      return;
    }
    sessionStorage.removeItem("sb-token");
    sessionStorage.removeItem("login-branchId");
    sessionStorage.removeItem("auth-mode");
  }

  const select = document.getElementById("game-branch");
  if (select) {
    select.innerHTML = "<option value='' disabled selected>支部を選択</option>" + (branches ?? []).map(b =>
      `<option value="${b.id}">${b.branch_name}</option>`
    ).join("");
  }

  const schoolName = data?.school_name ?? "";
  const semeName = data?.semester_name ?? "";
  sessionStorage.setItem("schoolName", schoolName);
  sessionStorage.setItem("semeName", semeName);

  document.querySelector(".header-title").innerHTML = `ClassMatch<small>${version}</small>`;
  document.getElementById("conduct-semester").textContent = semeName;
});
