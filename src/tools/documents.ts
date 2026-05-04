import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { filevineGet, FileVineApiError } from "../filevine-client.js";
import { auditLog } from "../audit/logger.js";
import { loadTokens } from "../auth/token-store.js";

export function registerDocumentTools(server: McpServer): void {
  server.tool(
    "list-documents",
    "List all documents for a specific case. Returns metadata, URLs, and file info — not the binary content.",
    {
      case_id: z.string().describe("The Filevine project ID"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(50),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1),
    },
    async ({ case_id, limit, page }) => {
      const tokens = await loadTokens();
      try {
        const data = (await filevineGet(`/v2/projects/${case_id}/documents`, {
          limit,
          page,
        })) as {
          items?: Array<{
            id: string;
            name?: string;
            file_type?: string;
            file_size?: number;
            url?: string;
            created_at?: string;
            uploaded_by?: string;
            description?: string;
          }>;
          meta?: { total?: number };
        };

        const documents = data?.items ?? [];
        await auditLog({
          tool: "list-documents",
          args: { case_id, limit, page },
          outcome: "success",
          user_id: tokens?.user_id,
          case_id,
          result_count: documents.length,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                case_id,
                documents: documents.map((d) => ({
                  id: d.id,
                  name: d.name,
                  file_type: d.file_type,
                  file_size: d.file_size,
                  url: d.url,
                  created_at: d.created_at,
                  uploaded_by: d.uploaded_by,
                  description: d.description,
                })),
                total: data?.meta?.total,
                note: "URLs can be used to fetch document content. File binary content should be fetched separately.",
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = (err as Error).message;
        await auditLog({
          tool: "list-documents",
          args: { case_id, limit, page },
          outcome: "error",
          user_id: tokens?.user_id,
          case_id,
          error: msg,
        });
        return {
          content: [{ type: "text", text: `Error listing documents: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
