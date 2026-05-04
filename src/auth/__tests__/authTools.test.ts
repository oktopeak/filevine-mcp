import { describe, it, expect, beforeEach } from "@jest/globals";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAuthTools } from "../authTools.js";
import * as tokenStore from "../token-store.js";
import * as oauth from "../oauth.js";
import * as auditLogger from "../../audit/logger.js";
import type { FileVineTokens } from "../oauth.js";

// Mock dependencies
jest.mock("../token-store.js");
jest.mock("../oauth.js");
jest.mock("../../audit/logger.js");

describe("Auth Tools", () => {
  let mockServer: any;
  let registeredTools: Map<string, any> = new Map();

  beforeEach(() => {
    jest.clearAllMocks();
    registeredTools.clear();

    // Mock McpServer
    mockServer = {
      tool: jest.fn((name: string, desc: string, params: any, handler: any) => {
        registeredTools.set(name, { desc, params, handler });
      }),
    };

    (auditLogger.auditLog as any).mockResolvedValue(undefined);
  });

  describe("Tool Registration", () => {
    it("should register all three auth tools", () => {
      registerAuthTools(mockServer as McpServer);

      expect(registeredTools.has("authenticate")).toBe(true);
      expect(registeredTools.has("auth-status")).toBe(true);
      expect(registeredTools.has("logout")).toBe(true);
      expect(registeredTools.size).toBe(3);
    });
  });

  describe("authenticate tool", () => {
    it("should successfully authenticate and return user/org info", async () => {
      const mockTokens: FileVineTokens = {
        access_token: "new_token",
        refresh_token: "new_refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      (oauth.exchangePatForToken as any).mockResolvedValue(mockTokens);

      registerAuthTools(mockServer as McpServer);
      const authenticateTool = registeredTools.get("authenticate");
      const result = await authenticateTool.handler({});

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.user_id).toBe("user_456");
      expect(content.org_id).toBe("org_123");
      expect(content.message).toContain("Successfully authenticated");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "authenticate",
          outcome: "success",
          user_id: "user_456",
        })
      );
    });

    it("should handle authentication errors gracefully", async () => {
      const error = new Error("Invalid credentials");
      (oauth.exchangePatForToken as any).mockRejectedValue(error);

      registerAuthTools(mockServer as McpServer);
      const authenticateTool = registeredTools.get("authenticate");
      const result = await authenticateTool.handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Authentication failed");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "authenticate",
          outcome: "error",
          error: "Invalid credentials",
        })
      );
    });
  });

  describe("auth-status tool", () => {
    it("should return authenticated status with token expiry", async () => {
      const mockTokens: FileVineTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);

      registerAuthTools(mockServer as McpServer);
      const statusTool = registeredTools.get("auth-status");
      const result = await statusTool.handler({});

      const content = JSON.parse(result.content[0].text);
      expect(content.authenticated).toBe(true);
      expect(content.user_id).toBe("user_456");
      expect(content.org_id).toBe("org_123");
      expect(content.expires_at).toBeDefined();
      expect(content.is_expired).toBe(false);

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "auth-status",
          outcome: "success",
          result_count: 1,
        })
      );
    });

    it("should return not authenticated when no tokens exist", async () => {
      (tokenStore.loadTokens as any).mockResolvedValue(null);

      registerAuthTools(mockServer as McpServer);
      const statusTool = registeredTools.get("auth-status");
      const result = await statusTool.handler({});

      const content = JSON.parse(result.content[0].text);
      expect(content.authenticated).toBe(false);
      expect(content.message).toContain("Not authenticated");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "auth-status",
          outcome: "success",
          result_count: 0,
        })
      );
    });

    it("should indicate when token is expired", async () => {
      const mockTokens: FileVineTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() - 1000, // Already expired
        org_id: "org_123",
        user_id: "user_456",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);

      registerAuthTools(mockServer as McpServer);
      const statusTool = registeredTools.get("auth-status");
      const result = await statusTool.handler({});

      const content = JSON.parse(result.content[0].text);
      expect(content.is_expired).toBe(true);
    });

    it("should handle errors gracefully", async () => {
      (tokenStore.loadTokens as any).mockRejectedValue(
        new Error("File read error")
      );

      registerAuthTools(mockServer as McpServer);
      const statusTool = registeredTools.get("auth-status");
      const result = await statusTool.handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error checking auth status");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "auth-status",
          outcome: "error",
        })
      );
    });
  });

  describe("logout tool", () => {
    it("should clear tokens and log out successfully", async () => {
      const mockTokens: FileVineTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (tokenStore.clearTokens as any).mockResolvedValue(undefined);

      registerAuthTools(mockServer as McpServer);
      const logoutTool = registeredTools.get("logout");
      const result = await logoutTool.handler({});

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.message).toContain("Logged out");

      expect(tokenStore.clearTokens).toHaveBeenCalled();
      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "logout",
          outcome: "success",
          user_id: "user_456",
          result_count: 0,
        })
      );
    });

    it("should handle logout when tokens don't exist", async () => {
      (tokenStore.loadTokens as any).mockResolvedValue(null);
      (tokenStore.clearTokens as any).mockResolvedValue(undefined);

      registerAuthTools(mockServer as McpServer);
      const logoutTool = registeredTools.get("logout");
      const result = await logoutTool.handler({});

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);

      expect(tokenStore.clearTokens).toHaveBeenCalled();
    });

    it("should handle logout errors gracefully", async () => {
      (tokenStore.loadTokens as any).mockResolvedValue(null);
      (tokenStore.clearTokens as any).mockRejectedValue(
        new Error("Permission denied")
      );

      registerAuthTools(mockServer as McpServer);
      const logoutTool = registeredTools.get("logout");
      const result = await logoutTool.handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Logout failed");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "logout",
          outcome: "error",
          error: "Permission denied",
        })
      );
    });
  });
});
