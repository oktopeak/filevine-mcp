import { describe, it, expect, beforeEach } from "@jest/globals";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerContactTools } from "../contacts.js";
import * as filevineClient from "../../filevine-client.js";
import * as tokenStore from "../../auth/token-store.js";
import * as auditLogger from "../../audit/logger.js";

jest.mock("../../filevine-client.js");
jest.mock("../../auth/token-store.js");
jest.mock("../../audit/logger.js");

describe("Contact Tools", () => {
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
    it("should register all three contact tools", () => {
      registerContactTools(mockServer as McpServer);

      expect(registeredTools.has("search-contacts")).toBe(true);
      expect(registeredTools.has("get-contact")).toBe(true);
      expect(registeredTools.has("list-case-contacts")).toBe(true);
      expect(registeredTools.size).toBe(3);
    });
  });

  describe("search-contacts tool", () => {
    it("should successfully search contacts by name", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockContacts = {
        items: [
          {
            id: "contact_1",
            name: "John Smith",
            email: "john@example.com",
            phone: "555-1234",
            person_type: "individual",
          },
          {
            id: "contact_2",
            name: "Jane Smith",
            email: "jane@example.com",
            phone: "555-5678",
            person_type: "individual",
          },
        ],
        meta: { total: 2 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockContacts);

      registerContactTools(mockServer as McpServer);
      const searchContactsTool = registeredTools.get("search-contacts");
      const result = await searchContactsTool.handler({
        search: "Smith",
        limit: 25,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.contacts).toHaveLength(2);
      expect(content.contacts[0].name).toContain("Smith");
      expect(content.total).toBe(2);

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/contacts",
        expect.objectContaining({ search: "Smith", limit: 25, page: 1 })
      );

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "search-contacts",
          outcome: "success",
          user_id: "user_456",
          result_count: 2,
        })
      );
    });

    it("should search contacts by email", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockContacts = {
        items: [
          {
            id: "contact_3",
            name: "Bob Johnson",
            email: "bob@company.com",
            phone: "555-9999",
            person_type: "individual",
          },
        ],
        meta: { total: 1 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockContacts);

      registerContactTools(mockServer as McpServer);
      const searchContactsTool = registeredTools.get("search-contacts");
      const result = await searchContactsTool.handler({
        search: "bob@company.com",
        limit: 25,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.contacts[0].email).toBe("bob@company.com");

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/contacts",
        expect.objectContaining({ search: "bob@company.com" })
      );
    });

    it("should search contacts by phone", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockContacts = {
        items: [
          {
            id: "contact_4",
            name: "Alice Brown",
            email: "alice@example.com",
            phone: "555-1111",
            person_type: "individual",
          },
        ],
        meta: { total: 1 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockContacts);

      registerContactTools(mockServer as McpServer);
      const searchContactsTool = registeredTools.get("search-contacts");
      const result = await searchContactsTool.handler({
        search: "555-1111",
        limit: 25,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.contacts[0].phone).toBe("555-1111");
    });

    it("should handle pagination", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockContacts = {
        items: Array.from({ length: 25 }, (_, i) => ({
          id: `contact_${i + 26}`,
          name: `Contact ${i + 26}`,
          email: `contact${i + 26}@example.com`,
          phone: `555-${String(i).padStart(4, "0")}`,
          person_type: "individual",
        })),
        meta: { total: 50 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockContacts);

      registerContactTools(mockServer as McpServer);
      const searchContactsTool = registeredTools.get("search-contacts");
      const result = await searchContactsTool.handler({
        search: "Contact",
        limit: 25,
        page: 2,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.contacts).toHaveLength(25);
      expect(content.total).toBe(50);

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/contacts",
        expect.objectContaining({ page: 2, limit: 25 })
      );
    });

    it("should handle empty search results", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockContacts = {
        items: [],
        meta: { total: 0 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockContacts);

      registerContactTools(mockServer as McpServer);
      const searchContactsTool = registeredTools.get("search-contacts");
      const result = await searchContactsTool.handler({
        search: "nonexistent",
        limit: 25,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.contacts).toHaveLength(0);
      expect(content.total).toBe(0);

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "search-contacts",
          result_count: 0,
        })
      );
    });

    it("should handle API errors during search", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const error = new Error("API connection timeout");
      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockRejectedValue(error);

      registerContactTools(mockServer as McpServer);
      const searchContactsTool = registeredTools.get("search-contacts");
      const result = await searchContactsTool.handler({
        search: "Smith",
        limit: 25,
        page: 1,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error searching contacts");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "search-contacts",
          outcome: "error",
          error: "API connection timeout",
        })
      );
    });
  });

  describe("get-contact tool", () => {
    it("should successfully get contact details by ID", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockContactData = {
        id: "contact_1",
        name: "John Smith",
        email: "john@example.com",
        phone: "555-1234",
        person_type: "individual",
        address: "123 Main St",
        city: "Springfield",
        state: "IL",
        zip: "62701",
        date_of_birth: "1980-01-15",
        ssn_last_four: "5678",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockContactData);

      registerContactTools(mockServer as McpServer);
      const getContactTool = registeredTools.get("get-contact");
      const result = await getContactTool.handler({ contact_id: "contact_1" });

      const content = JSON.parse(result.content[0].text);
      expect(content.id).toBe("contact_1");
      expect(content.name).toBe("John Smith");
      expect(content.email).toBe("john@example.com");
      expect(content.address).toBe("123 Main St");
      expect(content.state).toBe("IL");

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/contacts/contact_1"
      );

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "get-contact",
          outcome: "success",
          user_id: "user_456",
          result_count: 1,
        })
      );
    });

    it("should handle missing contact ID gracefully", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const error = new Error("Contact not found");
      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockRejectedValue(error);

      registerContactTools(mockServer as McpServer);
      const getContactTool = registeredTools.get("get-contact");
      const result = await getContactTool.handler({
        contact_id: "nonexistent_contact",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error fetching contact");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "get-contact",
          outcome: "error",
          error: "Contact not found",
        })
      );
    });

    it("should handle API errors during retrieval", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const error = new Error("Unauthorized");
      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockRejectedValue(error);

      registerContactTools(mockServer as McpServer);
      const getContactTool = registeredTools.get("get-contact");
      const result = await getContactTool.handler({ contact_id: "contact_1" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error fetching contact");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "get-contact",
          outcome: "error",
          user_id: "user_456",
          error: "Unauthorized",
        })
      );
    });

    it("should properly format contact data in response", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockContactData = {
        id: "contact_2",
        name: "Jane Smith",
        email: "jane@example.com",
        phone: "555-5678",
        person_type: "business",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockContactData);

      registerContactTools(mockServer as McpServer);
      const getContactTool = registeredTools.get("get-contact");
      const result = await getContactTool.handler({ contact_id: "contact_2" });

      expect(result.content[0].type).toBe("text");
      const content = JSON.parse(result.content[0].text);
      expect(typeof content).toBe("object");
      expect(content.id).toBeDefined();
      expect(content.name).toBeDefined();
    });
  });

  describe("list-case-contacts tool", () => {
    it("should successfully list case contacts", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockContacts = {
        items: [
          {
            id: "contact_1",
            name: "John Smith",
            email: "john@example.com",
            phone: "555-1234",
            person_type: "individual",
            role: "plaintiff",
          },
          {
            id: "contact_2",
            name: "Jane Smith",
            email: "jane@example.com",
            phone: "555-5678",
            person_type: "individual",
            role: "witness",
          },
          {
            id: "contact_3",
            name: "Insurance Co",
            email: "claims@insurance.com",
            phone: "555-9999",
            person_type: "business",
            role: "defendant",
          },
        ],
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockContacts);

      registerContactTools(mockServer as McpServer);
      const listCaseContactsTool = registeredTools.get("list-case-contacts");
      const result = await listCaseContactsTool.handler({
        case_id: "case_1",
        limit: 50,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.case_id).toBe("case_1");
      expect(content.contacts).toHaveLength(3);
      expect(content.count).toBe(3);
      expect(content.contacts[0].role).toBe("plaintiff");
      expect(content.contacts[1].role).toBe("witness");
      expect(content.contacts[2].role).toBe("defendant");

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects/case_1/contacts",
        { limit: 50 }
      );

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "list-case-contacts",
          outcome: "success",
          user_id: "user_456",
          case_id: "case_1",
          result_count: 3,
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

      const mockContacts = {
        items: [
          {
            id: "contact_1",
            name: "John Smith",
            email: "john@example.com",
            phone: "555-1234",
            person_type: "individual",
            role: "plaintiff",
          },
        ],
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockContacts);

      registerContactTools(mockServer as McpServer);
      const listCaseContactsTool = registeredTools.get("list-case-contacts");
      await listCaseContactsTool.handler({ case_id: "case_1", limit: 100 });

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects/case_1/contacts",
        { limit: 100 }
      );
    });

    it("should handle case with no contacts", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockContacts = {
        items: [],
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockContacts);

      registerContactTools(mockServer as McpServer);
      const listCaseContactsTool = registeredTools.get("list-case-contacts");
      const result = await listCaseContactsTool.handler({
        case_id: "case_1",
        limit: 50,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.contacts).toHaveLength(0);
      expect(content.count).toBe(0);

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "list-case-contacts",
          result_count: 0,
        })
      );
    });

    it("should handle API errors during case contact listing", async () => {
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

      registerContactTools(mockServer as McpServer);
      const listCaseContactsTool = registeredTools.get("list-case-contacts");
      const result = await listCaseContactsTool.handler({
        case_id: "nonexistent_case",
        limit: 50,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error listing case contacts");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "list-case-contacts",
          outcome: "error",
          user_id: "user_456",
          case_id: "nonexistent_case",
          error: "Case not found",
        })
      );
    });

    it("should properly format case contacts in response", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockContacts = {
        items: [
          {
            id: "contact_1",
            name: "Attorney Johnson",
            email: "attorney@firm.com",
            phone: "555-1234",
            person_type: "individual",
            role: "counsel",
          },
        ],
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockContacts);

      registerContactTools(mockServer as McpServer);
      const listCaseContactsTool = registeredTools.get("list-case-contacts");
      const result = await listCaseContactsTool.handler({
        case_id: "case_1",
        limit: 50,
      });

      expect(result.content[0].type).toBe("text");
      const content = JSON.parse(result.content[0].text);
      expect(typeof content).toBe("object");
      expect(content.case_id).toBeDefined();
      expect(Array.isArray(content.contacts)).toBe(true);
      expect(content.count).toBeDefined();
    });
  });
});
