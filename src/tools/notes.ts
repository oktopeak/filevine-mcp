import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  filevineGet,
  filevinePost,
  FileVineApiError,
} from "../filevine-client.js";
import { auditLog } from "../audit/logger.js";
import { loadTokens } from "../auth/token-store.js";

export function registerNoteTools(server: McpServer): void {
  server.tool(
    "list-notes",
    "List all notes for a specific case.",
    {
      case_id: z.string().describe("The Filevine project ID"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
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
        const data = (await filevineGet(`/v2/projects/${case_id}/notes`, {
          limit,
          page,
        })) as {
          items?: Array<{
            id: string;
            content?: string;
            created_by?: string;
            created_at?: string;
            updated_at?: string;
          }>;
          meta?: { total?: number };
        };

        const notes = data?.items ?? [];
        await auditLog({
          tool: "list-notes",
          args: { case_id, limit, page },
          outcome: "success",
          user_id: tokens?.user_id,
          case_id,
          result_count: notes.length,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                case_id,
                notes: notes.map((n) => ({
                  id: n.id,
                  content: n.content,
                  created_by: n.created_by,
                  created_at: n.created_at,
                  updated_at: n.updated_at,
                })),
                total: data?.meta?.total,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = (err as Error).message;
        await auditLog({
          tool: "list-notes",
          args: { case_id, limit, page },
          outcome: "error",
          user_id: tokens?.user_id,
          case_id,
          error: msg,
        });
        return {
          content: [{ type: "text", text: `Error listing notes: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "create-note",
    "Create a new note on a case. Useful for logging AI summaries, findings, or follow-up items.",
    {
      case_id: z.string().describe("The Filevine project ID"),
      content: z
        .string()
        .describe("The note text content"),
      note_type: z
        .enum(["general", "phone_call", "internal"])
        .optional()
        .default("general")
        .describe("Type of note"),
    },
    async ({ case_id, content, note_type }) => {
      const tokens = await loadTokens();
      try {
        const data = (await filevinePost(`/v2/projects/${case_id}/notes`, {
          content,
          type: note_type,
        })) as { id?: string; created_at?: string };

        await auditLog({
          tool: "create-note",
          args: { case_id, content: content.slice(0, 100), note_type },
          outcome: "success",
          user_id: tokens?.user_id,
          case_id,
          result_count: 1,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                note_id: data?.id,
                created_at: data?.created_at,
                message: "Note created successfully",
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = (err as Error).message;
        await auditLog({
          tool: "create-note",
          args: { case_id, content: content.slice(0, 100), note_type },
          outcome: "error",
          user_id: tokens?.user_id,
          case_id,
          error: msg,
        });
        return {
          content: [{ type: "text", text: `Error creating note: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
