import { sortMatchesNewestFirst, supabase } from "/src/js/supabase.js";
import { popup } from "/src/js/popup.js";

const params = new URLSearchParams(window.location.search);
const semesterId = params.get("conduct");
let teamNameById = new Map();

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

function teamName(row, side) {
  const id = side === "a" ? row.team_a : row.team_b;
  return teamNameById.get(String(id)) ?? id ?? "";
}

function winnerClass(row, side) {
  const teamId = side === "a" ? row.team_a : row.team_b;
  return String(row.winner ?? "") === String(teamId ?? "") ? "winner" : "";
}

function renderResult(row) {
  const checked = row.announced ? "checked" : "";
  return `
    <article class="announce-result-wrapper filter ${row.announced ? "announced" : ""}" data-id="${row.id}">
      <div class="announce-result-game-wrapper">
        <h4 class="announce-result-game">${row.match_game ?? ""}</h4>
        <p class="announce-result-game-type">${row.match_type ?? ""}</p>
      </div>
      <div class="announce-result-score">
        <div class="announce-result-team-wrap filter ${winnerClass(row, "a")}">
          <p class="announce-result-name">${teamName(row, "a")}</p>
          <p class="announce-result-point">${row.score_a ?? ""}</p>
        </div>
        <h3>VS</h3>
        <div class="announce-result-team-wrap filter ${winnerClass(row, "b")}">
          <p class="announce-result-name">${teamName(row, "b")}</p>
          <p class="announce-result-point">${row.score_b ?? ""}</p>
        </div>
      </div>
      <label class="announce-check-label">
        <input class="announce-check" type="checkbox" ${checked}>
        既読
      </label>
    </article>
  `;
}

async function queryMatches() {
  let response = await supabase
    .from("matches")
    .select("*")
    .eq("semester_id", semesterId)
    .order("announced", { ascending: true })
    .order("played_at", { ascending: false })
    .order("id", { ascending: false });

  if (response.error) {
    response = await supabase
      .from("matches")
      .select("*")
      .eq("semester_id", semesterId)
      .order("announced", { ascending: true });
  }

  return response;
}

async function getResult(markNewest = false) {
  const container = document.getElementById("announce-resultslist");
  const { data, error } = await queryMatches();

  if (error) {
    console.error(error);
    container.innerHTML = `取得中にエラーが発生しました。<br>${error.message}`;
    return;
  }

  await hydrateTeamNames(data ?? []);
  const sorted = sortMatchesNewestFirst(data ?? []);

  container.innerHTML = sorted.length ? sorted.map(renderResult).join("") : "試合結果はまだありません。";
  if (markNewest) container.querySelector(".announce-result-wrapper")?.classList.add("is-new");
}

document.addEventListener("change", async e => {
  if (!e.target.classList.contains("announce-check")) return;

  const card = e.target.closest(".announce-result-wrapper");
  const id = card?.dataset.id;
  const announced = e.target.checked;

  const { error } = await supabase
    .from("matches")
    .update({ announced })
    .eq("id", id);

  if (error) {
    console.error(error);
    popup("お知らせ", `既読状態の更新に失敗しました。<br>${error.message}`, "error");
    e.target.checked = !announced;
    return;
  }

  await getResult();
});

function subscribeRealtime() {
  return supabase
    .channel(`result-realtime-${semesterId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "matches" },
      payload => {
        const payloadSemesterId = payload.new?.semester_id ?? payload.old?.semester_id;
        const deletedId = payload.eventType === "DELETE" ? String(payload.old?.id ?? "") : "";
        const deletedVisibleRow = deletedId
          ? [...document.querySelectorAll(".announce-result-wrapper")]
            .some(row => String(row.dataset.id) === deletedId)
          : false;

        if (String(payloadSemesterId) !== String(semesterId) && !deletedVisibleRow) return;
        getResult(payload.eventType === "INSERT");
      }
    )
    .subscribe();
}

getResult();
subscribeRealtime();
