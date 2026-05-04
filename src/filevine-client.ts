import { getValidTokens } from "./auth/oauth.js";
import { enforceRateLimit, recordRateLimitHit } from "./utils/rate-limiter.js";

export class FileVineApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "FileVineApiError";
  }
}

function getApiBase(): string {
  const region = (process.env.FILEVINE_REGION ?? "us").toLowerCase();
  if (region === "ca") return "https://api.filevine.ca";
  return "https://api.filevine.io";
}

function parseErrorMessage(body: string): string {
  try {
    const j = JSON.parse(body) as unknown;
    if (typeof j === "object" && j !== null) {
      const o = j as Record<string, unknown>;
      if (typeof o["message"] === "string") return o["message"];
      if (typeof o["error"] === "string") return o["error"];
      if (Array.isArray(o["errors"])) return (o["errors"] as unknown[]).join(", ");
      const inner = o["error"];
      if (typeof inner === "object" && inner !== null) {
        const msg = (inner as Record<string, unknown>)["message"];
        if (typeof msg === "string") return msg;
      }
    }
  } catch {
    // fall through to raw body
  }
  return body.slice(0, 200) || "Unknown error";
}

async function request(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  body?: unknown,
  isRetry = false
): Promise<unknown> {
  await enforceRateLimit();

  const tokens = await getValidTokens();
  const url = new URL(`${getApiBase()}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const fetchOpts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      "x-fv-orgid": tokens.org_id,
      "x-fv-userid": tokens.user_id,
      "Content-Type": "application/json",
    },
  };
  if (body) fetchOpts.body = JSON.stringify(body);

  const res = await fetch(url.toString(), fetchOpts);

  // Handle 429 Too Many Requests with backoff
  if (res.status === 429 && !isRetry) {
    const retryAfter = res.headers.get("Retry-After");
    const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
    recordRateLimitHit(retryAfterMs);
    // Wait and retry
    await new Promise((r) => setTimeout(r, 1000));
    return request(method, path, params, body, true);
  }

  if (!res.ok) {
    const text = await res.text();
    const msg = parseErrorMessage(text);
    throw new FileVineApiError(res.status, `${method} ${path}: ${msg}`);
  }

  try {
    return await res.json();
  } catch {
    return null; // For 204 No Content responses
  }
}

export const filevineGet = (
  path: string,
  params?: Record<string, string | number | boolean | undefined>
) => request("GET", path, params);

export const filevinePost = (
  path: string,
  body?: unknown,
  params?: Record<string, string | number | boolean | undefined>
) => request("POST", path, params, body);

export const filevinePatch = (
  path: string,
  body?: unknown,
  params?: Record<string, string | number | boolean | undefined>
) => request("PATCH", path, params, body);

export const filevineDelete = (
  path: string,
  params?: Record<string, string | number | boolean | undefined>
) => request("DELETE", path, params);
