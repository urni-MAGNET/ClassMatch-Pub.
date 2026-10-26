import { eventAppliesToCourt } from './timetable-table.js';
import { validateTimetableSettings } from "./timetable-prompt.js";
import { getSportCourts } from "./courts.js";
import { expandTimetableOutputIds } from "./timetable-compact.js";

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const time = value => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const minute = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const overlap = (a, b) => a.date === b.date && a.occupiedStart < b.occupiedEnd && b.occupiedStart < a.occupiedEnd;
const issue = (code, message, relatedIds = []) => ({ code, message, relatedIds });

export function validateTimetableJSON(text, structure, settings) {
  let data;
  try { data = expandTimetableOutputIds(JSON.parse(text), structure); } catch { return { errors: [issue("JSON", "JSONの構文が正しくありません。引用符・カンマ・括弧を確認してください。")], warnings: [], proposals: [] }; }
  const errors = [], warnings = [];
  const result = { errors, warnings, proposals: [] };
  if (!object(data) || data.schemaVersion !== 1 || data.kind !== "classmatch-timetable" || !["ok", "infeasible"].includes(data.status) || !Array.isArray(data.proposals)) {
    errors.push(issue("SCHEMA", "schemaVersion: 1、kind: classmatch-timetable、status、proposalsを確認してください。"));
    return result;
  }
  function messages(value, target, label) {
    if (!Array.isArray(value)) { errors.push(issue("SCHEMA", `${label}は配列が必要です。`)); return; }
    for (const row of value) {
      if (!object(row) || typeof row.code !== "string" || typeof row.message !== "string" || !Array.isArray(row.relatedIds) || row.relatedIds.some(id => typeof id !== "string")) errors.push(issue("SCHEMA", `${label}の項目形式が不正です。`));
      else target.push(issue(`AI:${row.code}`, row.message, row.relatedIds));
    }
  }
  messages(data.errors, errors, "AIのerrors");
  messages(data.warnings, warnings, "AIのwarnings");
  if (data.status === "infeasible") { errors.push(issue("INFEASIBLE", "AIは条件を満たす案を生成できなかったと報告しています。")); return result; }
  if (!data.proposals.length) errors.push(issue("EMPTY", "タイムテーブル案がありません。"));
  if (!structure?.sports?.length) { errors.push(issue("INPUT", "大会テンプレートと参加チームを読み込んでください。")); return result; }
  try { validateTimetableSettings(settings, structure.sports); }
  catch (error) { errors.push(issue("SETTINGS", `現在の時間設定: ${error.message}`)); return result; }
  const sports = new Map(structure.sports.map(sport => [sport.sportId, sport]));
  const matches = new Map(structure.sports.flatMap(sport => [...sport.leagueMatchPairs, ...sport.tournamentMatchPairs].map(match => [match.matchId, match])));
  const days = new Map(settings.days.map(day => [day.date, day]));
  const teams = new Map(structure.sports.flatMap(sport => sport.teams.map(team => [team.teamId, team])));
  // Resolve possible participants without pretending tournament results are known.
  function candidates(entry, sport, visited = new Set()) {
    if (!entry) return [];
    if (entry.sourceMatchId) {
      if (visited.has(entry.sourceMatchId)) return [];
      const next = new Set(visited).add(entry.sourceMatchId), match = matches.get(entry.sourceMatchId);
      return match ? [...candidates(match.teamA, sport, next), ...candidates(match.teamB, sport, next)] : [];
    }
    return entry.sourceLeagueId ? sport.teams.filter(team => team.leagueId === entry.sourceLeagueId) : teams.has(entry.teamId) ? [teams.get(entry.teamId)] : [];
  }
  const proposalIds = new Set();
  for (const proposal of data.proposals) {
    const checked = { label: typeof proposal?.label === "string" ? proposal.label : "名称なし", errors: [], warnings: [], rows: [] };
    result.proposals.push(checked);
    const fail = (code, message, ids) => checked.errors.push(issue(code, message, ids));
    if (!object(proposal) || typeof proposal.proposalId !== "string" || !proposal.proposalId || !Array.isArray(proposal.matches)) { fail("SCHEMA", "案のproposalId・matches形式が不正です。"); continue; }
    if (proposalIds.has(proposal.proposalId)) fail("PROPOSAL_DUPLICATE", "案のIDが重複しています。", [proposal.proposalId]);
    proposalIds.add(proposal.proposalId);
    messages(proposal.warnings, checked.warnings, `${checked.label}のwarnings`);
    const occurrences = new Map(), scheduled = new Map();
    for (const row of proposal.matches) {
      if (!object(row)) { fail("ROW", "試合データはオブジェクトが必要です。"); continue; }
      const ids = typeof row.matchId === "string" ? [row.matchId] : [];
      occurrences.set(row.matchId, (occurrences.get(row.matchId) ?? 0) + 1);
      if (occurrences.get(row.matchId) > 1) fail("DUPLICATE", "同じ試合が複数回配置されています。", ids);
      const sport = sports.get(row.sportId), match = matches.get(row.matchId);
      if (!sport) fail("SPORT", "存在しない競技IDです。", ids);
      if (!match) fail("MATCH", "存在しない試合IDです。大会データが生成時から変わっていないか確認してください。", ids);
      if (!sport || !match) continue;
      if (match.sportId !== row.sportId) { fail("SPORT_MATCH", "試合と競技の組み合わせが一致しません。", ids); continue; }
      const courts = getSportCourts(sport);
      let venue = row.venue, court = row.court;
      if (courts.length === 1) {
        if (venue === undefined) venue = courts[0].venue;
        if (court === undefined) court = courts[0].court;
        if (row.venue === undefined || row.court === undefined) checked.warnings.push(issue("VENUE_INFERRED", `JSONの不足情報を大会設定の「${venue} / ${court || "場所全体"}」から補いました。`, ids));
      }
      if (courts.length && !courts.some(location => location.venue === venue && location.court === court)) fail("VENUE_MISMATCH", "実施場所・コートが登録設定と一致しません。複数コートがある場合はvenueとcourtを指定してください。", ids);
      if (!courts.length) {
        if ((venue !== undefined && venue !== "") || (court !== undefined && court !== "")) fail("VENUE_MISMATCH", "未登録の実施場所・コートが指定されています。", ids);
        venue = ""; court = "";
        checked.warnings.push(issue("VENUE_UNKNOWN", `${sport.sportName}の実施場所が未設定です。他競技との会場重複を検証できません。`, ids));
      }
      if (!["occupiedStart", "startTime", "endTime", "occupiedEnd"].every(key => time(row[key])) || !(row.occupiedStart <= row.startTime && row.startTime < row.endTime && row.endTime <= row.occupiedEnd)) { fail("TIME", "時刻形式または開始・終了の順序が不正です。", ids); continue; }
      const timing = settings.sportTimings[row.sportId];
      if (minute(row.endTime) - minute(row.startTime) !== timing.matchMinutes || minute(row.startTime) - minute(row.occupiedStart) !== timing.beforeMinutes || minute(row.occupiedEnd) - minute(row.endTime) !== timing.afterMinutes) fail("DURATION", "試合時間または前後余白が設定と一致しません。", ids);
      const day = days.get(row.date);
      if (!day || !day.availableTimes.some(slot => slot.startTime <= row.occupiedStart && row.occupiedEnd <= slot.endTime)) fail("WINDOW", "開催日または試合可能時間の範囲外です（前後余白を含む）。", ids);
      for (const event of day?.events ?? []) {
        if (!eventAppliesToCourt(event, row.sportId, row)) continue;
        if (event.startMode === "after-morning-matches") {
          if (row.occupiedStart < event.endTime && event.endTime <= row.occupiedEnd) fail("EVENT", `イベント「${event.name}」の共通終了時刻を試合がまたいでいます。`, ids);
        } else if (row.occupiedStart < event.endTime && event.startTime < row.occupiedEnd) fail("EVENT", `全体イベント「${event.name}」と重複しています。`, ids);
      }
      const participants = [...candidates(match.teamA, sport), ...candidates(match.teamB, sport)];
      const uncertain = Boolean(match.teamA?.sourceMatchId || match.teamB?.sourceMatchId || match.teamA?.sourceLeagueId || match.teamB?.sourceLeagueId);
      const normalized = { ...row, venue, court, match, sportName: sport.sportName, participants, uncertain };
      checked.rows.push(normalized);
      scheduled.set(row.matchId, normalized);
    }
    if (proposal.matches.length !== matches.size) fail("COUNT", `試合数が一致しません。必要${matches.size}試合 / 読み込み${proposal.matches.length}試合。`);
    for (const [id] of matches) if (!occurrences.has(id)) fail("MISSING", "必要な試合が配置されていません。", [id]);
    for (const day of settings.days) for (const event of day.events ?? []) {
      if (event.startMode !== "after-morning-matches") continue;
      const targetSports = [...sports.values()].filter(sport => !event.sportId || event.sportId === sport.sportId);
      for (const sport of targetSports) {
        const morning = checked.rows.filter(row => row.date === day.date && row.sportId === sport.sportId && row.occupiedEnd < event.endTime);
        const fallback = day.availableTimes.map(slot => slot.startTime).sort()[0];
        const inferredStart = morning.map(row => row.occupiedEnd).sort().at(-1) ?? fallback;
        if (!inferredStart || inferredStart >= event.endTime) fail("EVENT", `${sport.sportName}のイベント「${event.name}」を共通終了時刻より前に確保できません。`, [sport.sportId]);
        else checked.warnings.push(issue("EVENT_START_INFERRED", `${sport.sportName}の「${event.name}」開始を午前最終試合後の${inferredStart}として確認しました。`, [sport.sportId]));
      }
    }
    for (const sport of structure.sports) {
      const actual = new Map(sport.teams.map(team => [team.teamId, 0]));
      for (const match of sport.leagueMatchPairs) for (const id of [match.teamAId, match.teamBId]) actual.set(id, (actual.get(id) ?? 0) + (scheduled.has(match.matchId) ? occurrences.get(match.matchId) : 0));
      for (const team of sport.teams) {
        const needed = sport.leagues.reduce((sum, league) => sum + (league.matchesPerTeam[team.teamId] ?? 0), 0);
        if (actual.get(team.teamId) !== needed) fail("TEAM_COUNT", `${sport.sportName} / ${team.teamName}: リーグ試合数が不足または過剰です。必要${needed} / 配置${actual.get(team.teamId)}。`, [team.teamId]);
      }
      if (sport.tournamentMatchPairs.length) checked.warnings.push(issue("CONDITIONAL", `${sport.sportName}: トーナメントは全試合枠と順序を検証しました。実チームの最終試合数は進出・勝敗の確定後に決まります。`));
    }
    for (const row of checked.rows) {
      const prerequisites = new Set(row.match.dependsOn ?? []);
      for (const entry of [row.match.teamA, row.match.teamB]) if (entry?.sourceLeagueId) for (const match of sports.get(row.sportId).leagueMatchPairs) if (match.leagueId === entry.sourceLeagueId) prerequisites.add(match.matchId);
      for (const id of prerequisites) {
        const previous = scheduled.get(id);
        if (previous && `${previous.date}T${previous.occupiedEnd}` > `${row.date}T${row.occupiedStart}`) fail("DEPENDENCY", "前の試合・予選リーグが終了する前に次の試合が始まります。", [id, row.matchId]);
      }
      if (row.participants.some(team => !team.classId) || !row.participants.length) checked.warnings.push(issue("CLASS_UNKNOWN", "学級が未設定または参加者未確定のため、学級重複を完全には検証できません。", [row.matchId]));
    }
    for (let i = 0; i < checked.rows.length; i++) for (let j = i + 1; j < checked.rows.length; j++) {
      const a = checked.rows[i], b = checked.rows[j];
      if (!overlap(a, b)) continue;
      const ids = [a.matchId, b.matchId];
      if ((!a.venue && !b.venue && a.sportId === b.sportId) || (a.venue && a.venue === b.venue && (a.court === b.court || a.court === "" || b.court === ""))) fail("VENUE", `実施場所・コート「${a.venue || a.sportName} / ${a.court || "場所全体"}」が同時刻に二重予約されています（${a.date} ${a.occupiedStart}〜${a.occupiedEnd} / ${b.occupiedStart}〜${b.occupiedEnd}）。`, ids);
      const sameTeams = a.participants.filter(team => b.participants.some(other => other.teamId === team.teamId));
      const sameClasses = a.participants.filter(team => team.classId && b.participants.some(other => other.classId === team.classId));
      if (sameTeams.length && !a.uncertain && !b.uncertain) fail("TEAM_OVERLAP", "同じチームの試合が同時刻に配置されています。", ids);
      if (sameClasses.length) checked.warnings.push(issue(a.uncertain || b.uncertain ? "CLASS_POSSIBLE" : "CLASS_OVERLAP", `${a.uncertain || b.uncertain ? "進出結果によって同じ" : "同じ"}学級の試合が重複${a.uncertain || b.uncertain ? "する可能性があります" : "しています"}（${a.date} ${a.occupiedStart}〜${a.occupiedEnd} / ${b.occupiedStart}〜${b.occupiedEnd}）。`, [...ids, ...new Set(sameClasses.map(team => team.classId))]));
    }
    checked.rows.sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`) || a.sportId.localeCompare(b.sportId));
  }
  return result;
}
