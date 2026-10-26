import { supabase } from "/src/js/supabase.js"
import { popup } from "/src/js/popup.js"
import { validPassword, PASSWORD_MESSAGE } from '../password-policy.js';
function setupToggle(inputId, buttonId) {
  const input = document.getElementById(inputId)
  const button = document.getElementById(buttonId)

  button?.addEventListener("click", () => {
    const hidden = input.type === "password"
    input.type = hidden ? "text" : "password"
    button.textContent = hidden ? "非表示" : "表示"
  })
}

setupToggle("login-password", "toggle-main")
setupToggle("login-password-re", "toggle-re")

document.getElementById("submit-account-btn")?.addEventListener("click", async (e) => {
  e.preventDefault()

  const errorText = document.querySelector(".errormessage")
  const name = document.getElementById("school-name").value.trim()
  const email = document.getElementById("school-email").value.trim()
  const password = document.getElementById("login-password").value
  const passwordRe = document.getElementById("login-password-re").value

  errorText.textContent = ""

  if (!name || !email || !password || !passwordRe) {
    errorText.textContent = "入力されていない項目があります。"
    return
  }

  if (password !== passwordRe) {
    errorText.textContent = "パスワードが一致していません。"
    return
  }

  if (!validPassword(password)) {
    errorText.textContent = PASSWORD_MESSAGE;
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: name,
        role: "school"
      }
    }
  })

  if (error) {
    console.error(error)
    errorText.textContent = "アカウントを作成できませんでした。入力内容を確認してください。"
    return
  }

  const authUserId = data.user?.id
  if (!authUserId) {
    errorText.textContent = "アカウント情報を取得できませんでした。"
    return
  }

  const { error: dbError } = await supabase
    .from("schools")
    .insert({
      id: authUserId,
      name
    })

  if (dbError) {
    console.error(dbError)
    errorText.textContent = "学校情報を保存できませんでした。"
    return
  }

  sessionStorage.removeItem("auth-mode")
  window.location.href = "/mypage/index.html"
})
