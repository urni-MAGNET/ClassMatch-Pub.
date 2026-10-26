import { generateCurrentTournamentJSON } from "./create-tournament-phase2.js";
import { generateTimetablePrompt } from "/src/js/classmatch/timetable-prompt.js";
import { availableMinutes, durationLabel, sportTimeEstimate } from "/src/js/classmatch/timetable-estimates.js";
import { popup } from "/src/js/popup.js";

const instructionsField = document.getElementById('timetable-instructions');
const defaultInstructions = '競技ごとに試合時間と開始時刻を独立させ、異なるコートでは同時に試合を行ってください。昼休みは「午前の最終試合後（未定）」を選ぶと、競技ごとに午前の試合がすべて終わった時点から開始し、指定した共通の終了時刻まで確保してください。';
if (!instructionsField.value) instructionsField.value = defaultInstructions;
const section = document.getElementById("create-timetable");
const days = document.getElementById("timetable-days");
const timings = document.getElementById("timetable-sports");
const output = document.getElementById("timetable-prompt");
const status = document.getElementById("timetable-status");

function removeButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "×";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", () => { button.parentElement.remove(); updateTimetableEstimates(); });
  return button;
}

function input(label, type, value, className) {
  const wrapper = document.createElement("label");
  wrapper.textContent = label;
  const control = document.createElement("input");
  control.type = type;
  control.value = value;
  control.className = className;
  if (type === "number") { control.min = className === "matchMinutes" ? "1" : "0"; control.step = "1"; }
  wrapper.append(control);
  return wrapper;
}

function timeRow(container, event = false, saved = null) {
  const row = document.createElement("div");
  row.className = event ? "timetable-event timetable-row" : "timetable-window timetable-row";
  if (event) row.append(input("イベント名", "text", "", "event-name"));
  let mode;
  if (event) {
    const label = document.createElement("label");
    label.textContent = "開始方法";
    mode = document.createElement("select");
    mode.className = "event-start-mode";
    mode.add(new Option("時刻を指定", "fixed"));
    mode.add(new Option("午前の最終試合後（未定）", "after-morning-matches"));
    label.append(mode);
    row.append(label);
  }
  const start = input("開始", "time", event ? "12:00" : "09:00", "start-time");
  row.append(start, input("終了", "time", event ? "13:00" : "16:00", "end-time"), removeButton(event ? "イベントを削除" : "時間帯を削除"));
  if (event) { const label = document.createElement('label'); label.textContent='対象競技';const select=document.createElement('select');select.className='event-sport';select.add(new Option('全競技で共通（1件）',''));select.add(new Option('各競技ごとに生成','__each_sport__'));(window.classMatchImportedProfile?.sports??[]).forEach(sport=>select.add(new Option(sport.name,sport.id)));if(saved?.sportId && ![...select.options].some(option=>option.value===saved.sportId))select.add(new Option('削除済み競技（選び直してください）',saved.sportId));select.value=saved?.scope === 'each-sport' ? '__each_sport__' : saved?.sportId??'';label.append(select);row.append(label); }
  container.append(row);
  if (saved) {
    row.querySelector(".start-time").value = saved.startTime ?? "";
    row.querySelector(".end-time").value = saved.endTime;
    if (event) row.querySelector(".event-name").value = saved.name;
  }
  if (event) {
    const syncStartMode = () => {
      const automatic = mode.value === "after-morning-matches";
      start.querySelector("input").disabled = automatic;
      if (automatic) start.querySelector("input").value = "";
      else if (!start.querySelector("input").value) start.querySelector("input").value = "12:00";
    };
    mode.value = saved?.startMode === "after-morning-matches" ? saved.startMode : "fixed";
    mode.addEventListener("change", syncStartMode);
    syncStartMode();
  }
}

function addDay(saved = null) {
  const day = document.createElement("fieldset");
  day.className = "timetable-day";
  day.innerHTML = '<legend>開催日</legend><div class="timetable-row day-heading"></div><h3>試合可能時間</h3><div class="available-times"></div><button type="button" class="add-window">時間帯を追加</button><h3>イベント・競技別の昼休み</h3><div class="day-events"></div><button type="button" class="add-event">イベントを追加</button>';
  const estimate = document.createElement("p");
  estimate.className = "timetable-day-estimate timetable-estimate";
  estimate.setAttribute("aria-live", "polite");
  day.querySelector(".day-heading").append(input("日付", "date", "", "day-date"), estimate);
  day.append(removeButton("開催日を削除"));
  day.querySelector(".add-window").addEventListener("click", () => timeRow(day.querySelector(".available-times")));
  day.querySelector(".add-event").addEventListener("click", () => timeRow(day.querySelector(".day-events"), true));
  timeRow(day.querySelector(".available-times"));
  days.append(day);
  if (saved?.date) {
    day.querySelector(".day-date").value = saved.date;
    day.querySelector(".available-times").replaceChildren();
    saved.availableTimes.forEach(row => timeRow(day.querySelector(".available-times"), false, row));
    saved.events.forEach(row => timeRow(day.querySelector(".day-events"), true, row));
  }
  updateTimetableEstimates();
}

export function restoreTimetableSettings(settings, instructions = "") {
  syncSports();
  for (const row of timings.children) {
    const timing = settings.sportTimings[row.dataset.sportId];
    if (timing) for (const key of ["matchMinutes", "beforeMinutes", "afterMinutes"]) row.querySelector(`.${key}`).value = timing[key];
  }
  days.replaceChildren();
  settings.days.forEach(addDay);
  document.getElementById("timetable-instructions").value = instructions || defaultInstructions;
  section.dispatchEvent(new Event("input", { bubbles: true }));
}

function syncSports() {
  const cards = [...document.querySelectorAll("#sports-root .conduct-sport-wrap")];
  const ids = new Set(cards.map(card => card.dataset.sportId));
  [...timings.children].filter(row => !ids.has(row.dataset.sportId)).forEach(row => row.remove());
  for (const card of cards) {
    let row = [...timings.children].find(row => row.dataset.sportId === card.dataset.sportId);
    if (row) continue;
    row = document.createElement("fieldset");
    row.dataset.sportId = card.dataset.sportId;
    row.className = "timetable-row";
    const legend = document.createElement("legend");
    legend.textContent = card.dataset.sportName;
    const estimate = document.createElement("p");
    estimate.className = "timetable-sport-estimate timetable-estimate";
    estimate.setAttribute("aria-live", "polite");
    row.append(legend, input("試合時間（分）", "number", window.classMatchImportedProfile?.sports.find(sport => sport.id === card.dataset.sportId)?.timing?.matchMinutes ?? "", "matchMinutes"), input("試合前余白（分）", "number", "0", "beforeMinutes"), input("試合後余白（分）", "number", "5", "afterMinutes"), estimate);
    timings.append(row);
  }
}

function updateTimetableEstimates(structure = window.classMatchTournamentData) {
  const dayMinutes = [...days.querySelectorAll(".timetable-day")].map(day => availableMinutes(
    [...day.querySelectorAll(".timetable-window")].map(row => ({
      startTime: row.querySelector(".start-time").value,
      endTime: row.querySelector(".end-time").value
    }))
  ));
  [...days.querySelectorAll(".timetable-day")].forEach((day, index) => {
    const estimate = day.querySelector(".timetable-day-estimate");
    if (estimate) estimate.textContent = `1コートあたり試合可能：${durationLabel(dayMinutes[index])}（イベント・昼休み控除前）`;
  });
  const availableTotal = dayMinutes.reduce((sum, value) => sum + value, 0);
  for (const row of timings.children) {
    const estimateNode = row.querySelector(".timetable-sport-estimate");
    if (!estimateNode) continue;
    const sport = structure?.sports?.find(item => String(item.sportId) === row.dataset.sportId);
    if (!sport) {
      estimateNode.textContent = "試合構成を作成すると予測時間を表示します。";
      estimateNode.dataset.capacity = "unknown";
      continue;
    }
    const timing = Object.fromEntries(["matchMinutes", "beforeMinutes", "afterMinutes"].map(key => {
      const value = row.querySelector(`.${key}`).value;
      return [key, value === "" ? NaN : Number(value)];
    }));
    const estimate = sportTimeEstimate(sport, timing);
    if (estimate.estimatedMinutes === null) {
      estimateNode.textContent = `${estimate.matchCount}試合・時間を入力すると予測時間を表示します。`;
      estimateNode.dataset.capacity = "unknown";
      continue;
    }
    const difference = availableTotal - estimate.estimatedMinutes;
    const comparison = availableTotal ? difference >= 0 ? `設定枠内・残り${difference}分` : `設定枠を${Math.abs(difference)}分超過` : "開催時間未設定";
    estimateNode.textContent = `${estimate.matchCount}試合 × ${estimate.minutesPerMatch}分 = ${estimate.totalMinutes}分 ÷ ${estimate.courtCount}コート ≈ ${durationLabel(estimate.estimatedMinutes)}（${comparison}、イベント控除前）`;
    estimateNode.dataset.capacity = !availableTotal ? "unknown" : difference >= 0 ? "ok" : "over";
  }
}

export function collectTimetableSettings() {
  syncSports();
  return {
    sportTimings: Object.fromEntries([...timings.children].map(row => [row.dataset.sportId, Object.fromEntries(["matchMinutes", "beforeMinutes", "afterMinutes"].map(key => [key, row.querySelector(`.${key}`).value === "" ? NaN : Number(row.querySelector(`.${key}`).value)]))])),
    days: [...days.children].map(day => ({ date: day.querySelector(".day-date").value,
      availableTimes: [...day.querySelectorAll(".timetable-window")].map(row => ({ startTime: row.querySelector(".start-time").value, endTime: row.querySelector(".end-time").value })),
      events: [...day.querySelectorAll(".timetable-event")].map(row => { const target = row.querySelector(".event-sport")?.value; return ({ sportId: target && target !== "__each_sport__" ? target : undefined, scope: target === "__each_sport__" ? "each-sport" : undefined, name: row.querySelector(".event-name").value, startMode: row.querySelector(".event-start-mode")?.value === "after-morning-matches" ? "after-morning-matches" : undefined, startTime: row.querySelector(".start-time").value || undefined, endTime: row.querySelector(".end-time").value }); })
    }))
  };
}

function generate() {
  output.value = "";
  output.value = generateTimetablePrompt(generateCurrentTournamentJSON(), collectTimetableSettings(), { name: document.getElementById("conduct-semester").value.trim(), profile: window.classMatchImportedProfile }, document.getElementById("timetable-instructions").value);
  return output.value;
}

document.getElementById("add-timetable-day").addEventListener("click", addDay);
document.getElementById("generate-timetable-prompt").addEventListener("click", () => {
  try { const prompt = generate(); status.textContent = `プロンプトを生成しました（${prompt.length.toLocaleString()}文字）。`; popup("プロンプトを生成しました", `${prompt.length.toLocaleString()}文字のプロンプトを生成しました。`, "success"); }
  catch (error) { status.textContent = error.message; popup("プロンプトを生成できませんでした", error.message, "error"); }
});
document.getElementById("copy-timetable-prompt").addEventListener("click", async () => {
  try {
    const prompt = generate();
    await navigator.clipboard.writeText(prompt);
    status.textContent = `コピーしました（${prompt.length.toLocaleString()}文字）。`;
    popup("コピーしました", `${prompt.length.toLocaleString()}文字のプロンプトをコピーしました。`, "success");
  } catch (error) {
    status.textContent = output.value ? "コピーできませんでした。プロンプトを選択してコピーしてください。" : error.message;
    popup("コピーできませんでした", status.textContent, "error");
    if (output.value) { output.focus(); output.select(); }
  }
});
document.getElementById("download-timetable-prompt")?.addEventListener("click", () => {
  try {
    const prompt = generate();
    const url = URL.createObjectURL(new Blob([prompt], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "classmatch-timetable-prompt.txt"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = `テキストファイルを保存しました（${prompt.length.toLocaleString()}文字）。`;
    popup("プロンプトを保存しました", "テキストファイルとして保存しました。", "success");
  } catch (error) {
    status.textContent = error.message;
    popup("プロンプトを保存できませんでした", error.message, "error");
  }
});
section.addEventListener("input", event => { if (event.target !== output) { output.value = ""; status.textContent = ""; updateTimetableEstimates(); } });
const invalidate = () => { output.value = ""; status.textContent = ""; };
document.getElementById("sports-root").addEventListener("input", invalidate);
document.getElementById("sports-root").addEventListener("change", invalidate);
document.getElementById("conduct-semester").addEventListener("input", invalidate);
new MutationObserver(() => { syncSports(); updateTimetableEstimates(); invalidate(); }).observe(document.getElementById("sports-root"), { childList: true });
window.addEventListener("classmatch:tournament-structure-updated", event => updateTimetableEstimates(event.detail));
syncSports();
addDay();
window.addEventListener('classmatch:restore-timetable', event => restoreTimetableSettings(event.detail.settings, event.detail.instructions));

section.addEventListener("input", event => {
 if (!event.target.matches(".matchMinutes")) return;
 const id = event.target.closest("fieldset").dataset.sportId;
 const sport = window.classMatchImportedProfile?.sports.find(item => item.id === id);
 if (!sport) return;
 sport.timing = { ...sport.timing, matchMinutes: event.target.value === "" ? null : Number(event.target.value) };
 const card = [...document.querySelectorAll(".conduct-sport-wrap")].find(item => item.dataset.sportId === id);
 if (card) card.querySelector(".sport-match-minutes").value = event.target.value;
});
