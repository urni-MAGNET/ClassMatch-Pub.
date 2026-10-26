import { routeForBranch } from '/src/js/common.js';
import { popup } from "/src/js/popup.js";
import { worker } from "/src/js/supabase.js";

const params = new URLSearchParams(window.location.search);
const semesterId = params.get("conduct");

function parseJwt(token) {
  const payload = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(payload));
}


async function readWorkerJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error(`WorkerからJSONを取得できませんでした。status: ${response.status}`);
  }
}

document.getElementById("send-login-btn")?.addEventListener("click", async () => {
  const branchId = document.getElementById("game-branch").value;
  const passcode = document.getElementById("passcode").value;
  const button = document.getElementById("send-login-btn");
  button.textContent = "送信中";

  if (!branchId || !passcode) {
    popup("お知らせ", "支部またはパスコードが入力されていません。", "warning");
    button.textContent = "次へ";
    return;
  }
  if (!semesterId) {
    popup("お知らせ", "URL が正しくありません。Mypage から正しい URL を開いてください。", "error");
    button.textContent = "次へ";
    return;
  }

  try {
    const res = await worker("branchlogin", { branchId, passcode, semesterId });
    const json = await readWorkerJson(res);

    if (!res.ok || !json || json.status === "error") {
      throw new Error(json?.message ?? "Workerでログイン処理に失敗しました。");
    }
    if (json.status === "no") {
      popup("お知らせ", "ログインできませんでした。支部またはパスコードが違います。", "error");
      button.textContent = "次へ";
      return;
    }

    const token = json.token;
    const branchName = json.name?.branch_name ?? json.name ?? "";
    sessionStorage.setItem("sb-token", token);
    sessionStorage.setItem("login-branchId", parseJwt(token).sub);
    sessionStorage.setItem("auth-mode", "branch");

    popup("お知らせ", `ログインが完了しました。<br>${branchName}`, "success");
    setTimeout(() => {
      window.location.href = routeForBranch(branchName, semesterId);
    }, 700);
  } catch (error) {
    console.error(error);
    popup("お知らせ", `ログインに失敗しました。<br>${error.message ?? ""}`, "error");
    button.textContent = "次へ";
  }
});
