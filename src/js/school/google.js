import { supabase } from "/src/js/supabase.js";
import { popup } from "/src/js/popup.js";

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    location.replace("/login/index.html");
    return;
  }

  const uid = session.user.id;
  sessionStorage.setItem("schoolid", uid);

  const { data: school, error } = await supabase
    .from("schools")
    .select("id,name")
    .eq("id", uid)
    .maybeSingle();
    console.log(school)
if (error) {
  console.error(error);
  return;
}
 if(school.name) {
    window.location.href = location.origin + "/mypage/index.html"
 }
  if (error) console.error(error);
});


async function getSessionAndSchool() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw sessionError ?? new Error("ログイン情報を取得できませんでした。");
  }

  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .select("id,name")
    .eq("id", session.user.id)
    .maybeSingle();
  if (schoolError) throw schoolError;

  return { session, school };
}
function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
}


document.getElementById('school-id-register-btn').addEventListener('click', async (el) => {
  const button = el.currentTarget;
  const schoolName = document.getElementById('account-name-input').value;
    if (!schoolName) {
    popup("注意！", "アカウント名を入力してください。", "warning");
    return;
  }
  setBusy(button, true);
    try {
      const { session } = await getSessionAndSchool();
      const { autherror } = await supabase.auth.updateUser({
        data: {
          display_name: schoolName
        }
      });

    if (autherror) {
      console.error(error);
    }
      const { error } = await supabase
        .from("schools")
        .insert(
          { 
            id: session.user.id,
            name:schoolName
           })

      if (error) throw error;
      popup("成功", "アカウント名を登録しました。", "success");
      window.location.href = location.origin + "/mypage/index.html"
    } catch (error) {
      console.error(error);
      popup(`アカウント名の更新に失敗しました。`, `${error.message ?? ""}`, "error");
    } finally {
      setBusy(button, false);
       window.location.href = location.origin + "/mypage/index.html"
    }
})
