//Cloudflare Workerでサーバーエンドとして実装(フロントエンドにはコードはありません。)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS,
      });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "";

    if (request.method === "POST") {
      if (type === "branchlogin") {
        const raw = await request.text();
        const body = JSON.parse(raw);
        const { data, error } = await getBranch(env, body.branchId);

        if (error) {
          return jsonResponse({
            status: "error",
            content: error,
          });
        }

        if (String(body.passcode) === String(data.passcode)) {
          const token = await signJwt(
            {
              role: "authenticated",
              sub: body.branchId,
              iss: "supabase",
              aud: "authenticated",
              exp: Math.floor(Date.now() / 1000) + 60 * 60,
            },
            env.SUPABASE_JWT_SECRET,
          );

          return jsonResponse({
            status: "ok",
            token,
            name: data.branch_name,
          });
        }

        return jsonResponse({
          status: "no",
        });
      } else if (type === "broadcastAnnouncements") {
        return handleWorkerError(async () => {
          requireEnv(env);
          const body = await parseJson(request);
          return getBroadcastAnnouncements(env, body);
        });
      } else if (type === "deleteSchoolAccount") {
        return handleWorkerError(async () => {
          requireEnv(env);
          const body = await parseJson(request);
          return deleteSchoolAccount(env, body);
        });
      } else if (type === "coreScoreData") {
        return handleWorkerError(async () => {
          requireEnv(env);
          const body = await parseJson(request);
          return getCoreScoreData(env, body);
        });
      } else if (type === "upsertCoreSportResults") {
        return handleWorkerError(async () => {
          requireEnv(env);
          const body = await parseJson(request);
          return upsertCoreSportResults(env, body);
        });
      } else if (type === "") {
      }
    }

    return new Response("Not Found", {
      status: 404,
      headers: CORS,
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(keepAlive(env));
  },
};

function requireEnv(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
}

function supabaseHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

function userSupabaseHeaders(env, accessToken, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${accessToken}`,
    ...extra,
  };
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function assertSupabaseOk(response, fallbackMessage) {
  if (response.ok) {
    return response;
  }

  let detail = "";

  try {
    const json = await response.json();
    detail = json.message || json.error || JSON.stringify(json);
  } catch {
    detail = await response.text();
  }

  throw new Error(detail || fallbackMessage);
}

async function fetchSupabaseJson(env, path, params = {}, options = {}) {
  const search = new URLSearchParams(params);
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}?${search}`, {
    ...options,
    headers: supabaseHeaders(env, options.headers ?? {}),
  });

  await assertSupabaseOk(response, `Failed to fetch ${path}.`);

  return response.json();
}

async function requireCoreBranch(env, body) {
  const semesterId = String(body.semester_id ?? body.semesterId ?? "").trim();
  const branchId = String(body.branch_id ?? body.branchId ?? "").trim();
  const accessToken = String(body.access_token ?? body.accessToken ?? "").trim();

  if (!semesterId || !branchId || !accessToken) {
    throw new Error("semester_id, branch_id and access_token are required.");
  }

  const params = new URLSearchParams({
    select: "id,semester_id,branch_name",
    id: `eq.${branchId}`,
    semester_id: `eq.${semesterId}`,
    limit: "1",
  });
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/semesters_branch?${params}`, {
    headers: userSupabaseHeaders(env, accessToken),
  });
  await assertSupabaseOk(response, "Failed to verify branch token.");

  const rows = await response.json();
  const branch = rows?.[0];

  if (!branch) {
    throw new Error("Branch token does not match this semester.");
  }

  const normalizedName = String(branch.branch_name ?? "").replace(/[\s\u3000]+/g, "");

  if (!normalizedName.includes("システム管理")) {
    throw new Error("System admin branch is required.");
  }

  return {
    semesterId,
    branchId,
    branch,
  };
}

async function getBroadcastAnnouncements(env, body) {
  const semesterId = String(body.semester_id ?? body.semesterId ?? "").trim();

  if (!semesterId) {
    return jsonResponse(
      {
        status: "error",
        message: "semester_id is required.",
      },
      400,
    );
  }

  const params = new URLSearchParams({
    select: "id,semester_id,body,created_by,created_to,created_of,created_at,broadcast",
    semester_id: `eq.${semesterId}`,
    broadcast: "is.true",
    order: "created_at.desc",
  });

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/announcements?${params}`, {
    headers: supabaseHeaders(env),
  });

  await assertSupabaseOk(response, "Failed to fetch broadcast announcements.");

  return jsonResponse({
    status: "ok",
    data: await response.json(),
  });
}

async function getCoreScoreData(env, body) {
  const { semesterId } = await requireCoreBranch(env, body);
  const matchesPromise = fetchSupabaseJson(env, "matches", {
    select: "*",
    semester_id: `eq.${semesterId}`,
    order: "played_at.desc,id.desc",
  }).catch(() =>
    fetchSupabaseJson(env, "matches", {
      select: "*",
      semester_id: `eq.${semesterId}`,
      order: "created_at.desc,id.desc",
    }),
  );

  const [semesters, leagues, matches, results, classes] = await Promise.all([
    fetchSupabaseJson(env, "semesters", {
      select: "id,sports_config",
      id: `eq.${semesterId}`,
      limit: "1",
    }),
    fetchSupabaseJson(env, "leagues", {
      select: "*",
      semester_id: `eq.${semesterId}`,
    }),
    matchesPromise,
    fetchSupabaseJson(env, "sport_results", {
      select: "*",
      semester_id: `eq.${semesterId}`,
    }),
    fetchSupabaseJson(env, "tournament_classes", {
      select: "*",
      semester_id: `eq.${String(semesterId)}`,
      order: "sort_order.asc",
    }),
  ]);

  const leagueIds = leagues.map((league) => league.id).filter(Boolean);
  const teams = leagueIds.length
    ? await fetchSupabaseJson(env, "leagues_teams", {
        select: "*",
        leagues_id: `in.(${leagueIds.join(",")})`,
      })
    : [];

  return jsonResponse({
    status: "ok",
    data: {
      semester: semesters?.[0] ?? null,
      leagues,
      matches,
      results,
      classes,
      teams,
    },
  });
}

async function getBranch(env, branchId) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/semesters_branch`);
  url.searchParams.set("select", "*");
  url.searchParams.set("id", `eq.${branchId}`);

  const response = await fetch(url.toString(), {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/vnd.pgrst.object+json",
    },
  });

  if (response.ok) {
    return {
      data: await response.json(),
      error: null,
    };
  }

  return {
    data: null,
    error: await readSupabaseError(response),
  };
}

async function getUserFromAccessToken(env, accessToken) {
  if (!accessToken) {
    throw new Error("accessToken is required.");
  }

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  await assertSupabaseOk(response, "Failed to verify access token.");

  return response.json();
}

async function deleteSchoolAccount(env, body) {
  const userId = String(body.userId ?? body.user_id ?? "").trim();
  const accessToken = String(body.accessToken ?? body.access_token ?? "").trim();

  if (!userId || !accessToken) {
    return jsonResponse(
      {
        status: "error",
        message: "userId and accessToken are required.",
      },
      400,
    );
  }

  const user = await getUserFromAccessToken(env, accessToken);

  if (String(user.id) !== userId) {
    return jsonResponse(
      {
        status: "error",
        message: "Token user does not match requested user.",
      },
      403,
    );
  }

  const schoolDelete = await fetch(
    `${env.SUPABASE_URL}/rest/v1/schools?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: supabaseHeaders(env, {
        Prefer: "return=minimal",
      }),
    },
  );

  await assertSupabaseOk(schoolDelete, "Failed to delete school row.");

  const authDelete = await fetch(
    `${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: supabaseHeaders(env),
    },
  );

  await assertSupabaseOk(authDelete, "Failed to delete auth user.");

  return jsonResponse({
    status: "ok",
  });
}

async function upsertCoreSportResults(env, body) {
  const { semesterId } = await requireCoreBranch(env, body);
  const rows = Array.isArray(body.results) ? body.results : [];
  const payload = rows
    .filter((row) => String(row.semester_id) === String(semesterId))
    .map((row) => ({
      semester_id: String(row.semester_id),
      sport_id: String(row.sport_id ?? ""),
      team_id: row.team_id === null || row.team_id === undefined ? null : String(row.team_id),
      rank: row.rank ?? null,
      wins: Number(row.wins) || 0,
      tournament_wins: Number(row.tournament_wins) || 0,
      participated: row.participated === false ? false : true,
      goals_for: Number(row.goals_for) || 0,
      goals_against: Number(row.goals_against) || 0,
      win_rank: row.win_rank ?? null,
      team_count: row.team_count ?? null,
      calculated_points: row.calculated_points ?? null,
    }))
    .filter((row) => row.sport_id);

  if (!payload.length) {
    return jsonResponse(
      {
        status: "error",
        message: "results are required.",
      },
      400,
    );
  }

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/sport_results?on_conflict=semester_id,sport_id,team_id`,
    {
      method: "POST",
      headers: supabaseHeaders(env, {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify(payload),
    },
  );
  await assertSupabaseOk(response, "Failed to upsert sport results.");

  return jsonResponse({
    status: "ok",
    data: await response.json(),
  });
}

async function keepAlive(env) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/semesters_branch?select=id&limit=1`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
}

async function readSupabaseError(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS,
    },
  });
}

async function handleWorkerError(callback) {
  try {
    return await callback();
  } catch (error) {
    return jsonResponse(
      {
        status: "error",
        message: error?.message ?? "Unexpected worker error.",
      },
      500,
    );
  }
}

async function signJwt(payload, secret) {
  const encodedHeader = base64UrlEncode(
    JSON.stringify({
      alg: "HS256",
    }),
  );
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = await signHmacSha256(data, secret);

  return `${data}.${base64UrlEncode(signature)}`;
}

async function signHmacSha256(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  return crypto.subtle.sign("HMAC", key, encoder.encode(data));
}

function base64UrlEncode(value) {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : new Uint8Array(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
