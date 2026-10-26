import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1"

const supabaseUrl = "https://mgarsbzernqqgvrtqefl.supabase.co"
const supabaseAnonKey = "sb_publishable_bG7yevGazugv7ceyMnYBrw_fnm7TLWd"
const jwttoken = sessionStorage.getItem("sb-token")

const mode = sessionStorage.getItem("auth-mode");

let supabase
const publicSupabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)

if (mode === "branch" && jwttoken) {
  supabase = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${jwttoken}`
        }
      }
    }
  )
} else {
  // 学校モード or tokenなし
  sessionStorage.removeItem("sb-token")

  supabase = createClient(
    supabaseUrl,
    supabaseAnonKey
  )
}

export { publicSupabase, supabase }

function newestSortValue(row, key) {
  const value = row?.[key];
  if (value === null || value === undefined || value === "") return -Infinity;

  const time = Date.parse(value);
  if (!Number.isNaN(time)) return time;

  const number = Number(value);
  if (Number.isFinite(number)) return number;

  return String(value);
}

export function sortNewestFirst(rows = [], primaryKey = "created_at", fallbackKey = "id") {
  return [...rows].sort((a, b) => {
    const primaryA = newestSortValue(a, primaryKey);
    const primaryB = newestSortValue(b, primaryKey);
    if (primaryA !== primaryB) {
      if (typeof primaryA === "string" || typeof primaryB === "string") {
        return String(primaryB).localeCompare(String(primaryA), "ja");
      }
      return primaryB - primaryA;
    }

    const fallbackA = newestSortValue(a, fallbackKey);
    const fallbackB = newestSortValue(b, fallbackKey);
    if (typeof fallbackA === "string" || typeof fallbackB === "string") {
      return String(fallbackB).localeCompare(String(fallbackA), "ja");
    }
    return fallbackB - fallbackA;
  });
}

export function sortMatchesNewestFirst(rows = []) {
  return sortNewestFirst(rows, "played_at", "id");
}

export function worker (type, json) {
 const res = fetch("https://classmatch.kagomagnet.workers.dev?type=" + type ,{
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(json)
  })
  return res;
}

export async function broadcastAnnouncementsSB(semesterId) {
  const response = await worker("broadcastAnnouncements", { semester_id: semesterId });
  if (!response.ok) {
    throw new Error(`worker error: ${response.status}`);
  }
  const json = await response.json();
  return Array.isArray(json) ? json : (json.data ?? json.announcements ?? []);
}

function branchWorkerAuthPayload(semesterId) {
  return {
    semester_id: semesterId,
    branch_id: sessionStorage.getItem("login-branchId"),
    access_token: sessionStorage.getItem("sb-token")
  };
}

export async function coreScoreDataSB(semesterId) {
  const response = await worker("coreScoreData", branchWorkerAuthPayload(semesterId));
  const json = await response.json();
  if (!response.ok || json?.status === "error") {
    throw new Error(json?.message ?? `worker error: ${response.status}`);
  }
  return json.data;
}

export async function upsertCoreSportResultsSB(semesterId, results) {
  const response = await worker("upsertCoreSportResults", {
    ...branchWorkerAuthPayload(semesterId),
    results
  });
  const json = await response.json();
  if (!response.ok || json?.status === "error") {
    throw new Error(json?.message ?? `worker error: ${response.status}`);
  }
  return json.data;
}
/////////////////////////////////////
export async function branchesSB(semesterId) {
  const { data, error } = await supabase
    .from('semesters_branch')
    .select("id, branch_name")
    .eq("semester_id", semesterId)

  if(error) {
    console.error(error);
    return;
  }
  return data;
}

export async function semesterNameSB(semesterId) {
  const { data, error } = await supabase
    .from('semesters')
    .select('id, name')
    .eq("id", semesterId)
    .single()

  if(error) {
    console.error(error);
    return;
  }
  return data;
}
