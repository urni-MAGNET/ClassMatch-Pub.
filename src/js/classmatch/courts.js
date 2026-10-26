const name = value => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();

export function getSportCourts(sport = {}) {
  const source = Array.isArray(sport.courts) ? sport.courts : sport.venue ? [{ venue: sport.venue, court: "" }] : [];
  return source.map(item => ({ venue: name(item.venue), court: name(item.court) }));
}

export function courtKey(venue, court = "") {
  return JSON.stringify([venue, court]);
}
