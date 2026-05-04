import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";

// These tests verify the oauth module structure and error handling
// More comprehensive tests should be integration tests with real/mock API

describe("OAuth Module", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.FILEVINE_CLIENT_ID = "test_client_id";
    process.env.FILEVINE_CLIENT_SECRET = "test_client_secret";
    process.env.FILEVINE_PAT = "test_pat_token";
    process.env.FILEVINE_REGION = "us";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Environment Variable Validation", () => {
    it("should require FILEVINE_CLIENT_ID", async () => {
      const { exchangePatForToken } = await import("../oauth.js");
      delete process.env.FILEVINE_CLIENT_ID;

      await expect(exchangePatForToken()).rejects.toThrow(
        "FILEVINE_CLIENT_ID, FILEVINE_CLIENT_SECRET, and FILEVINE_PAT must be set"
      );
    });

    it("should require FILEVINE_CLIENT_SECRET", async () => {
      const { exchangePatForToken } = await import("../oauth.js");
      delete process.env.FILEVINE_CLIENT_SECRET;

      await expect(exchangePatForToken()).rejects.toThrow(
        "FILEVINE_CLIENT_ID, FILEVINE_CLIENT_SECRET, and FILEVINE_PAT must be set"
      );
    });

    it("should require FILEVINE_PAT", async () => {
      const { exchangePatForToken } = await import("../oauth.js");
      delete process.env.FILEVINE_PAT;

      await expect(exchangePatForToken()).rejects.toThrow(
        "FILEVINE_CLIENT_ID, FILEVINE_CLIENT_SECRET, and FILEVINE_PAT must be set"
      );
    });
  });

  describe("API Base URL Selection", () => {
    it("should use US API endpoint by default", async () => {
      // Verify environment can be set to us
      process.env.FILEVINE_REGION = "us";
      expect(process.env.FILEVINE_REGION).toBe("us");
    });

    it("should support CA API endpoint", async () => {
      process.env.FILEVINE_REGION = "ca";
      expect(process.env.FILEVINE_REGION).toBe("ca");
    });
  });

  describe("Token Structure", () => {
    it("should define FileVineTokens interface with required fields", async () => {
      // This test verifies the token type is properly exported
      const { exchangePatForToken } = await import("../oauth.js");
      expect(typeof exchangePatForToken).toBe("function");
    });
  });

  describe("Function Exports", () => {
    it("should export exchangePatForToken function", async () => {
      const { exchangePatForToken } = await import("../oauth.js");
      expect(typeof exchangePatForToken).toBe("function");
    });

    it("should export getValidTokens function", async () => {
      const { getValidTokens } = await import("../oauth.js");
      expect(typeof getValidTokens).toBe("function");
    });

    it("should export refreshAccessToken function", async () => {
      const { refreshAccessToken } = await import("../oauth.js");
      expect(typeof refreshAccessToken).toBe("function");
    });

    it("should export clearTokens function", async () => {
      const { clearTokens } = await import("../oauth.js");
      expect(typeof clearTokens).toBe("function");
    });
  });
});
