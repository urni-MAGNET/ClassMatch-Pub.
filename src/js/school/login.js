import { supabase } from "/src/js/supabase.js";
import { popup } from "/src/js/popup.js";

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session && location.href === `${location.origin}/login/index.html`) {
    location.replace("/mypage/index.html");
  }
});

document.getElementById("password")?.addEventListener('keypress', async (el) => {
  if(el.key == "Enter") {
    await submit();
  }
})

document.getElementById("submit-btn")?.addEventListener("click", async () => {
  await submit();
});

async function submit() {
    const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  if (!email || !password) {
    popup("お知らせ", "正しく項目を入力してください。", "warning");
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.includes("Invalid login")) {
      popup("エラー", "メールアドレスまたはパスワードが違います。", "error");
    } else {
      popup("ログインエラー", error.message, "error");
    }
    return;
  }
  popup('ログインしました。', 'マイページへ遷移中です。', "success");
    setTimeout(() => {
      window.location.href = "/mypage/index.html";
  }, 1400);

}

document.getElementById('signinWithGoogle').addEventListener('click', async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: location.origin + '/login/account.html'
  }
});
})