import { supabase } from "/src/js/supabase.js";
import { version } from "/src/js/version.js";

const headertitle = document.querySelector(".header-title");
const schoolnamecontainer = document.querySelectorAll(".schoolname");

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
if (error) {
  console.error(error);
  return;
}
 const schoolName = error || !school ? "Unknown" : school.name;
  if(schoolName === "Unknown") {
    if(window.location.href != location.origin + "/login/account.html") {
        window.location.href = location.origin + "/login/account.html"
    }
  }
  if (error) console.error(error);

  if (headertitle) {
    const currentTitle = headertitle.textContent.replace(/\s*v[\d.]+$/, "").trim();
    const pageName = currentTitle.includes("/") ? currentTitle.split("/").pop().trim() : "";
    headertitle.innerHTML = pageName
      ? ` ${schoolName} / <a href="/mypage/">Mypage</a> / ${pageName}<small>${version}</small>`
      : ` ${schoolName} / Mypage <small>${version}</small>`;
  }

  schoolnamecontainer.forEach(el => {
    el.textContent = schoolName;
  });

  const existing = document.getElementById("existing-system");
  if (!existing) return;

  const { data: semesters, error: semeE } = await supabase
    .from("semesters")
    .select("*")
    .eq("school_id", uid);

  if (semeE) {
    console.error(semeE);
    existing.innerHTML = "既存のシステムが確認されませんでした。まだ作成していない場合は新規作成してください。";
    return;
  }

  if (!semesters?.length) {
    existing.innerHTML = "<div class=\"existing-system filter\">まだシステムがありません。</div>";
    return;
  }

  existing.innerHTML = semesters.map(semester => `
    <div class="existing-system filter filterhover existing-system-card" id="${semester.id}" role="button" tabindex="0">
      <p class="system-name">${semester.name}</p>
      <p class="system-card-meta">詳細・編集・共有を開く</p>
    </div>
  `).join("");
});

const logout = document.getElementById("logout");
if (logout) {
  const modal = document.querySelector('.logout-checking');
  logout.addEventListener('click', e => { e.preventDefault(); modal?.showModal(); });
  document.getElementById('logout-cancel-btn')?.addEventListener('click', () => modal.close());
  document.getElementById('logout-submit-btn')?.addEventListener("click", async e => {
    e.preventDefault();
    const button = e.currentTarget; button.disabled = true;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      sessionStorage.clear();
      window.location.href = "/login/index.html";
    } catch (error) {
      console.error("サインアウトエラー:", error.message);
      modal.querySelector('h2').textContent = 'ログアウトできませんでした。再度お試しください。';
    } finally {
      button.disabled = false;
    }
  });
}
