import { safeText, setBusy } from '/src/js/common.js';
import { supabase, worker } from "/src/js/supabase.js";
import { popup } from "/src/js/popup.js";
import { validPassword, PASSWORD_MESSAGE } from '../../password-policy.js';



async function getSessionAndSchool() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw sessionError ?? new Error("ログイン情報を取得できませんでした。");
  }

  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .select("id,name")
    .eq("id", session.user.id)
    .single();
  if (schoolError) throw schoolError;

  return { session, school };
}

function updateSchoolName(name) {
  document.querySelectorAll(".schoolname").forEach(el => {
    el.textContent = name;
  });

  const headerTitle = document.querySelector(".header-title");
  if (headerTitle) {
    const small = headerTitle.querySelector("small")?.outerHTML ?? "";
    headerTitle.innerHTML = `${name} / <a href="/mypage/">Mypage</a> / アカウント管理 ${small}`;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const nameInput = document.getElementById("account-name-input");
  if (!nameInput) return;

  try {
    const { school } = await getSessionAndSchool();
    nameInput.value = school.name ?? "";
    updateSchoolName(school.name ?? "");
  } catch (error) {
    console.error(error);
    popup(`アカウント情報の取得に失敗しました。`, `${error.message ?? ""}`, "error");
  }
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.error(error);
    return;
  }

console.log(user.identities);
  const google = document.getElementById('google-account-link');
  const hasGoogle = user.identities?.some(
  identity => identity.provider === "google"
);

if (hasGoogle) {
  google.innerHTML = "連携済み"
} else {
  google.innerHTML = `
                  <button class="gsi-material-button" id="linkWithGoogle">
                    <div class="gsi-material-button-state"></div>
                    <div class="gsi-material-button-content-wrapper">
                    <div class="gsi-material-button-icon">
                        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" xmlns:xlink="http://www.w3.org/1999/xlink" style="display: block;">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                            <path fill="none" d="M0 0h48v48H0z"></path>
                        </svg>
                    </div>
                    <span class="gsi-material-button-contents">Googleでサインイン</span>
                    <span style="display: none;">Googleでサインイン/span>
                    </div>
                </button>
  `
}

document.getElementById("linkWithGoogle")?.addEventListener('click', async event => {
  const button = event.currentTarget;
  setBusy(button, true);
  console.log('check')
  const { data, error } = await supabase.auth.linkIdentity({
  provider: "google",
  options: {
    redirectTo: `${location.origin}/mypage/index.html`
  }
});

if (error) {
  console.error(error);
  popup("連携に失敗しました", error.message, "error");
  setBusy(button, false);
}
})
});

document.getElementById("school-dataedit")?.addEventListener("click", async event => {
  const button = event.currentTarget;
  const name = safeText(document.getElementById("account-name-input")?.value, 80);
  if (!name) {
    popup("注意！", "アカウント名を入力してください。", "warning");
    return;
  }

  setBusy(button, true);
  try {
    const { session } = await getSessionAndSchool();
    const { error } = await supabase
      .from("schools")
      .update({ name })
      .eq("id", session.user.id);
    if (error) throw error;
      const { autherror } = await supabase.auth.updateUser({
        data: {
          display_name: name
        }
      });
      if (autherror) throw error;
    updateSchoolName(name);
    popup("成功", "アカウント名を更新しました。", "success");
  } catch (error) {
    console.error(error);
    popup(`アカウント名の更新に失敗しました。`, `${error.message ?? ""}`, "error");
  } finally {
    setBusy(button, false);
  }
});

document.getElementById("password-edit")?.addEventListener("click", async event => {
  const button = event.currentTarget;
  const currentPassword = String(document.getElementById("current-password-input")?.value ?? "");
  const newPassword = String(document.getElementById("new-password-input")?.value ?? "");
  if (!currentPassword || !newPassword) {
    popup('警告', "現在のパスワードと新しいパスワードを入力してください。", "warning");
    return;
  }
  if (!validPassword(newPassword)) {
    popup('警告', PASSWORD_MESSAGE, "warning");
    return;
  }

  setBusy(button, true);
  try {
    const { session } = await getSessionAndSchool();
    const email = session.user.email;
    if (!email) throw new Error("メールアドレスを取得できませんでした。");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword
    });
    if (signInError) throw new Error("現在のパスワードが一致しません。");

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;

    document.getElementById("current-password-input").value = "";
    document.getElementById("new-password-input").value = "";
    popup('お知らせ', "パスワードを更新しました。", "success");
  } catch (error) {
    console.error(error);
    popup(`パスワード更新に失敗しました。`, `${error.message ?? ""}`, "error");
  } finally {
    setBusy(button, false);
  }
});

document.getElementById("password-reset-mail")?.addEventListener("click", async event => {
  const button = event.currentTarget;
  setBusy(button, true);
  try {
    const { session } = await getSessionAndSchool();
    const email = session.user.email;
    if (!email) throw new Error("メールアドレスを取得できませんでした。");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/mypage/account/passwordreset.html`
    });
    if (error) throw error;
    popup('お知らせ', "パスワード再発行メールを送信しました。", "success");
  } catch (error) {
    console.error(error);
    popup(`再発行メールの送信に失敗しました。`, `${error.message ?? ""}`, "error");
  } finally {
    setBusy(button, false);
  }
});

document.getElementById("account-delete")?.addEventListener("click", async event => {
  const button = event.currentTarget;
  const inputName = safeText(document.getElementById("delete-account-name-input")?.value, 80);

  setBusy(button, true);
  try {
    const { session, school } = await getSessionAndSchool();
    if (inputName !== school.name) {
      popup('警告', "入力されたアカウント名が一致しません。", "warning");
      return;
    }

    const { data: { session: freshSession } } = await supabase.auth.getSession();
    const res = await worker("deleteSchoolAccount", {
      userId: session.user.id,
      accessToken: freshSession?.access_token
    });
    const json = await res.json();
    if (!res.ok || json?.status !== "ok") {
      throw new Error(json?.message ?? "Workerでの削除に失敗しました。");
    }

    await supabase.auth.signOut();
    sessionStorage.clear();
    popup("お知らせ", "アカウント情報を削除しました。", "success");
    setTimeout(() => {
      location.href = "/login/index.html";
    }, 1200);
  } catch (error) {
    console.error(error);
    popup(`アカウント削除に失敗しました。`, `${error.message ?? ""}`, "error");
  } finally {
    setBusy(button, false);
  }
});
