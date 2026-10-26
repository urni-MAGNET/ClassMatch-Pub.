import { cloneJson } from '../common.js';
export { cloneJson } from '../common.js';
import { plainObject, safeString, safeNumber } from "../common.js";
import { parseScoreFormula, evaluateScoreFormula } from "./score-formula.js";
export { evaluateScoreFormula } from "./score-formula.js";
import { getSportCourts, courtKey } from "./courts.js";

export const SPORT_FORMATS = [
  ["league", "リーグ"],
  ["tournament", "トーナメント"],
  ["league_then_tournament", "リーグ＋決勝トーナメント"],
  ["manual", "手動"],
  ["custom", "カスタム"]
];

export const RANKING_RULES = [
  ["wins", "勝利数"],
  ["goalDifference", "得失点差"],
  ["goalsFor", "総得点"],
  ["headToHead", "直接対決"],
  ["manual", "手動"]
];

const FORMAT_VALUES = new Set(SPORT_FORMATS.map(([value]) => value));
const RANKING_VALUES = new Set(RANKING_RULES.map(([value]) => value));

export const DEFAULT_PROFILE = {
  profileName: "標準クラスマッチ",
  profileVersion: 1,
  sports: [
    {
      id: "soccer",
      name: "サッカー",
      format: "league_then_tournament",
      groups: { enabled: true, defaultCount: 4 },
      tournament: {
        enabled: true,
        thirdPlace: true,
        advanceTeams: 8,
        placementAutoDetect: true
      },
      rankingRule: {
        league: ["wins", "goalDifference", "goalsFor", "headToHead", "manual"]
      },
      scoreRule: {
        type: "formula",
        points: {
          "1": 100,
          "2": 70,
          "3": 50,
          "4": 40,
          participation: 10
        },
        bonus: [{ field: "tournamentWins", multiply: 10 }],
        formula: "if(winRank <= 8, wins * 10 + teamCount * 8 / winRank, 0)",
        classAggregation: "sum",
        manualEnabled: true
      }
    }
  ]
};

export const CURRENT_SCORE_FORMULA = "if(best8, rankScore * 100 + winsWithoutThirdPlace * 10, 0)";




function slug(value, fallback) {
  const normalized = safeString(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}


export function normalizeSport(input = {}, index = 0) {
  const requestedFormat = input.format === "tornament" ? "tournament" : input.format;
  const format = FORMAT_VALUES.has(requestedFormat) ? requestedFormat : "manual";
  const ranking = Array.isArray(input.rankingRule?.league)
    ? input.rankingRule.league.filter(value => RANKING_VALUES.has(value))
    : [];
  if (!ranking.includes("manual")) ranking.push("manual");

  const sourcePoints = plainObject(input.scoreRule?.points) ? input.scoreRule.points : {};
  const points = {};
  Object.entries(sourcePoints).forEach(([key, value]) => {
    if (/^\d+$/.test(key) || key === "participation") {
      points[key] = safeNumber(value);
    }
  });
  if (!("participation" in points)) points.participation = 0;

  const bonus = Array.isArray(input.scoreRule?.bonus)
    ? input.scoreRule.bonus
        .filter(item => plainObject(item) && safeString(item.field))
        .map(item => ({
          field: safeString(item.field),
          multiply: Number(item.multiply) || 0
        }))
    : [];

  const name = safeString(input.name, `競技 ${index + 1}`);
  const sourceScoreRule = plainObject(input.scoreRule) ? input.scoreRule : {};
  const formulaSource = String(input.scoreRule?.formula ?? "").trim();
  return {
    ...input,
    id: slug(input.id, `sport-${index + 1}`),
    name,
    venue: safeString(input.venue).normalize("NFKC").replace(/\s+/g, " "),
    courts: getSportCourts(input),
    format,
    groups: {
      enabled: Boolean(input.groups?.enabled),
      defaultCount: Math.max(1, Math.floor(safeNumber(input.groups?.defaultCount, 1, 1)))
    },
    timing: { ...input.timing, matchMinutes: input.timing?.matchMinutes ?? input.matchMinutes ?? null },
    tournament: {
      ...input.tournament,
      thirdPlace: input.tournament?.thirdPlace !== false,
      enabled: format === "tournament" || Boolean(input.tournament?.enabled),
      advanceTeams: Math.floor(safeNumber(input.tournament?.advanceTeams, format === "tournament" ? safeNumber(input.tournament?.teamCount, 8) : 0)),
      placementAutoDetect: Boolean(input.tournament?.placementAutoDetect)
    },
    rankingRule: { league: ranking },
    scoreRule: {
      ...sourceScoreRule,
      type: ["placement", "metrics", "hybrid", "formula", "manual"].includes(input.scoreRule?.type)
        ? input.scoreRule.type
        : "placement",
      points,
      bonus,
      formula: formulaSource,
      classAggregation: ["sum", "best", "average"].includes(input.scoreRule?.classAggregation)
        ? input.scoreRule.classAggregation
        : "sum",
      manualEnabled: true
    }
  };
}

export function normalizeProfile(input) {
  if (!plainObject(input)) throw new Error("JSONのルートはオブジェクトにしてください。");
  const sports = Array.isArray(input.sports) ? input.sports.map(normalizeSport) : [];
  const ids = new Set();
  sports.forEach(sport => {
    if (ids.has(sport.id)) throw new Error(`競技ID「${sport.id}」が重複しています。`);
    ids.add(sport.id);
  });
  return {
    profileName: safeString(input.profileName ?? input.name, "名称未設定テンプレート"),
    profileVersion: Math.max(1, Math.floor(safeNumber(input.profileVersion ?? input.version, 1, 1))),
    sports
  };
}

export function validateProfile(input) {
  const profile = normalizeProfile(input);
  const errors = [];
  if (!profile.profileName) errors.push("テンプレート名が必要です。");
  if (!profile.sports.length) errors.push("競技を1つ以上追加してください。");
  profile.sports.forEach((sport, index) => {
    const courtIds = new Set();
    for (const location of sport.courts) {
      if (!location.venue) errors.push(`「${sport.name}」の実施場所を入力してください。`);
      const key = courtKey(location.venue, location.court);
      if (courtIds.has(key)) errors.push(`「${sport.name}」の実施場所・コートが重複しています。`);
      courtIds.add(key);
    }
    if (!sport.id) errors.push(`${index + 1}番目の競技IDが必要です。`);
    if (!sport.name) errors.push(`${index + 1}番目の競技名が必要です。`);
    if (sport.timing.matchMinutes !== null && (!Number.isInteger(Number(sport.timing.matchMinutes)) || Number(sport.timing.matchMinutes) <= 0)) errors.push(`「${sport.name}」の試合時間は正の整数（分）にしてください。`);
    if (sport.tournament.enabled && sport.tournament.advanceTeams !== 0 && sport.tournament.advanceTeams < 2) {
      errors.push(`「${sport.name}」の進出チーム数は2以上にしてください。`);
    }
    if (sport.scoreRule.type === "formula") {
      try {
        parseScoreFormula(sport.scoreRule.formula);
      } catch (error) {
        errors.push(`「${sport.name}」の得点計算式: ${error.message}`);
      }
    }
  });
  if (errors.length) throw new Error(errors.join("\n"));
  return profile;
}

export function tournamentConfigFromProfile(input) {
  const profile = validateProfile(input);
  return {
    schemaVersion: 1,
    templateSource: {
      profileName: profile.profileName,
      profileVersion: profile.profileVersion,
      importedAt: new Date().toISOString()
    },
    sports: cloneJson(profile.sports)
  };
}

export function profileFromTournamentConfig(config, name) {
  return validateProfile({
    profileName: safeString(name, config?.templateSource?.profileName || "大会から保存したテンプレート"),
    profileVersion: Math.max(1, Number(config?.templateSource?.profileVersion) || 1),
    sports: Array.isArray(config?.sports) ? config.sports : []
  });
}

export function calculateOverallPoints(sport, result = {}) {
  const rule = normalizeSport(sport).scoreRule;
  if (result.manualPoints !== null && result.manualPoints !== undefined && result.manualPoints !== "") {
    if (!rule.manualEnabled && rule.type !== "manual") {
      throw new Error("この競技では手動得点が許可されていません。");
    }
    return Number(result.manualPoints) || 0;
  }

  if (rule.type === "manual") return null;
  const rank = Number(result.rank) || 0;
  const variables = {
    wins: Number(result.wins) || 0,
    tournamentWins: Number(result.tournamentWins) || 0,
    winsWithoutThirdPlace: Number(result.winsWithoutThirdPlace ?? result.wins) || 0,
    tournamentWinsWithoutThirdPlace: Number(result.tournamentWinsWithoutThirdPlace ?? result.tournamentWins) || 0,
    thirdPlaceWins: Number(result.thirdPlaceWins) || 0,
    goalsFor: Number(result.goalsFor) || 0,
    goalsAgainst: Number(result.goalsAgainst) || 0,
    goalDifference: (Number(result.goalsFor) || 0) - (Number(result.goalsAgainst) || 0),
    placement: rank,
    rank,
    teamCount: Number(result.teamCount) || 0,
    winRank: Number(result.winRank) || 0,
    participation: result.participated === false ? 0 : 1,
    finalTournamentParticipant: result.finalTournamentParticipant ? 1 : 0,
    top4: rank >= 1 && rank <= 4 ? 1 : 0,
    best8Only: rank >= 5 && rank <= 8 ? 1 : 0,
    best8: rank >= 1 && rank <= 8 ? 1 : 0,
    rankScore: rank > 0 ? Math.max(0, (Number(result.teamCount) || 0) - rank + 1) : 0,
    best8RankScore: rank >= 1 && rank <= 8 ? 9 - rank : 0
  };
  Object.assign(variables, {
    tournamentwins: variables.tournamentWins,
    winswithoutthirdplace: variables.winsWithoutThirdPlace,
    tournamentwinswithoutthirdplace: variables.tournamentWinsWithoutThirdPlace,
    thirdplacewins: variables.thirdPlaceWins,
    goalsfor: variables.goalsFor,
    goalsagainst: variables.goalsAgainst,
    goaldifference: variables.goalDifference,
    teamcount: variables.teamCount,
    winrank: variables.winRank,
    best8only: variables.best8Only,
    rankscore: variables.rankScore,
    best8rankscore: variables.best8RankScore
  });

  const rankPointConfigured = Object.prototype.hasOwnProperty.call(rule.points, String(rank));
  const participationConfigured = Number(rule.points.participation ?? 0) !== 0;
  const bonusConfigured = rule.bonus.some(item => Number(item.multiply) !== 0);
  const formulaPoints = () => evaluateScoreFormula(rule.formula || CURRENT_SCORE_FORMULA, variables);
  const placementPoints = Number(rule.points[String(rank)] ?? 0) + Number(rule.points.participation ?? 0) * variables.participation;
  const bonusPoints = rule.bonus.reduce((sum, item) => sum + (Number(variables[item.field]) || 0) * (Number(item.multiply) || 0), 0);
  if (rule.type === "placement") {
    return rankPointConfigured || participationConfigured ? placementPoints : formulaPoints();
  }
  if (rule.type === "metrics") {
    return bonusConfigured || participationConfigured
      ? bonusPoints + Number(rule.points.participation ?? 0) * variables.participation
      : formulaPoints();
  }
  if (rule.type === "hybrid") {
    return rankPointConfigured || participationConfigured || bonusConfigured
      ? placementPoints + bonusPoints
      : formulaPoints();
  }
  return formulaPoints();
}

export const FORMULA_VARIABLES = {
  wins: "勝利数",
  tournamentWins: "トーナメント勝利数",
  winsWithoutThirdPlace: "三位決定戦を除いた勝利数",
  tournamentWinsWithoutThirdPlace: "三位決定戦を除いたトーナメント勝利数",
  thirdPlaceWins: "三位決定戦の勝利数",
  goalsFor: "総得点",
  goalsAgainst: "総失点",
  goalDifference: "得失点差",
  placement: "競技内順位",
  rank: "競技内順位（placementと同じ）",
  teamCount: "参加チーム数",
  winRank: "勝利数順位（RANK.EQ相当）",
  participation: "参加していれば1",
  finalTournamentParticipant: "決勝トーナメントの試合結果に登場したチームなら1、それ以外は0",
  top4: "1〜4位なら1、それ以外は0",
  best8Only: "5〜8位なら1、それ以外は0",
  best8: "1〜8位なら1、それ以外は0"
  ,
  rankScore: "順位が高いほど大きい順位点用の値",
  best8RankScore: "1位=8、2位=7...8位=1"
};

export function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename.replace(/[\\/:*?"<>|]+/g, "-");
  link.click();
  URL.revokeObjectURL(link.href);
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch {
        reject(new Error("JSONを解析できませんでした。ファイル形式を確認してください。"));
      }
    };
    reader.onerror = () => reject(new Error("ファイルを読み込めませんでした。"));
    reader.readAsText(file);
  });
}
