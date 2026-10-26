const root = document.getElementById("sports-root");
const select = document.getElementById("create-sport-select");
function showSport() {
  root.querySelectorAll(".tournament-sport-card").forEach(card => {
    card.hidden = card.dataset.sportId !== select.value;
  });
}
function refreshSports() {
  const cards = [...root.querySelectorAll(".tournament-sport-card")];
  const selected = select.value;
  select.replaceChildren(...cards.map(card => new Option(card.dataset.sportName, card.dataset.sportId)));
  if (!cards.length) select.add(new Option("テンプレートを読み込んでください", ""));
  select.value = cards.some(card => card.dataset.sportId === selected) ? selected : cards[0]?.dataset.sportId ?? "";
  select.disabled = !cards.length;
  showSport();
}
select.addEventListener("change", showSport);
new MutationObserver(refreshSports).observe(root, { childList: true });
refreshSports();

const toggle = document.querySelector(".create-menu-toggle");
const menu = document.getElementById("create-sidebar");
const backdrop = document.querySelector(".create-menu-backdrop");
const mobile = matchMedia("(max-width: 900px), (orientation: portrait)");
function setMenu(open, returnFocus = false) {
  document.body.classList.toggle("create-menu-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
  backdrop.hidden = !open;
  menu.inert = mobile.matches && !open;
  if (open) menu.querySelector("a")?.focus();
  else if (returnFocus) toggle.focus();
}
toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
backdrop.addEventListener("click", () => setMenu(false, true));
menu.addEventListener("click", event => {
  const link = event.target.closest("a");
  if (!link) return;
  setMenu(false);
  const target = document.querySelector(link.getAttribute("href"));
  target?.setAttribute("tabindex", "-1");
  target?.focus({ preventScroll: true });
});
document.addEventListener("keydown", event => {
  if (toggle.getAttribute("aria-expanded") !== "true") return;
  if (event.key === "Escape") setMenu(false, true);
  if (event.key !== "Tab") return;
  const stops = [toggle, ...menu.querySelectorAll("a")];
  const index = stops.indexOf(document.activeElement);
  event.preventDefault();
  stops[(index + (event.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
});
mobile.addEventListener("change", () => {
  document.body.classList.add("create-menu-layout-reset");
  setMenu(false);
  menu.getBoundingClientRect();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.body.classList.remove("create-menu-layout-reset");
  }));
});
setMenu(false);
