const SVG_NS = "http://www.w3.org/2000/svg";

export function measureTeamStartPoints(container, elements) {
  const parent = container.getBoundingClientRect();
  return [...elements].map(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.right - parent.left - container.clientLeft + container.scrollLeft, y: rect.top + rect.height / 2 - parent.top - container.clientTop + container.scrollTop };
  });
}

export function drawLine(pointA, pointB) {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", `M ${pointA.x} ${pointA.y} V ${pointB.y} H ${pointB.x}`);
  path.setAttribute("fill", "none");
  return path;
}

export function renderTournamentSVG(data, container) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("tournament-line-layer");
  svg.setAttribute("viewBox", `0 0 ${data.geometry.width} ${data.geometry.height}`);
  svg.setAttribute("width", data.geometry.width);
  svg.setAttribute("height", data.geometry.height);
  svg.setAttribute("aria-hidden", "true");
  for (const [a, b] of data.drawPairs) {
    if (!data.points[a] || !data.points[b]) throw new Error(`Unknown point: ${a}, ${b}`);
    const line = drawLine(data.points[a], data.points[b]);
    line.dataset.from = a;
    line.dataset.to = b;
    svg.append(line);
  }
  container.querySelector(":scope > .tournament-line-layer")?.remove();
  container.prepend(svg);
  return svg;
}
