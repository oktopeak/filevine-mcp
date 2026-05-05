import { describe, it, expect, beforeEach } from "@jest/globals";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerNoteTools } from "../notes.js";
import * as filevineClient from "../../filevine-client.js";
import * as tokenStore from "../../auth/token-store.js";
import * as auditLogger from "../../audit/logger.js";

jest.mock("../../filevine-client.js");
jest.mock("../../auth/token-store.js");
jest.mock("../../audit/logger.js");

describe("Note Tools", () => {
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
    it("should register both note tools", () => {
      registerNoteTools(mockServer as McpServer);

      expect(registeredTools.has("list-notes")).toBe(true);
      expect(registeredTools.has("create-note")).toBe(true);
      expect(registeredTools.size).toBe(2);
    });
  });

  describe("list-notes tool", () => {
    it("should successfully list case notes with pagination", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockNotes = {
        items: [
          {
            id: "note_1",
            content: "Initial client consultation completed. Client seems confident about settlement.",
            created_by: "attorney_1",
            created_at: "2024-05-01T10:00:00Z",
            updated_at: "2024-05-01T10:00:00Z",
          },
          {
            id: "note_2",
            content: "Received medical records from Dr. Johnson. Reviewing damages.",
            created_by: "paralegal_1",
            created_at: "2024-05-02T14:30:00Z",
            updated_at: "2024-05-02T14:30:00Z",
          },
          {
            id: "note_3",
            content: "Follow up needed on property damage estimate.",
            created_by: "attorney_1",
            created_at: "2024-05-03T09:15:00Z",
            updated_at: "2024-05-03T09:15:00Z",
          },
        ],
        meta: { total: 3 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockNotes);

      registerNoteTools(mockServer as McpServer);
      const listNotesTool = registeredTools.get("list-notes");
      const result = await listNotesTool.handler({
        case_id: "case_1",
        limit: 50,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.case_id).toBe("case_1");
      expect(content.notes).toHaveLength(3);
      expect(content.total).toBe(3);
      expect(content.notes[0].id).toBe("note_1");
      expect(content.notes[0].content).toContain("Initial client consultation");
      expect(content.notes[1].created_by).toBe("paralegal_1");

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects/case_1/notes",
        { limit: 50, page: 1 }
      );

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "list-notes",
          outcome: "success",
          user_id: "user_456",
          case_id: "case_1",
          result_count: 3,
        })
      );
    });

    it("should handle pagination with custom limit", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockNotes = {
        items: Array.from({ length: 10 }, (_, i) => ({
          id: `note_${i + 1}`,
          content: `Note ${i + 1}`,
          created_by: `user_${i}`,
          created_at: `2024-05-0${Math.ceil((i + 1) / 3)}T00:00:00Z`,
          updated_at: `2024-05-0${Math.ceil((i + 1) / 3)}T00:00:00Z`,
        })),
        meta: { total: 25 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockNotes);

      registerNoteTools(mockServer as McpServer);
      const listNotesTool = registeredTools.get("list-notes");
      const result = await listNotesTool.handler({
        case_id: "case_1",
        limit: 10,
        page: 2,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.notes).toHaveLength(10);
      expect(content.total).toBe(25);

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects/case_1/notes",
        { limit: 10, page: 2 }
      );
    });

    it("should handle case with no notes", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockNotes = {
        items: [],
        meta: { total: 0 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockNotes);

      registerNoteTools(mockServer as McpServer);
      const listNotesTool = registeredTools.get("list-notes");
      const result = await listNotesTool.handler({
        case_id: "case_1",
        limit: 50,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.notes).toHaveLength(0);
      expect(content.total).toBe(0);

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "list-notes",
          result_count: 0,
        })
      );
    });

    it("should handle API errors during note listing", async () => {
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

      registerNoteTools(mockServer as McpServer);
      const listNotesTool = registeredTools.get("list-notes");
      const result = await listNotesTool.handler({
        case_id: "nonexistent_case",
        limit: 50,
        page: 1,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error listing notes");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "list-notes",
          outcome: "error",
          user_id: "user_456",
          case_id: "nonexistent_case",
          error: "Case not found",
        })
      );
    });

    it("should properly format notes in response", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockNotes = {
        items: [
          {
            id: "note_1",
            content: "Test note",
            created_by: "user_1",
            created_at: "2024-05-01T00:00:00Z",
            updated_at: "2024-05-01T00:00:00Z",
          },
        ],
        meta: { total: 1 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockNotes);

      registerNoteTools(mockServer as McpServer);
      const listNotesTool = registeredTools.get("list-notes");
      const result = await listNotesTool.handler({
        case_id: "case_1",
        limit: 50,
        page: 1,
      });

      expect(result.content[0].type).toBe("text");
      const content = JSON.parse(result.content[0].text);
      expect(typeof content).toBe("object");
      expect(content.case_id).toBeDefined();
      expect(Array.isArray(content.notes)).toBe(true);
      expect(content.total).toBeDefined();
    });
  });

  describe("create-note tool", () => {
    it("should successfully create a general note", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockResponse = {
        id: "note_new_1",
        created_at: "2024-05-04T15:30:00Z",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevinePost as any).mockResolvedValue(mockResponse);

      registerNoteTools(mockServer as McpServer);
      const createNoteTool = registeredTools.get("create-note");
      const result = await createNoteTool.handler({
        case_id: "case_1",
        content: "AI analysis: High likelihood of settlement within 2-3 weeks based on recent developments.",
        note_type: "general",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.note_id).toBe("note_new_1");
      expect(content.created_at).toBe("2024-05-04T15:30:00Z");
      expect(content.message).toContain("successfully");

      expect(filevineClient.filevinePost).toHaveBeenCalledWith(
        "/v2/projects/case_1/notes",
        expect.objectContaining({
          content: "AI analysis: High likelihood of settlement within 2-3 weeks based on recent developments.",
          type: "general",
        })
      );

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "create-note",
          outcome: "success",
          user_id: "user_456",
          case_id: "case_1",
          result_count: 1,
        })
      );
    });

    it("should create phone call note with correct type", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockResponse = {
        id: "note_phone_1",
        created_at: "2024-05-04T14:00:00Z",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevinePost as any).mockResolvedValue(mockResponse);

      registerNoteTools(mockServer as McpServer);
      const createNoteTool = registeredTools.get("create-note");
      const result = await createNoteTool.handler({
        case_id: "case_1",
        content: "Called client. Discussed settlement offer. Client wants to review with spouse.",
        note_type: "phone_call",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.note_id).toBe("note_phone_1");

      expect(filevineClient.filevinePost).toHaveBeenCalledWith(
        "/v2/projects/case_1/notes",
        expect.objectContaining({
          type: "phone_call",
        })
      );
    });

    it("should create internal note with correct type", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockResponse = {
        id: "note_internal_1",
        created_at: "2024-05-04T13:00:00Z",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevinePost as any).mockResolvedValue(mockResponse);

      registerNoteTools(mockServer as McpServer);
      const createNoteTool = registeredTools.get("create-note");
      const result = await createNoteTool.handler({
        case_id: "case_1",
        content: "Internal: Need to request additional medical records from Dr. Johnson's office.",
        note_type: "internal",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);

      expect(filevineClient.filevinePost).toHaveBeenCalledWith(
        "/v2/projects/case_1/notes",
        expect.objectContaining({
          type: "internal",
        })
      );
    });

    it("should create note with minimal required parameters", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockResponse = {
        id: "note_minimal_1",
        created_at: "2024-05-04T12:00:00Z",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevinePost as any).mockResolvedValue(mockResponse);

      registerNoteTools(mockServer as McpServer);
      const createNoteTool = registeredTools.get("create-note");
      const result = await createNoteTool.handler({
        case_id: "case_1",
        content: "Minimal note",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.note_id).toBe("note_minimal_1");

      expect(filevineClient.filevinePost).toHaveBeenCalledWith(
        "/v2/projects/case_1/notes",
        expect.objectContaining({
          content: "Minimal note",
        })
      );
    });

    it("should handle long note content and truncate for audit logging", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const longContent =
        "This is a very long note that contains detailed analysis of the case. It includes multiple paragraphs of information about the case status, witness interviews, discovery documents, and legal strategy. The note is designed to be comprehensive and detailed for the case file.";

      const mockResponse = {
        id: "note_long_1",
        created_at: "2024-05-04T11:00:00Z",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevinePost as any).mockResolvedValue(mockResponse);

      registerNoteTools(mockServer as McpServer);
      const createNoteTool = registeredTools.get("create-note");
      const result = await createNoteTool.handler({
        case_id: "case_1",
        content: longContent,
        note_type: "general",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);

      // Verify that audit log truncates content to first 100 chars
      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "create-note",
          args: expect.objectContaining({
            content: longContent.slice(0, 100),
          }),
        })
      );
    });

    it("should handle API errors during note creation", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const error = new Error("Invalid case ID");
      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevinePost as any).mockRejectedValue(error);

      registerNoteTools(mockServer as McpServer);
      const createNoteTool = registeredTools.get("create-note");
      const result = await createNoteTool.handler({
        case_id: "invalid_case",
        content: "Test note",
        note_type: "general",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error creating note");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "create-note",
          outcome: "error",
          user_id: "user_456",
          case_id: "invalid_case",
          error: "Invalid case ID",
        })
      );
    });

    it("should properly format success response", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockResponse = {
        id: "note_format_1",
        created_at: "2024-05-04T10:00:00Z",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevinePost as any).mockResolvedValue(mockResponse);

      registerNoteTools(mockServer as McpServer);
      const createNoteTool = registeredTools.get("create-note");
      const result = await createNoteTool.handler({
        case_id: "case_1",
        content: "Formatted note",
        note_type: "general",
      });

      expect(result.content[0].type).toBe("text");
      const content = JSON.parse(result.content[0].text);
      expect(typeof content).toBe("object");
      expect(content.success).toBe(true);
      expect(content.note_id).toBeDefined();
      expect(content.created_at).toBeDefined();
      expect(content.message).toBeDefined();
    });
  });
});
