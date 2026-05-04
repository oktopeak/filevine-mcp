import { describe, it, expect, beforeEach } from "@jest/globals";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCaseTools } from "../cases.js";
import * as filevineClient from "../../filevine-client.js";
import * as tokenStore from "../../auth/token-store.js";
import * as auditLogger from "../../audit/logger.js";

jest.mock("../../filevine-client.js");
jest.mock("../../auth/token-store.js");
jest.mock("../../audit/logger.js");

describe("Case Tools", () => {
  let mockServer: any;
  let registeredTools: Map<string, any> = new Map();

  beforeEach(() => {
    jest.clearAllMocks();
    registeredTools.clear();

    mockServer = {
      tool: jest.fn((name: string, desc: string, params: any, handler: any) => {
        registeredTools.set(name, { desc, params, handler });
      }),
    };

    (auditLogger.auditLog as any).mockResolvedValue(undefined);
  });

  describe("Tool Registration", () => {
    it("should register both case tools", () => {
      registerCaseTools(mockServer as McpServer);

      expect(registeredTools.has("list-cases")).toBe(true);
      expect(registeredTools.has("get-case")).toBe(true);
      expect(registeredTools.size).toBe(2);
    });
  });

  describe("list-cases tool", () => {
    it("should successfully list active cases with default parameters", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockCases = {
        items: [
          {
            id: "case_1",
            name: "Smith v. Jones",
            number: "2024-001",
            status: "active",
            description: "Personal injury case",
            created_at: "2024-01-15T00:00:00Z",
            updated_at: "2024-05-04T00:00:00Z",
            client_id: "client_1",
            assigned_attorney_id: "attorney_1",
          },
          {
            id: "case_2",
            name: "Doe v. Smith",
            number: "2024-002",
            status: "active",
            description: "Contract dispute",
            created_at: "2024-02-20T00:00:00Z",
            updated_at: "2024-05-03T00:00:00Z",
            client_id: "client_2",
            assigned_attorney_id: "attorney_2",
          },
        ],
        meta: { total: 2, page: 1, per_page: 25 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockCases);

      registerCaseTools(mockServer as McpServer);
      const listCasesTool = registeredTools.get("list-cases");
      const result = await listCasesTool.handler({
        status: "active",
        limit: 25,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.cases).toHaveLength(2);
      expect(content.cases[0].id).toBe("case_1");
      expect(content.cases[0].name).toBe("Smith v. Jones");
      expect(content.total).toBe(2);
      expect(content.page).toBe(1);

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects",
        expect.objectContaining({ limit: 25, page: 1, status: "active" })
      );

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "list-cases",
          outcome: "success",
          user_id: "user_456",
          result_count: 2,
        })
      );
    });

    it("should filter cases by status", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockCases = {
        items: [
          {
            id: "case_3",
            name: "Closed Case",
            number: "2023-001",
            status: "closed",
            description: "Resolved",
            created_at: "2023-01-15T00:00:00Z",
            updated_at: "2024-01-15T00:00:00Z",
            client_id: "client_3",
            assigned_attorney_id: "attorney_3",
          },
        ],
        meta: { total: 1, page: 1, per_page: 25 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockCases);

      registerCaseTools(mockServer as McpServer);
      const listCasesTool = registeredTools.get("list-cases");
      const result = await listCasesTool.handler({
        status: "closed",
        limit: 25,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.cases).toHaveLength(1);
      expect(content.cases[0].status).toBe("closed");

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects",
        expect.objectContaining({ status: "closed", limit: 25, page: 1 })
      );
    });

    it("should filter cases by search term", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockCases = {
        items: [
          {
            id: "case_1",
            name: "Smith v. Jones",
            number: "2024-001",
            status: "active",
            description: "Personal injury",
            created_at: "2024-01-15T00:00:00Z",
            updated_at: "2024-05-04T00:00:00Z",
            client_id: "client_1",
            assigned_attorney_id: "attorney_1",
          },
        ],
        meta: { total: 1, page: 1, per_page: 25 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockCases);

      registerCaseTools(mockServer as McpServer);
      const listCasesTool = registeredTools.get("list-cases");
      const result = await listCasesTool.handler({
        status: "active",
        search: "Smith",
        limit: 25,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.cases).toHaveLength(1);
      expect(content.cases[0].name).toContain("Smith");

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects",
        expect.objectContaining({
          search: "Smith",
          status: "active",
          limit: 25,
          page: 1,
        })
      );
    });

    it("should handle pagination", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockCases = {
        items: [
          {
            id: "case_26",
            name: "Page Two Case",
            number: "2024-026",
            status: "active",
            description: "Second page",
            created_at: "2024-05-01T00:00:00Z",
            updated_at: "2024-05-04T00:00:00Z",
            client_id: "client_26",
            assigned_attorney_id: "attorney_26",
          },
        ],
        meta: { total: 50, page: 2, per_page: 25 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockCases);

      registerCaseTools(mockServer as McpServer);
      const listCasesTool = registeredTools.get("list-cases");
      const result = await listCasesTool.handler({
        status: "active",
        limit: 25,
        page: 2,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.page).toBe(2);
      expect(content.total).toBe(50);

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects",
        expect.objectContaining({ page: 2, limit: 25 })
      );
    });

    it("should not include status in params when status is 'all'", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockCases = {
        items: [],
        meta: { total: 0, page: 1, per_page: 25 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockCases);

      registerCaseTools(mockServer as McpServer);
      const listCasesTool = registeredTools.get("list-cases");
      await listCasesTool.handler({
        status: "all",
        limit: 25,
        page: 1,
      });

      const callArgs = (filevineClient.filevineGet as any).mock.calls[0][1];
      expect(callArgs.status).toBeUndefined();
    });

    it("should handle API errors gracefully", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const error = new Error("API request failed");
      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockRejectedValue(error);

      registerCaseTools(mockServer as McpServer);
      const listCasesTool = registeredTools.get("list-cases");
      const result = await listCasesTool.handler({
        status: "active",
        limit: 25,
        page: 1,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error listing cases");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "list-cases",
          outcome: "error",
          user_id: "user_456",
          error: "API request failed",
        })
      );
    });

    it("should handle empty results", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockCases = {
        items: [],
        meta: { total: 0, page: 1, per_page: 25 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockCases);

      registerCaseTools(mockServer as McpServer);
      const listCasesTool = registeredTools.get("list-cases");
      const result = await listCasesTool.handler({
        status: "active",
        limit: 25,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.cases).toHaveLength(0);
      expect(content.total).toBe(0);

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "list-cases",
          result_count: 0,
        })
      );
    });
  });

  describe("get-case tool", () => {
    it("should successfully get case details by ID", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockCaseData = {
        id: "case_1",
        name: "Smith v. Jones",
        number: "2024-001",
        status: "active",
        description: "Personal injury case",
        created_at: "2024-01-15T00:00:00Z",
        updated_at: "2024-05-04T00:00:00Z",
        client_id: "client_1",
        assigned_attorney_id: "attorney_1",
        notes: "Important case details",
        tags: ["injury", "auto-accident"],
        custom_fields: {
          settlement_range: "$500K - $1M",
          litigation_status: "pre-discovery",
        },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockCaseData);

      registerCaseTools(mockServer as McpServer);
      const getCaseTool = registeredTools.get("get-case");
      const result = await getCaseTool.handler({ case_id: "case_1" });

      const content = JSON.parse(result.content[0].text);
      expect(content.id).toBe("case_1");
      expect(content.name).toBe("Smith v. Jones");
      expect(content.custom_fields).toBeDefined();
      expect(content.custom_fields.settlement_range).toBe("$500K - $1M");

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects/case_1"
      );

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "get-case",
          outcome: "success",
          user_id: "user_456",
          case_id: "case_1",
          result_count: 1,
        })
      );
    });

    it("should handle missing case ID gracefully", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const error = new Error("Case not found");
      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockRejectedValue(error);

      registerCaseTools(mockServer as McpServer);
      const getCaseTool = registeredTools.get("get-case");
      const result = await getCaseTool.handler({ case_id: "nonexistent_case" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error fetching case");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "get-case",
          outcome: "error",
          user_id: "user_456",
          case_id: "nonexistent_case",
          error: "Case not found",
        })
      );
    });

    it("should handle API errors gracefully", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const error = new Error("API connection failed");
      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockRejectedValue(error);

      registerCaseTools(mockServer as McpServer);
      const getCaseTool = registeredTools.get("get-case");
      const result = await getCaseTool.handler({ case_id: "case_1" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error fetching case");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "get-case",
          outcome: "error",
          user_id: "user_456",
          error: "API connection failed",
        })
      );
    });

    it("should properly format case data in response", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockCaseData = {
        id: "case_2",
        name: "Complex Case",
        number: "2024-002",
        status: "pending",
        description: "Multi-party litigation",
        created_at: "2024-02-20T00:00:00Z",
        updated_at: "2024-05-04T00:00:00Z",
        client_id: "client_2",
        assigned_attorney_id: "attorney_2",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockCaseData);

      registerCaseTools(mockServer as McpServer);
      const getCaseTool = registeredTools.get("get-case");
      const result = await getCaseTool.handler({ case_id: "case_2" });

      expect(result.content[0].type).toBe("text");
      const content = JSON.parse(result.content[0].text);
      expect(typeof content).toBe("object");
      expect(content.id).toBeDefined();
      expect(content.name).toBeDefined();
    });
  });
});
