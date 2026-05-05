import { describe, it, expect, beforeEach } from "@jest/globals";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCollectionTools } from "../collections.js";
import * as filevineClient from "../../filevine-client.js";
import * as tokenStore from "../../auth/token-store.js";
import * as auditLogger from "../../audit/logger.js";

jest.mock("../../filevine-client.js");
jest.mock("../../auth/token-store.js");
jest.mock("../../audit/logger.js");

describe("Collection Tools (Custom Data)", () => {
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
    it("should register both collection tools", () => {
      registerCollectionTools(mockServer as McpServer);

      expect(registeredTools.has("discover-schema")).toBe(true);
      expect(registeredTools.has("get-collection")).toBe(true);
      expect(registeredTools.size).toBe(2);
    });
  });

  describe("discover-schema tool", () => {
    it("should successfully discover schema with multiple project types", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockProjectTypes = {
        items: [
          { id: "pt_1", name: "Personal Injury" },
          { id: "pt_2", name: "Workers Comp" },
          { id: "pt_3", name: "Medical Malpractice" },
        ],
      };

      const mockSections1 = {
        items: [
          { id: "s_1", name: "Medical Records", selector: "MedicalRecords", type: "collection" },
          { id: "s_2", name: "Treatment Records", selector: "TreatmentRecords", type: "collection" },
        ],
      };

      const mockSections2 = {
        items: [
          { id: "s_3", name: "Employer Info", selector: "EmployerInfo", type: "collection" },
          { id: "s_4", name: "Wage Records", selector: "WageRecords", type: "collection" },
        ],
      };

      const mockSections3 = {
        items: [
          { id: "s_5", name: "Medical Expert Reports", selector: "ExpertReports", type: "collection" },
        ],
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any)
        .mockResolvedValueOnce(mockProjectTypes)
        .mockResolvedValueOnce(mockSections1)
        .mockResolvedValueOnce(mockSections2)
        .mockResolvedValueOnce(mockSections3);

      registerCollectionTools(mockServer as McpServer);
      const discoverSchemaTool = registeredTools.get("discover-schema");
      const result = await discoverSchemaTool.handler({});

      const content = JSON.parse(result.content[0].text);
      expect(content.project_types).toBe(3);
      expect(content.schema).toBeDefined();
      expect(content.instructions).toBeDefined();

      expect(content.schema["Personal Injury"]).toBeDefined();
      expect(content.schema["Personal Injury"].sections).toHaveLength(2);
      expect(content.schema["Personal Injury"].sections[0].selector).toBe("MedicalRecords");

      expect(content.schema["Workers Comp"]).toBeDefined();
      expect(content.schema["Workers Comp"].sections).toHaveLength(2);

      expect(content.schema["Medical Malpractice"]).toBeDefined();
      expect(content.schema["Medical Malpractice"].sections).toHaveLength(1);

      expect(filevineClient.filevineGet).toHaveBeenCalledWith("/v2/projectTypes");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "discover-schema",
          outcome: "success",
          user_id: "user_456",
          result_count: 3,
        })
      );
    });

    it("should handle single project type", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockProjectTypes = {
        items: [{ id: "pt_1", name: "General Litigation" }],
      };

      const mockSections = {
        items: [
          { id: "s_1", name: "Contracts", selector: "Contracts", type: "collection" },
          { id: "s_2", name: "Correspondence", selector: "Correspondence", type: "collection" },
          { id: "s_3", name: "Exhibits", selector: "Exhibits", type: "collection" },
        ],
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any)
        .mockResolvedValueOnce(mockProjectTypes)
        .mockResolvedValueOnce(mockSections);

      registerCollectionTools(mockServer as McpServer);
      const discoverSchemaTool = registeredTools.get("discover-schema");
      const result = await discoverSchemaTool.handler({});

      const content = JSON.parse(result.content[0].text);
      expect(content.project_types).toBe(1);
      expect(content.schema["General Litigation"].sections).toHaveLength(3);
    });

    it("should handle no project types", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockProjectTypes = {
        items: [],
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValueOnce(mockProjectTypes);

      registerCollectionTools(mockServer as McpServer);
      const discoverSchemaTool = registeredTools.get("discover-schema");
      const result = await discoverSchemaTool.handler({});

      const content = JSON.parse(result.content[0].text);
      expect(content.project_types).toBe(0);
      expect(Object.keys(content.schema)).toHaveLength(0);

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "discover-schema",
          result_count: 0,
        })
      );
    });

    it("should handle project type with no sections", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockProjectTypes = {
        items: [
          { id: "pt_1", name: "Simple Case" },
          { id: "pt_2", name: "Complex Case" },
        ],
      };

      const mockSections1 = {
        items: [],
      };

      const mockSections2 = {
        items: [
          { id: "s_1", name: "Evidence", selector: "Evidence", type: "collection" },
        ],
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any)
        .mockResolvedValueOnce(mockProjectTypes)
        .mockResolvedValueOnce(mockSections1)
        .mockResolvedValueOnce(mockSections2);

      registerCollectionTools(mockServer as McpServer);
      const discoverSchemaTool = registeredTools.get("discover-schema");
      const result = await discoverSchemaTool.handler({});

      const content = JSON.parse(result.content[0].text);
      expect(content.schema["Simple Case"].sections).toHaveLength(0);
      expect(content.schema["Complex Case"].sections).toHaveLength(1);
    });

    it("should handle API errors when fetching project types", async () => {
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

      registerCollectionTools(mockServer as McpServer);
      const discoverSchemaTool = registeredTools.get("discover-schema");
      const result = await discoverSchemaTool.handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error discovering schema");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "discover-schema",
          outcome: "error",
          user_id: "user_456",
          error: "API connection failed",
        })
      );
    });

    it("should handle partial section fetch failures gracefully", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockProjectTypes = {
        items: [
          { id: "pt_1", name: "Type One" },
          { id: "pt_2", name: "Type Two" },
        ],
      };

      const mockSections1 = {
        items: [
          { id: "s_1", name: "Section A", selector: "SectionA", type: "collection" },
        ],
      };

      const sectionError = new Error("Sections not available");

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any)
        .mockResolvedValueOnce(mockProjectTypes)
        .mockResolvedValueOnce(mockSections1)
        .mockRejectedValueOnce(sectionError);

      registerCollectionTools(mockServer as McpServer);
      const discoverSchemaTool = registeredTools.get("discover-schema");
      const result = await discoverSchemaTool.handler({});

      const content = JSON.parse(result.content[0].text);
      expect(content.project_types).toBe(2);
      expect(content.schema["Type One"].sections).toHaveLength(1);
      expect(content.schema["Type Two"].error).toBeDefined();
    });

    it("should properly format schema response", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockProjectTypes = {
        items: [{ id: "pt_1", name: "Case Type" }],
      };

      const mockSections = {
        items: [
          { id: "s_1", name: "Data 1", selector: "Data1", type: "collection" },
        ],
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any)
        .mockResolvedValueOnce(mockProjectTypes)
        .mockResolvedValueOnce(mockSections);

      registerCollectionTools(mockServer as McpServer);
      const discoverSchemaTool = registeredTools.get("discover-schema");
      const result = await discoverSchemaTool.handler({});

      expect(result.content[0].type).toBe("text");
      const content = JSON.parse(result.content[0].text);
      expect(typeof content).toBe("object");
      expect(content.project_types).toBeDefined();
      expect(content.schema).toBeDefined();
      expect(content.instructions).toBeDefined();
    });
  });

  describe("get-collection tool", () => {
    it("should successfully fetch collection data with items", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockCollectionData = {
        items: [
          {
            id: "med_1",
            provider: "Dr. Johnson",
            date: "2024-04-15",
            type: "Orthopedic Evaluation",
            summary: "Patient examined for shoulder injury",
          },
          {
            id: "med_2",
            provider: "Dr. Smith",
            date: "2024-04-20",
            type: "Physical Therapy",
            summary: "Initial therapy session",
          },
        ],
        total: 2,
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockCollectionData);

      registerCollectionTools(mockServer as McpServer);
      const getCollectionTool = registeredTools.get("get-collection");
      const result = await getCollectionTool.handler({
        case_id: "case_1",
        selector: "MedicalRecords",
        limit: 50,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.case_id).toBe("case_1");
      expect(content.collection).toBe("MedicalRecords");
      expect(content.data.items).toHaveLength(2);
      expect(content.data.items[0].provider).toBe("Dr. Johnson");

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects/case_1/collections/MedicalRecords",
        { limit: 50 }
      );

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "get-collection",
          outcome: "success",
          user_id: "user_456",
          case_id: "case_1",
          result_count: 2,
        })
      );
    });

    it("should fetch different collection types", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockLiensData = {
        items: [
          {
            id: "lien_1",
            creditor: "Hospital ABC",
            amount: 50000,
            date_filed: "2024-04-01",
            status: "pending",
          },
          {
            id: "lien_2",
            creditor: "Dr. Smith Medical",
            amount: 15000,
            date_filed: "2024-04-05",
            status: "satisfied",
          },
        ],
        total: 2,
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockLiensData);

      registerCollectionTools(mockServer as McpServer);
      const getCollectionTool = registeredTools.get("get-collection");
      const result = await getCollectionTool.handler({
        case_id: "case_1",
        selector: "Liens",
        limit: 50,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.collection).toBe("Liens");
      expect(content.data.items[0].creditor).toBe("Hospital ABC");
      expect(content.data.items[0].amount).toBe(50000);

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects/case_1/collections/Liens",
        { limit: 50 }
      );
    });

    it("should fetch settlements collection", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockSettlementsData = {
        items: [
          {
            id: "settle_1",
            date: "2024-03-15",
            amount: 250000,
            defendant: "Insurance Co A",
            status: "executed",
          },
        ],
        total: 1,
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockSettlementsData);

      registerCollectionTools(mockServer as McpServer);
      const getCollectionTool = registeredTools.get("get-collection");
      const result = await getCollectionTool.handler({
        case_id: "case_1",
        selector: "Settlements",
        limit: 50,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.collection).toBe("Settlements");
      expect(content.data.items[0].amount).toBe(250000);
    });

    it("should handle empty collection", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockEmptyCollection = {
        items: [],
        total: 0,
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockEmptyCollection);

      registerCollectionTools(mockServer as McpServer);
      const getCollectionTool = registeredTools.get("get-collection");
      const result = await getCollectionTool.handler({
        case_id: "case_1",
        selector: "CustomData",
        limit: 50,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.data.items).toHaveLength(0);
      expect(content.data.total).toBe(0);

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "get-collection",
          result_count: 0,
        })
      );
    });

    it("should handle custom limit parameter", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockCollectionData = {
        items: Array.from({ length: 100 }, (_, i) => ({
          id: `item_${i + 1}`,
          data: `Item ${i + 1}`,
        })),
        total: 500,
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockCollectionData);

      registerCollectionTools(mockServer as McpServer);
      const getCollectionTool = registeredTools.get("get-collection");
      const result = await getCollectionTool.handler({
        case_id: "case_1",
        selector: "CustomData",
        limit: 100,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.data.items).toHaveLength(100);
      expect(content.data.total).toBe(500);

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects/case_1/collections/CustomData",
        { limit: 100 }
      );
    });

    it("should handle invalid selector gracefully", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const error = new Error("Collection not found");
      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockRejectedValue(error);

      registerCollectionTools(mockServer as McpServer);
      const getCollectionTool = registeredTools.get("get-collection");
      const result = await getCollectionTool.handler({
        case_id: "case_1",
        selector: "InvalidSelector",
        limit: 50,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error fetching collection");
      expect(result.content[0].text).toContain("discover-schema");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "get-collection",
          outcome: "error",
          user_id: "user_456",
          case_id: "case_1",
          error: "Collection not found",
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

      const error = new Error("Access denied");
      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockRejectedValue(error);

      registerCollectionTools(mockServer as McpServer);
      const getCollectionTool = registeredTools.get("get-collection");
      const result = await getCollectionTool.handler({
        case_id: "case_1",
        selector: "MedicalRecords",
        limit: 50,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error fetching collection");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "get-collection",
          outcome: "error",
          user_id: "user_456",
          case_id: "case_1",
          error: "Access denied",
        })
      );
    });

    it("should properly format collection response", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockCollectionData = {
        items: [
          {
            id: "item_1",
            name: "Test Item",
          },
        ],
        total: 1,
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockCollectionData);

      registerCollectionTools(mockServer as McpServer);
      const getCollectionTool = registeredTools.get("get-collection");
      const result = await getCollectionTool.handler({
        case_id: "case_1",
        selector: "Data",
        limit: 50,
      });

      expect(result.content[0].type).toBe("text");
      const content = JSON.parse(result.content[0].text);
      expect(typeof content).toBe("object");
      expect(content.case_id).toBeDefined();
      expect(content.collection).toBeDefined();
      expect(content.data).toBeDefined();
    });
  });
});
