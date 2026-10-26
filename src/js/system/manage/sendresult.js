import { compactName } from '/src/js/common.js';
import { attachBracketReference } from "/src/js/classmatch/result-reference.js";
import { popup } from "/src/js/popup.js";
import { sortMatchesNewestFirst, supabase, branchesSB, semesterNameSB } from "/src/js/supabase.js";

const params = new URLSearchParams(window.location.search);
const semesterId = params.get("conduct");
const branchId = sessionStorage.getItem("login-branchId");

let allTeams = [];
let teamNameById = new Map();
let classNameById = new Map();
let requiresGender = false;
let teamsByGender = new Map();

function branchSportNameFixed(branchName) {
  return compactName(branchName)
    .replace(/支部$/, "")
    .replace(/謾ｯ驛ｨ$/, "")
    .replace(/隰ｾ・ｯ鬩幢ｽｨ$/, "");
}

function sportIdentityFixed(name) {
  const compact = compactName(name);
  if (compact.startsWith("男子")) return { base: compact.slice(2), gender: "男子" };
  if (compact.startsWith("女子")) return { base: compact.slice(2), gender: "女子" };
  if (compact.startsWith("男")) return { base: compact.slice(1), gender: "男子" };
  if (compact.startsWith("女")) return { base: compact.slice(1), gender: "女子" };  if (compact.endsWith("男子")) return { base: compact.slice(0, -2), gender: "男子" };
  if (compact.endsWith("女子")) return { base: compact.slice(0, -2), gender: "女子" };
  if (compact.endsWith("男")) return { base: compact.slice(0, -1), gender: "男子" };
  if (compact.endsWith("女")) return { base: compact.slice(0, -1), gender: "女子" };
  return { base: compact, gender: "" };
}

function teamLabel(team) {
  const className = classNameById.get(String(team.class_id));
  return className
    ? `${className}${team.entry_label ? `-${team.entry_label}` : ""}`
    : (team.teams_name ?? "");
}

async function hydrateClassNames(teams = []) {
  const classIds = [...new Set(teams.map(team => team.class_id).filter(Boolean).map(String))];
  if (!classIds.length) return;

  const { data, error } = await supabase
    .from("tournament_classes")
    .select("id,class_name,class_code")
    .in("id", classIds);

  if (error) {
    console.error(error);
    return;
  }

  data?.forEach(row => classNameById.set(String(row.id), row.class_name || row.class_code));
}

async function hydrateTeamNames(matches = []) {
  const ids = [...new Set(matches.flatMap(row => [row.team_a, row.team_b]).filter(Boolean).map(String))];
  const missingIds = ids.filter(id => !teamNameById.has(id));
  if (!missingIds.length) return;

  const { data, error } = await supabase
    .from("leagues_teams")
    .select("id,teams_name")
    .in("id", missingIds);

  if (error) {
    console.error(error);
    return;
  }

  data?.forEach(team => teamNameById.set(String(team.id), team.teams_name));
}

function renderLatestResult(row) {
  const teamA = teamNameById.get(String(row.team_a)) ?? row.team_a ?? "";
  const teamB = teamNameById.get(String(row.team_b)) ?? row.team_b ?? "";
  const winner = String(row.winner ?? "");
  return `
    <div class="latest-result-card filter">
      <h2>${row.match_game ?? ""} / ${row.match_type ?? ""}</h2>
      <div class="latest-result-score">
        <div class="latest-result-team ${winner === String(row.team_a) ? "winner" : ""}">
          <p>${teamA}</p>
          <strong>${row.score_a ?? ""}</strong>
        </div>
        <strong>VS</strong>
        <div class="latest-result-team ${winner === String(row.team_b) ? "winner" : ""}">
          <p>${teamB}</p>
          <strong>${row.score_b ?? ""}</strong>
        </div>
      </div>
    </div>
  `;
}

async function loadLatestResults(markNewest = false) {
  const list = document.getElementById("latest-results-list");
  if (!list) return;

  let { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("semester_id", semesterId)
    .order("played_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(8);

  if (error) {
    const fallback = await supabase
      .from("matches")
      .select("*")
      .eq("semester_id", semesterId);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error(error);
    list.textContent = "最新結果の取得に失敗しました。";
    return;
  }

  const sorted = sortMatchesNewestFirst(data ?? []).slice(0, 8);
  await hydrateTeamNames(sorted);
  list.innerHTML = sorted.length ? sorted.map(renderLatestResult).join("") : "まだ試合結果がありません。";
  if (markNewest) list.querySelector(".latest-result-card")?.classList.add("is-new");
}

document.addEventListener("DOMContentLoaded", async () => {
  const branches = await branchesSB(semesterId);
  const semester = await semesterNameSB(semesterId);
  const branch = branches?.find(b => String(b.id) === String(branchId));

  if (!branch) return;

  sessionStorage.setItem("branch", branch.branch_name);
  sessionStorage.setItem("semester", semester?.name ?? "");

  const { data: leaguesAll, error: leaguesError } = await supabase
    .from("leagues")
    .select("*")
    .eq("semester_id", semesterId);

  if (leaguesError) {
    console.error(leaguesError);
    popup("お知らせ", "リーグ情報の取得に失敗しました。", "error");
    return;
  }

  const sportBase = branchSportNameFixed(branch.branch_name);
  const targetLeagues = (leaguesAll ?? []).filter(league => sportIdentityFixed(league.sport).base === sportBase);
  requiresGender = targetLeagues.some(league => Boolean(sportIdentityFixed(league.sport).gender));
  const genderSelect = document.getElementById("game-gender");
  if (genderSelect) {
    genderSelect.hidden = !requiresGender;
    genderSelect.required = requiresGender;
    if (requiresGender) {
      genderSelect.innerHTML = "<option value='' disabled selected>性別</option><option value='男子'>男子</option><option value='女子'>女子</option>";
    }
    if (!requiresGender) genderSelect.value = "";
  }

  allTeams = [];
  teamsByGender = new Map();
  for (const league of targetLeagues) {
    const { data: teams, error: teamsError } = await supabase
      .from("leagues_teams")
      .select("*")
      .eq("leagues_id", league.id);

    if (teamsError) {
      console.error(teamsError);
      continue;
    }
    const sportTeams = teams ?? [];
    const gender = sportIdentityFixed(league.sport).gender;
    allTeams.push(...sportTeams);
    teamsByGender.set(gender, [...(teamsByGender.get(gender) ?? []), ...sportTeams]);
  }

  await hydrateClassNames(allTeams);
  teamNameById = new Map(allTeams.map(team => [String(team.id), team.teams_name]));

  renderTeamOptions();
  document.getElementById("game-gender")?.addEventListener("change", renderTeamOptions);
  await loadLatestResults();
  subscribeLatestResults();
});

function renderTeamOptions() {
  const selectedGender = document.getElementById("game-gender")?.value;
  const teams = requiresGender
    ? (selectedGender ? (teamsByGender.get(selectedGender) ?? []) : [])
    : allTeams;
  const teamInner = "<option value='' disabled selected>チームを選択</option>" + teams.map(team =>
    `<option value="${team.id}">${teamLabel(team)}</option>`
  ).join("");
  document.getElementById("team1").innerHTML = teamInner;
  document.getElementById("team2").innerHTML = teamInner;
}

let resultbutton = false;
document.getElementById("sendGameResult")?.addEventListener("click", sendGameResult);

async function sendGameResult() {
  if (resultbutton) return;
  resultbutton = true;

  const gender = document.getElementById("game-gender").value;
  const branch = sessionStorage.getItem("branch");
  const sport = requiresGender ? `${gender}${branchSportNameFixed(branch)}` : branchSportNameFixed(branch);
  const type = document.getElementById("game-type").value;
  const team1 = document.getElementById("team1").value;
  const team2 = document.getElementById("team2").value;
  const team1point = Number(document.getElementById("team1point").value);
  const team2point = Number(document.getElementById("team2point").value);

  if ((requiresGender && !gender) || !type || !team1 || !team2 || Number.isNaN(team1point) || Number.isNaN(team2point)) {
    popup("お知らせ", requiresGender ? "試合種別・性別・チーム・点数を入力してください。" : "試合種別・チーム・点数を入力してください。", "warning");
    resultbutton = false;
    return;
  }

  const winner = team1point > team2point ? team1 : team1point < team2point ? team2 : null;
  let resultPayload;
  try { resultPayload = await attachBracketReference(supabase, {
    semester_id: semesterId,
    match_game: sport,
    match_type: type,
    team_a: team1,
    team_b: team2,
    score_a: team1point,
    score_b: team2point,
    winner,
    played_at: new Date().toISOString()
  }); } catch (error) { popup("お知らせ", error.message, "error"); resultbutton = false; return; }
  const { error } = await supabase.from("matches").insert([resultPayload]);

  if (error) {
    console.error(error);
    popup("お知らせ", `送信中にエラーが発生しました。<br>${error.message}`, "error");
    resultbutton = false;
    return;
  }

  popup("お知らせ", `送信が完了しました。<br>${sport} ${type}`, "success");
  document.getElementById("game-type").value = "";
  document.getElementById("game-gender").value = "";
  document.getElementById("team1").value = "";
  document.getElementById("team1point").value = "";
  document.getElementById("team2").value = "";
  document.getElementById("team2point").value = "";
  await loadLatestResults(true);
  resultbutton = false;
}

function subscribeLatestResults() {
  supabase
    .channel(`manage-results-${semesterId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "matches" },
      payload => {
        if (String(payload.new.semester_id) !== String(semesterId)) return;
        loadLatestResults(true);
      }
    )
    .subscribe();
}
