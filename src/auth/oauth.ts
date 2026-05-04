#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import os from "os";
import { loadTokens, saveTokens, clearTokens } from "./token-store.js";

export interface FileVineTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  org_id: string;
  user_id: string;
}

const CACHE_DIR = path.join(os.homedir(), ".oktopeak-filevine");
const ORG_USER_FILE = path.join(CACHE_DIR, "org-user.json");

function getIdentityUrl(): string {
  return "https://identity.filevine.com/connect/token";
}

function getApiBase(): string {
  const region = (process.env.FILEVINE_REGION ?? "us").toLowerCase();
  if (region === "ca") return "https://api.filevine.ca";
  return "https://api.filevine.io";
}

function getScopes(): string[] {
  return [
    "fv.api.gateway.access",
    "tenant",
    "filevine.v2.api.*",
    "email",
    "openid",
    "fv.auth.tenant.read",
    "fv.vitals.api.*",
    "fv.payments.api.all",
    "filevine.v2.webhooks",
  ];
}

export async function exchangePatForToken(): Promise<FileVineTokens> {
  const clientId = process.env.FILEVINE_CLIENT_ID;
  const clientSecret = process.env.FILEVINE_CLIENT_SECRET;
  const pat = process.env.FILEVINE_PAT;

  if (!clientId || !clientSecret || !pat) {
    throw new Error(
      "FILEVINE_CLIENT_ID, FILEVINE_CLIENT_SECRET, and FILEVINE_PAT must be set in .env"
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "personal_access_token",
    token: pat,
    scope: getScopes().join(" "),
  });

  const res = await fetch(getIdentityUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `PAT exchange failed (${res.status}): ${text.slice(0, 200)}`
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error("No access_token in response from identity service");
  }

  // Discover org and user IDs
  const { org_id, user_id } = await discoverOrgAndUser(data.access_token);

  const tokens: FileVineTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? "",
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    org_id,
    user_id,
  };

  await saveTokens(tokens);
  await saveOrgUser(org_id, user_id);
  return tokens;
}

async function discoverOrgAndUser(
  accessToken: string
): Promise<{ org_id: string; user_id: string }> {
  const cachedOrgUser = await loadOrgUser();
  if (cachedOrgUser) {
    console.error(
      `[oauth] Using cached org_id=${cachedOrgUser.org_id}, user_id=${cachedOrgUser.user_id}`
    );
    return cachedOrgUser;
  }

  console.error("[oauth] Discovering org and user IDs...");

  const baseUrl = getApiBase();
  const res = await fetch(`${baseUrl}/v2/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to discover user info (${res.status}): ${await res.text()}`
    );
  }

  const data = (await res.json()) as {
    id?: string;
    org_id?: string;
    organizationId?: string;
    userId?: string;
  };

  const userId = data.id || data.userId || "unknown";
  const orgId = data.org_id || data.organizationId || "unknown";

  if (orgId === "unknown" || userId === "unknown") {
    console.error(
      `[oauth] WARNING: Could not fully discover IDs. Response:`,
      data
    );
  }

  await saveOrgUser(orgId, userId);
  return { org_id: orgId, user_id: userId };
}

async function saveOrgUser(orgId: string, userId: string): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(
      ORG_USER_FILE,
      JSON.stringify({ org_id: orgId, user_id: userId }, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error(
      `[oauth] WARNING: Failed to cache org/user: ${(err as Error).message}`
    );
  }
}

async function loadOrgUser(): Promise<{
  org_id: string;
  user_id: string;
} | null> {
  try {
    const content = await fs.readFile(ORG_USER_FILE, "utf8");
    return JSON.parse(content) as { org_id: string; user_id: string };
  } catch {
    return null;
  }
}

export async function getValidTokens(): Promise<FileVineTokens> {
  let tokens = await loadTokens();
  if (!tokens) {
    throw new Error(
      'Not authenticated. Call exchangePatForToken() to authenticate.'
    );
  }

  if (Date.now() >= tokens.expires_at - 5 * 60 * 1000) {
    console.error("[oauth] Token near expiry, refreshing...");
    tokens = await refreshAccessToken(tokens);
  }

  return tokens;
}

export async function refreshAccessToken(
  tokens: FileVineTokens
): Promise<FileVineTokens> {
  const clientId = process.env.FILEVINE_CLIENT_ID;
  const clientSecret = process.env.FILEVINE_CLIENT_SECRET;
  const pat = process.env.FILEVINE_PAT;

  if (!clientId || !clientSecret || !pat) {
    throw new Error("Credentials not set in .env");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
  });

  const res = await fetch(getIdentityUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const updated: FileVineTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? tokens.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    org_id: tokens.org_id,
    user_id: tokens.user_id,
  };

  await saveTokens(updated);
  return updated;
}

export { clearTokens };
