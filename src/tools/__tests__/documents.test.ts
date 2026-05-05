import { describe, it, expect, beforeEach } from "@jest/globals";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDocumentTools } from "../documents.js";
import * as filevineClient from "../../filevine-client.js";
import * as tokenStore from "../../auth/token-store.js";
import * as auditLogger from "../../audit/logger.js";

jest.mock("../../filevine-client.js");
jest.mock("../../auth/token-store.js");
jest.mock("../../audit/logger.js");

describe("Document Tools", () => {
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
    it("should register list-documents tool", () => {
      registerDocumentTools(mockServer as McpServer);

      expect(registeredTools.has("list-documents")).toBe(true);
      expect(registeredTools.size).toBe(1);
    });
  });

  describe("list-documents tool", () => {
    it("should successfully list case documents with all metadata", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockDocuments = {
        items: [
          {
            id: "doc_1",
            name: "medical_records.pdf",
            file_type: "application/pdf",
            file_size: 1024000,
            url: "https://filevine.com/api/v2/documents/doc_1/download",
            created_at: "2024-05-01T10:00:00Z",
            uploaded_by: "paralegal_1",
            description: "Medical records from Dr. Johnson",
          },
          {
            id: "doc_2",
            name: "police_report.pdf",
            file_type: "application/pdf",
            file_size: 512000,
            url: "https://filevine.com/api/v2/documents/doc_2/download",
            created_at: "2024-05-02T14:30:00Z",
            uploaded_by: "attorney_1",
            description: "Police incident report",
          },
          {
            id: "doc_3",
            name: "insurance_estimate.docx",
            file_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            file_size: 256000,
            url: "https://filevine.com/api/v2/documents/doc_3/download",
            created_at: "2024-05-03T09:15:00Z",
            uploaded_by: "paralegal_1",
            description: "Insurance damage estimate",
          },
        ],
        meta: { total: 3 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockDocuments);

      registerDocumentTools(mockServer as McpServer);
      const listDocumentsTool = registeredTools.get("list-documents");
      const result = await listDocumentsTool.handler({
        case_id: "case_1",
        limit: 50,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.case_id).toBe("case_1");
      expect(content.documents).toHaveLength(3);
      expect(content.total).toBe(3);
      expect(content.note).toBeDefined();

      expect(content.documents[0].id).toBe("doc_1");
      expect(content.documents[0].name).toBe("medical_records.pdf");
      expect(content.documents[0].file_size).toBe(1024000);
      expect(content.documents[0].url).toBeDefined();

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects/case_1/documents",
        { limit: 50, page: 1 }
      );

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "list-documents",
          outcome: "success",
          user_id: "user_456",
          case_id: "case_1",
          result_count: 3,
        })
      );
    });

    it("should handle pagination with different page and limit", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockDocuments = {
        items: Array.from({ length: 20 }, (_, i) => ({
          id: `doc_${i + 21}`,
          name: `document_${i + 21}.pdf`,
          file_type: "application/pdf",
          file_size: 512000 + i * 1000,
          url: `https://filevine.com/api/v2/documents/doc_${i + 21}/download`,
          created_at: `2024-05-${String((i % 30) + 1).padStart(2, "0")}T00:00:00Z`,
          uploaded_by: "user_1",
          description: `Document ${i + 21}`,
        })),
        meta: { total: 100 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockDocuments);

      registerDocumentTools(mockServer as McpServer);
      const listDocumentsTool = registeredTools.get("list-documents");
      const result = await listDocumentsTool.handler({
        case_id: "case_1",
        limit: 20,
        page: 3,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.documents).toHaveLength(20);
      expect(content.total).toBe(100);

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects/case_1/documents",
        { limit: 20, page: 3 }
      );
    });

    it("should handle case with no documents", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockDocuments = {
        items: [],
        meta: { total: 0 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockDocuments);

      registerDocumentTools(mockServer as McpServer);
      const listDocumentsTool = registeredTools.get("list-documents");
      const result = await listDocumentsTool.handler({
        case_id: "case_1",
        limit: 50,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.documents).toHaveLength(0);
      expect(content.total).toBe(0);

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "list-documents",
          result_count: 0,
        })
      );
    });

    it("should handle various file types", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockDocuments = {
        items: [
          {
            id: "doc_pdf",
            name: "document.pdf",
            file_type: "application/pdf",
            file_size: 1024000,
            url: "https://filevine.com/api/v2/documents/doc_pdf/download",
            created_at: "2024-05-01T00:00:00Z",
            uploaded_by: "user_1",
            description: "PDF document",
          },
          {
            id: "doc_word",
            name: "document.docx",
            file_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            file_size: 256000,
            url: "https://filevine.com/api/v2/documents/doc_word/download",
            created_at: "2024-05-02T00:00:00Z",
            uploaded_by: "user_1",
            description: "Word document",
          },
          {
            id: "doc_image",
            name: "photo.jpg",
            file_type: "image/jpeg",
            file_size: 2048000,
            url: "https://filevine.com/api/v2/documents/doc_image/download",
            created_at: "2024-05-03T00:00:00Z",
            uploaded_by: "user_1",
            description: "Accident scene photo",
          },
          {
            id: "doc_excel",
            name: "spreadsheet.xlsx",
            file_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            file_size: 512000,
            url: "https://filevine.com/api/v2/documents/doc_excel/download",
            created_at: "2024-05-04T00:00:00Z",
            uploaded_by: "user_1",
            description: "Financial records",
          },
        ],
        meta: { total: 4 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockDocuments);

      registerDocumentTools(mockServer as McpServer);
      const listDocumentsTool = registeredTools.get("list-documents");
      const result = await listDocumentsTool.handler({
        case_id: "case_1",
        limit: 50,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.documents).toHaveLength(4);
      expect(content.documents[0].file_type).toBe("application/pdf");
      expect(content.documents[1].file_type).toContain("word");
      expect(content.documents[2].file_type).toBe("image/jpeg");
      expect(content.documents[3].file_type).toContain("spreadsheet");
    });

    it("should include download URLs for document access", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockDocuments = {
        items: [
          {
            id: "doc_1",
            name: "document.pdf",
            file_type: "application/pdf",
            file_size: 1024000,
            url: "https://filevine.com/api/v2/documents/doc_1/download",
            created_at: "2024-05-01T00:00:00Z",
            uploaded_by: "user_1",
            description: "Test document",
          },
        ],
        meta: { total: 1 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockDocuments);

      registerDocumentTools(mockServer as McpServer);
      const listDocumentsTool = registeredTools.get("list-documents");
      const result = await listDocumentsTool.handler({
        case_id: "case_1",
        limit: 50,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.documents[0].url).toBeDefined();
      expect(content.documents[0].url).toContain("download");
    });

    it("should handle API errors during document listing", async () => {
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

      registerDocumentTools(mockServer as McpServer);
      const listDocumentsTool = registeredTools.get("list-documents");
      const result = await listDocumentsTool.handler({
        case_id: "nonexistent_case",
        limit: 50,
        page: 1,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error listing documents");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "list-documents",
          outcome: "error",
          user_id: "user_456",
          case_id: "nonexistent_case",
          error: "Case not found",
        })
      );
    });

    it("should properly format document metadata in response", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockDocuments = {
        items: [
          {
            id: "doc_1",
            name: "test.pdf",
            file_type: "application/pdf",
            file_size: 512000,
            url: "https://filevine.com/api/v2/documents/doc_1/download",
            created_at: "2024-05-01T00:00:00Z",
            uploaded_by: "user_1",
            description: "Test",
          },
        ],
        meta: { total: 1 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockDocuments);

      registerDocumentTools(mockServer as McpServer);
      const listDocumentsTool = registeredTools.get("list-documents");
      const result = await listDocumentsTool.handler({
        case_id: "case_1",
        limit: 50,
        page: 1,
      });

      expect(result.content[0].type).toBe("text");
      const content = JSON.parse(result.content[0].text);
      expect(typeof content).toBe("object");
      expect(content.case_id).toBeDefined();
      expect(Array.isArray(content.documents)).toBe(true);
      expect(content.total).toBeDefined();
      expect(content.note).toBeDefined();
    });
  });
});
