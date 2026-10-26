import { getSportCourts } from "./courts.js";
import { compactTimetableInput } from "./timetable-compact.js";

export const TIMETABLE_RULES = `あなたは大会のタイムテーブルを作成します。入力JSONを唯一の大会データとして使用してください。
1. 各チームが必要な試合を過不足なく行うよう、各matchIdを各案にちょうど1回配置してください。
2. 対戦組み合わせ、ID、進出条件を変更しないでください。シードは試合ではありません。
3. 同じclassIdを持つチームが異なる競技で同時刻に試合をすることを可能な限り避けてください。避けられない場合はwarningsに対象IDと時間を示してください。nullのclassIdは同一学級とみなしません。
4. 開会式・昼休み等のイベントと、対象競技の試合および前後余白を重ねないでください。sportIdを持つイベントはその競技のみ、指定なしは全競技に適用します。startMode="after-morning-matches" のイベントは開始時刻が未定です。各対象競技について午前に配置すると決めた全試合のoccupiedEnd直後からイベントを開始し、指定された共通のendTimeまで1分以上確保してください。試合をイベント終了時刻にまたがらせず、午後の試合はendTime以降に配置してください。競技ごとに異なる開始時刻になって構いません。
5. 試合および前後余白は、指定された開催日の試合可能時間内に収めてください。
6. 複数日開催に対応し、日付を省略しないでください。時間帯はAsia/Tokyo、時刻はHH:mmです。区間は開始を含み終了を含みません。
7. 競技別の試合時間・前後余白を守ってください。occupiedStart=startTime-beforeMinutes、endTime=startTime+matchMinutes、occupiedEnd=endTime+afterMinutesです。
8. 条件を満たせない場合は勝手に変更せずstatus=infeasibleとし、errorsに問題点と関連IDを示してください。入力不足もエラーとして示してください。
9. 実行可能な案を1案だけ生成してください。案が0ならinfeasibleです。
入力JSONのidEncodingがcompact-v2の場合、s・t・c・l・mで始まる短いIDはこの依頼内だけの識別子です。sports[].matchesのidが試合ID、slotsは必ず2つの参加枠、afterは先に終了すべき試合IDです。各slotは次のいずれかです。(a) teamがある場合はその1チーム、(b) fromMatchとoutcomeがある場合はその試合のwinnerまたはloser、(c) fromLeagueとrankがある場合はそのリーグの順位チームです。candidatesは未確定枠に入り得る候補であり、全候補が同時にその試合へ参加する意味ではありません。短いIDをUUIDへ推測・展開せず、返答のmatchIdとsportIdには入力の短いIDをそのまま使用してください。
各試合は競技のcourts配列から1つ選び、venue（実施場所）とcourt（コート）をそのまま記録してください。登録外のコートを作らないでください。同じvenueでもcourtが異なれば、同じ競技の複数試合を同時開催できます。同じvenueとcourtの組み合わせでは、競技が異なっても前後余白を含め同時開催しません。courtが空文字の旧設定は場所全体を占有するため、その場所の他コートとも重ねません。courtsが空配列なら場所未設定としてwarningsに記録し、競技ごとに同時開催1試合までとします。teamで確定している同じチームの試合はコートが異なっても前後余白を含め重ねません。未確定slotのcandidates同士が重なるだけなら全候補を同一チーム扱いせず、可能性としてwarningsに記録してください。それだけを理由にinfeasibleにしないでください。
各試合のafterに並ぶ試合がすべてoccupiedEndまで終了した後に、その試合のoccupiedStartを配置してください。
未確定の勝者・敗者・順位枠は実チームへ置換しません。candidatesは重複可能性の検査だけに使い、候補全員が出場すると数えないでください。候補チームのclassIdも考慮し、確定できない重複はwarningsに示してください。トーナメントの各実チームの出場数は勝敗で変化するため固定試合数を捏造しません。
任意指示は固定条件に矛盾しない範囲で適用し、矛盾はerrorsに示してください。
返答はMarkdownや説明文を含めず、以下の形式のJSONオブジェクトのみ。schemaVersion=1、kind=classmatch-timetable、statusはokまたはinfeasible。全案で入力のsports[].matches[].idをmatchIdとして使用してください。
{"schemaVersion":1,"kind":"classmatch-timetable","status":"ok","proposals":[{"proposalId":"plan-1","label":"案1","matches":[{"matchId":"入力のmatchId","sportId":"入力のsportId","venue":"選択した実施場所","court":"選択したコート","date":"YYYY-MM-DD","occupiedStart":"HH:mm","startTime":"HH:mm","endTime":"HH:mm","occupiedEnd":"HH:mm"}],"warnings":[]}],"errors":[],"warnings":[]}
warningsとerrorsは[{"code":"識別コード","message":"具体的な問題","relatedIds":[]}]形式。infeasibleの場合proposals=[]。`;

function minutes(value, name, positive = false) {
  if (!Number.isInteger(value) || value < (positive ? 1 : 0)) throw new Error(`${name}は${positive ? 1 : 0}以上の整数で入力してください。`);
  return value;
}

export function validateTimetableSettings(settings, sports) {
  if (!settings?.days?.length) throw new Error("開催日を追加してください。");
  const dates = new Set();
  const time = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const interval = row => time(row.startTime) && time(row.endTime) && row.startTime < row.endTime;
  for (const day of settings.days) {
    const date = new Date(`${day.date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day.date || dates.has(day.date)) throw new Error("開催日は有効な日付を重複なく入力してください。");
    dates.add(day.date);
    if (!day.availableTimes?.length || day.availableTimes.some(row => !interval(row))) throw new Error("試合可能時間の開始・終了を確認してください。");
    const sorted = [...day.availableTimes].sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (sorted.some((row, index) => index && row.startTime < sorted[index - 1].endTime)) throw new Error("試合可能時間が重複しています。");
    if ((day.events ?? []).some(row => row.sportId && !sports.some(sport => sport.sportId === row.sportId))) throw new Error('イベントの対象競技が変更されています。対象を選び直してください。');
    if ((day.events ?? []).some(row => !row.name?.trim() || (row.startMode === "after-morning-matches" ? !time(row.endTime) : !interval(row)))) throw new Error("イベントの名称・開始方法・終了時刻を確認してください。");
  }
  for (const sport of sports) {
    const timing = settings.sportTimings?.[sport.sportId];
    if (!timing) throw new Error(`${sport.sportName}の試合時間を設定してください。`);
    minutes(timing.matchMinutes, "試合時間", true);
    minutes(timing.beforeMinutes, "試合前余白");
    minutes(timing.afterMinutes, "試合後余白");
  }
  return settings;
}

export function generateTimetablePrompt(structure, settings, tournamentInfo = {}, instructions = "") {
  if (!structure?.sports?.length) throw new Error("大会テンプレートを読み込んでください。");
  validateTimetableSettings(settings, structure.sports);
  const normalized = { ...structure, sports: structure.sports.map(sport => ({ ...sport, courts: getSportCourts(sport) })) };
  const { data } = compactTimetableInput(normalized, settings, tournamentInfo, instructions);
  return `${TIMETABLE_RULES}\n\n入力JSON:\n${JSON.stringify(data)}`;
}
