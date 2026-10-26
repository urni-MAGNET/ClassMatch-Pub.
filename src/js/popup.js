import { playNotificationSound } from './notification-sound.js';
let closeTimer;
export function popup(title = "お知らせ", content = '', type = "info") {
  let popupWindow = document.querySelector(".commu-popup");
  if (!popupWindow) {
    popupWindow = document.createElement("div");
    popupWindow.className = "commu-popup radius filter";
    popupWindow.innerHTML = `
      <div class="popup-title"></div>
      <div class="popup-content"></div>
    `;
    document.body.appendChild(popupWindow);
  }
  playNotificationSound(type);
  
  popupWindow.classList.remove("success", "error", "warning", "info");

  popupWindow.classList.add("send", type);
  popupWindow.querySelector('.popup-title').innerHTML = title;
  popupWindow.querySelector('.popup-content').innerHTML = content;
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    popupWindow.classList.remove("send");
  }, 3400);
}
