import { generateTournamentStructure } from "/src/js/classmatch/tournament-structure.js";

function stableId(element, key) {
  element.dataset[key] ||= crypto.randomUUID();
  return element.dataset[key];
}

export function collectTournamentInput(root = document.getElementById("sports-root")) {
  return {
    profile: window.classMatchImportedProfile,
    sports: [...root.querySelectorAll(".conduct-sport-wrap")].map(sport => ({
      sportId: sport.dataset.sportId, sportName: sport.dataset.sportName, format: sport.dataset.format,
      timing: window.classMatchImportedProfile?.sports.find(item => item.id === sport.dataset.sportId)?.timing,
      tournamentSettings: {
        thirdPlace: sport.querySelector(".tournament-third-place")?.checked ?? window.classMatchImportedProfile?.sports.find(item => item.id === sport.dataset.sportId)?.tournament?.thirdPlace ?? true,
        slotOrder: JSON.parse(sport.dataset.slotOrder || "[]"),
        seedOrder: JSON.parse(sport.dataset.seedOrder || "[]"),
        enabled: sport.querySelector(".tournament-enabled")?.checked ?? window.classMatchImportedProfile?.sports.find(item => item.id === sport.dataset.sportId)?.tournament?.enabled ?? false,
        source: sport.querySelector(".tournament-source")?.value,
        extraTeams: [...sport.querySelectorAll('.tournament-extra-row')].filter(row => row.querySelector('.tournament-extra-name').value.trim()).map((row, index) => ({
          teamId: stableId(row, 'teamId'),
          teamName: row.querySelector('.tournament-extra-name').value.trim() || `自由枠${index + 1}`,
          placeholder: true,
          custom: true
        })),
        teamCount: sport.dataset.format === "tournament" ? sport.querySelectorAll(".direct-tournament-entries .team-wrap").length
          : sport.querySelector(".tournament-team-count") ? Number(sport.querySelector(".tournament-team-count").value || 0) : undefined
      },
      leagues: [...sport.querySelectorAll(".league-wrap")].map((league, leagueIndex) => ({
        leagueId: stableId(league, "leagueId"), dbId: league.dataset.dbId || null,
        leagueName: league.querySelector(".sport-leagues")?.value.trim() || `グループ ${leagueIndex + 1}`,
        drawMode: league.classList.contains("direct-tournament-entries") ? "entries"
          : league.classList.contains("visual-league-wrap") ? "visual" : "round_robin",
        matchesPerTeam: league.querySelectorAll(".team-wrap").length === 4 ? Number(league.querySelector(".square-match-mode")?.value || 3) : "all",
        advanceTeams: Number(league.querySelector(".league-advance-count")?.value || 0),
        teams: [...league.querySelectorAll(".team-wrap")].map((team, index) => ({
          teamId: stableId(team, "teamId"), dbId: team.dataset.dbId || null,
          teamName: team.querySelector(".league-teams")?.value.trim() || `チーム${index + 1}`,
          placeholder: !team.querySelector(".league-teams")?.value.trim(),
          classId: team.querySelector(".team-class-select")?.value || null,
          entryLabel: team.querySelector(".entry-label")?.value.trim() || ""
        }))
      }))
    }))
  };
}

export function generateCurrentTournamentStructure() {
  return generateTournamentStructure(collectTournamentInput());
}

export function downloadTournamentJSON(data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "classmatch-tournament-structure.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
