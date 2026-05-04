import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { saveTokens, loadTokens, clearTokens } from "../token-store.js";
import type { FileVineTokens } from "../oauth.js";

// Mock environment
const originalEnv = process.env;

describe("Token Store", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    // Set a valid encryption key for tests
    process.env.ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it("should save and load tokens successfully", async () => {
    const testTokens: FileVineTokens = {
      access_token: "test_access_token",
      refresh_token: "test_refresh_token",
      expires_at: Date.now() + 3600000,
      org_id: "test_org_123",
      user_id: "test_user_456",
    };

    await saveTokens(testTokens);
    const loaded = await loadTokens();

    expect(loaded).toEqual(testTokens);
  });

  it("should encrypt tokens with AES-256-GCM", async () => {
    const testTokens: FileVineTokens = {
      access_token: "secret_token",
      refresh_token: "secret_refresh",
      expires_at: Date.now() + 3600000,
      org_id: "org_id",
      user_id: "user_id",
    };

    await saveTokens(testTokens);

    // Verify file exists and is binary (not plaintext JSON)
    const tokenDir = path.join(os.homedir(), ".oktopeak-filevine");
    const tokenFile = path.join(tokenDir, "tokens.enc");
    const fileContent = await fs.readFile(tokenFile);

    // File should contain encrypted data, not readable JSON
    const content = fileContent.toString("utf8");
    expect(content).not.toContain("secret_token");
    expect(content).not.toContain("secret_refresh");
  });

  it("should return null when no tokens are saved", async () => {
    // Ensure file doesn't exist
    const tokenDir = path.join(os.homedir(), ".oktopeak-filevine");
    const tokenFile = path.join(tokenDir, "tokens.enc");
    try {
      await fs.unlink(tokenFile);
    } catch {
      // File doesn't exist, which is expected
    }

    const loaded = await loadTokens();
    expect(loaded).toBeNull();
  });

  it("should handle decryption with wrong encryption key gracefully", async () => {
    const testTokens: FileVineTokens = {
      access_token: "test_token",
      refresh_token: "test_refresh",
      expires_at: Date.now() + 3600000,
      org_id: "org",
      user_id: "user",
    };

    await saveTokens(testTokens);

    // Change encryption key
    process.env.ENCRYPTION_KEY =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

    const loaded = await loadTokens();
    expect(loaded).toBeNull();
  });

  it("should throw error when encryption key is not set", async () => {
    delete process.env.ENCRYPTION_KEY;

    const testTokens: FileVineTokens = {
      access_token: "test_token",
      refresh_token: "test_refresh",
      expires_at: Date.now() + 3600000,
      org_id: "org",
      user_id: "user",
    };

    await expect(saveTokens(testTokens)).rejects.toThrow(
      "ENCRYPTION_KEY is not set"
    );
  });

  it("should throw error when encryption key has wrong length", async () => {
    process.env.ENCRYPTION_KEY = "tooshort";

    const testTokens: FileVineTokens = {
      access_token: "test_token",
      refresh_token: "test_refresh",
      expires_at: Date.now() + 3600000,
      org_id: "org",
      user_id: "user",
    };

    await expect(saveTokens(testTokens)).rejects.toThrow(
      "ENCRYPTION_KEY must be 64 hex chars"
    );
  });

  it("should clear tokens successfully", async () => {
    const testTokens: FileVineTokens = {
      access_token: "test_token",
      refresh_token: "test_refresh",
      expires_at: Date.now() + 3600000,
      org_id: "org",
      user_id: "user",
    };

    await saveTokens(testTokens);
    let loaded = await loadTokens();
    expect(loaded).not.toBeNull();

    await clearTokens();
    loaded = await loadTokens();
    expect(loaded).toBeNull();
  });

  it("should handle clearing non-existent token file gracefully", async () => {
    // Ensure file doesn't exist
    const tokenDir = path.join(os.homedir(), ".oktopeak-filevine");
    const tokenFile = path.join(tokenDir, "tokens.enc");
    try {
      await fs.unlink(tokenFile);
    } catch {
      // Expected if file doesn't exist
    }

    // Should not throw
    await expect(clearTokens()).resolves.not.toThrow();
  });
});
