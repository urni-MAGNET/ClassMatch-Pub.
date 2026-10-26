import { applyProfile, applyClassProfile, restoreTournamentInput } from "./create.js";
import { collectTournamentInput } from './create-structure-data.js';

const panel = document.getElementById("template-editor-panel");
const frame = document.getElementById("template-editor-frame");
const status = document.getElementById("template-editor-status");
const apply = document.getElementById("apply-template-editor");
let type = "score";
function open(kind) {
  type = kind;
  status.textContent = "";
  apply.disabled = true;
  document.getElementById("template-editor-title").textContent = kind === "score" ? "大会テンプレート作成" : "学級テンプレート作成";
  frame.src = `/mypage/${kind}-profile/?embedded=1`;
  panel.showModal();
}
frame.addEventListener("load", () => {
  const style = frame.contentDocument.createElement("style");
  style.textContent = ".header,.classmatch-background{display:none!important} body{padding:0!important} main.box{margin:0!important;width:100%!important;max-width:none!important;box-sizing:border-box} .profile-side-panel{position:static!important}";
  frame.contentDocument.head.append(style);
  const current = type === 'score' ? window.classMatchImportedProfile : window.classMatchImportedClassProfile;
  if (current && frame.contentWindow.classMatchLoadTemplate) frame.contentWindow.classMatchLoadTemplate(current);
  apply.disabled = false;
});
document.getElementById("open-score-profile").addEventListener("click", () => open("score"));
document.getElementById("open-class-profile").addEventListener("click", () => open("class"));
document.getElementById("close-template-editor").addEventListener("click", () => panel.close());
apply.addEventListener("click", async () => {
  try {
    if (typeof frame.contentWindow.classMatchCollectTemplate !== "function") throw new Error("編集画面の読み込みを待ってください。");
    const profile = frame.contentWindow.classMatchCollectTemplate();
    if (type === "score") {
      const previous = collectTournamentInput();
      applyProfile(profile);
      const next = collectTournamentInput();
      next.sports = next.sports.map(sport => {
        const old = previous.sports.find(item => item.sportId === sport.sportId && item.format === sport.format);
        return old ? { ...sport, leagues: old.leagues, tournamentSettings: { ...old.tournamentSettings, thirdPlace: profile.sports.find(item => item.id === sport.sportId)?.tournament?.thirdPlace } } : sport;
      });
      await restoreTournamentInput(next);
    } else applyClassProfile(profile);
    panel.close();
  } catch (error) { status.textContent = error.message; }
});
