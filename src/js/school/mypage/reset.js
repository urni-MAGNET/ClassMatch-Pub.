import { safeText, setBusy } from '/src/js/common.js';
import { supabase } from "/src/js/supabase.js";
import { popup } from "/src/js/popup.js";
import { validPassword, PASSWORD_MESSAGE } from '../../password-policy.js';


document.addEventListener('DOMContentLoaded', async () => {
        const { data: { session } } = await supabase.auth.getSession();


    document.getElementById("password-reset-submit-btn")?.addEventListener("click", async event => {
  const button = event.currentTarget;
  const password = String(document.getElementById("password-input").value ?? "");
  const passwordre = String(document.getElementById("password-input-re").value ?? "");
  if (!password || !passwordre) {
    popup('注意', "空欄があります。", "warning");
    return;
  }
  if (!validPassword(password)) {
    popup('注意', PASSWORD_MESSAGE, "warning");
    return;
  }
  if(password != passwordre) {
    popup('注意', "パスワードが一致しません。", "warning");
    return;
  }

  setBusy(button, true);
  try {

const { data, error } = await supabase.auth.updateUser({
  password
});

    if (error) throw error;
    document.getElementById("password-input").value = "";
    document.getElementById("password-input-re").value = "";
    popup('お知らせ', "パスワードを更新しました。", "success");
    window.location.href = location.origin + "/mypage/index.html"
  } catch (error) {
    console.error(error);
    popup(`パスワード更新に失敗しました。`, `${error.message ?? ""}`, "error");
  } finally {
    setBusy(button, false);
    
  }
});
})
