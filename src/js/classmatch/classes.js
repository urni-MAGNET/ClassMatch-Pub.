export { cloneJson as cloneClassJson } from '../common.js';
import { plainObject, safeString, safeNumber } from "../common.js";
import { downloadJson, readJsonFile } from "/src/js/classmatch/profile.js";

export const DEFAULT_CLASS_PROFILE = {
  profileName: "標準学級テンプレート",
  profileVersion: 1,
  classes: [
    { classCode: "1A", className: "1年A組" },
    { classCode: "1B", className: "1年B組" },
    { classCode: "1C", className: "1年C組" }
  ]
};





export function normalizeClassRow(input = {}, index = 0) {
  return {
    classCode: safeString(input.classCode ?? input.code, `class-${index + 1}`),
    className: safeString(input.className ?? input.name, `学級 ${index + 1}`)
  };
}

export function normalizeClassProfile(input) {
  if (!plainObject(input)) throw new Error("JSONのルートはオブジェクトにしてください。");
  const classes = Array.isArray(input.classes) ? input.classes.map(normalizeClassRow) : [];
  return {
    profileName: safeString(input.profileName ?? input.name, "名称未設定の学級テンプレート"),
    profileVersion: Math.max(1, Math.floor(safeNumber(input.profileVersion ?? input.version, 1, 1))),
    classes
  };
}

export function validateClassProfile(input) {
  const profile = normalizeClassProfile(input);
  const errors = [];
  const codes = new Set();
  if (!profile.profileName) errors.push("テンプレート名が必要です。");
  if (!profile.classes.length) errors.push("学級を1つ以上追加してください。");
  profile.classes.forEach((row, index) => {
    if (!row.classCode) errors.push(`${index + 1}番目の学級コードが必要です。`);
    if (!row.className) errors.push(`${index + 1}番目の学級名が必要です。`);
    if (codes.has(row.classCode)) errors.push(`学級コード「${row.classCode}」が重複しています。`);
    codes.add(row.classCode);
  });
  if (errors.length) throw new Error(errors.join("\n"));
  return profile;
}

export { downloadJson, readJsonFile };
