import { node } from '/src/js/common.js';
import { sportTimeTicks, eventAppliesToCourt, timetableTime } from "/src/js/classmatch/timetable-table.js";

export function renderAxisPage(container, page, { title = "クラスマッチ", school = "", label = "", print = false, pageNumber = "" } = {}) {
  const section = node("section", undefined, `timetable-date-page timetable-axis-page${print ? " timetable-print-page" : ""}`);
  section.dataset.date = page.date;
  section.append(node("h3", title), node("p", `${page.date}　${timetableTime(page.startMinute)}〜${timetableTime(page.endMinute)}　${label}`, "timetable-date-heading"));
  const viewport = node("div", undefined, "timetable-axis-scroll");
  const grid = node("div", undefined, "timetable-axis-grid");
  const courtCount = page.columns.reduce((sum, column) => sum + column.children.length, 0);
  grid.style.setProperty("--axis-height", `${page.height}px`);
  grid.style.minWidth = `${page.columns.length * 58 + courtCount * 180}px`;
  const tracks = page.columns.flatMap(column => ["58px", ...column.children.map(() => "minmax(0, 1fr)")]);
  grid.style.gridTemplateColumns = tracks.join(" ");
  const body = node("div", undefined, "timetable-axis-body");
  body.style.gridTemplateColumns = tracks.join(" ");
  body.style.gridColumn = "1 / -1";
  const positions = [];
  let index = 1;
  for (const column of page.columns) {
    const heading = node("div", column.sportName, "timetable-axis-sport");
    heading.style.gridColumn = `${index} / span ${column.children.length + 1}`;
    heading.style.gridRow = "1"; grid.append(heading);
    const clock = node("div", "時刻", "timetable-axis-corner");
    clock.style.gridColumn = String(index); clock.style.gridRow = "2 / span 2"; grid.append(clock);
    const axis = node("div", undefined, "timetable-axis-times");
    axis.style.gridColumn = String(index++);
    const ticks = sportTimeTicks(page, column.sportId);
    const starts = new Set(page.cards.filter(card => card.sportId === column.sportId).map(card => card.startTime));
    const labelled = [];
    // Prioritize actual starts when nearby event/regular ticks would collide.
    for (const tick of [...ticks].sort((a, b) => Number(starts.has(b.time)) - Number(starts.has(a.time)) || a.top - b.top)) {
      if (tick.top <= page.height - 12 && labelled.every(other => Math.abs(other.top - tick.top) >= 13)) labelled.push(tick);
    }
    for (const tick of ticks) {
      const mark = node("div", labelled.includes(tick) ? tick.time : "", "timetable-axis-tick");
      mark.style.top = `${tick.top}px`; axis.append(mark);
    }
    body.append(axis);
    for (const child of column.children) {
      positions.push({ sportId: column.sportId, child, track: index });
      const heading = node("div", child.label, "timetable-axis-court");
      heading.style.gridColumn = String(index); heading.style.gridRow = "2"; grid.append(heading);
      const teams = node("div", undefined, "timetable-axis-team-head");
      teams.style.gridColumn = String(index); teams.style.gridRow = "3";
      teams.append(node("span", "チーム1"), node("span", "チーム2")); grid.append(teams);
      const lane = node("div", undefined, "timetable-axis-lane"); lane.style.gridColumn = String(index++);
      for (const tick of ticks) { const line = node('div',undefined,'timetable-axis-line'); line.style.top = tick.top+'px'; lane.append(line); }
      body.append(lane);
    }
  }
  for (const event of page.events) {
    const targets = positions.filter(position => eventAppliesToCourt(event, position.sportId, position.child));
    const runs = [];
    for (const target of targets) {
      const previous = runs.at(-1);
      const between = previous && positions.some(position => position.track > previous.end && position.track < target.track);
      if (previous && !between) previous.end = target.track;
      else runs.push({ start: target.track, end: target.track });
    }
    for (const run of runs) {
      const band = node("div", event.name, "timetable-axis-event");
      band.style.gridColumn = `${run.start} / ${run.end + 1}`;
      band.style.top = `${event.top}px`; band.style.height = `${event.height}px`;
      band.title = `${event.name} ${event.startTime}〜${event.endTime}`; body.append(band);
    }
  }
  for (const card of page.cards) {
    const target = positions.find(position => position.sportId === card.sportId && position.child.venue === card.venue && position.child.court === card.court);
    if (!target) continue;
    const block = node("article", undefined, "timetable-axis-card");
    block.dataset.matchId = card.matchId ?? card.match?.matchId ?? "";
    block.style.gridColumn = `${target.track} / ${target.track + 1}`;
    block.style.top = `${card.top}px`; block.style.height = `${card.height}px`;
    block.title = `${card.teamNames.join(" 対 ")}　試合 ${card.startTime}〜${card.endTime}（占有 ${card.occupiedStart}〜${card.occupiedEnd}）`;
    block.setAttribute("aria-label", block.title);
    const match = node("div", undefined, "timetable-axis-card-match");
    match.style.top = `${card.matchTop}px`; match.style.height = `${card.matchHeight}px`;
    card.teamNames.forEach((name, i) => {
      const team = node("span", name, "timetable-axis-team");
      team.dataset.teamId = card.match?.[i ? "teamBId" : "teamAId"] ?? card.match?.[i ? "teamB" : "teamA"]?.teamId ?? "";
      match.append(team);
    });
    block.append(match); body.append(block);
  }
  grid.append(body); viewport.append(grid); section.append(viewport);
  const footer = node("footer", undefined, "timetable-footer");
  const logo = node("strong", undefined, "timetable-logo"); const icon = node("img"); icon.src = document.querySelector('link[rel="icon"]')?.href ?? ""; icon.alt = ""; logo.append(icon, document.createTextNode("MAGNET"));
  footer.append(node("span", school), node("small", pageNumber), logo);
  section.append(footer); container.append(section);
  return section;
}
