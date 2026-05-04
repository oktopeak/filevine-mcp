import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { filevineGet, FileVineApiError } from "../filevine-client.js";
import { auditLog } from "../audit/logger.js";
import { loadTokens } from "../auth/token-store.js";

export function registerCaseTools(server: McpServer): void {
  server.tool(
    "list-cases",
    "List cases (projects) from Filevine, optionally filtered by status or search term.",
    {
      status: z
        .enum(["active", "closed", "pending", "all"])
        .optional()
        .default("active")
        .describe('Filter by case status. Defaults to "active".'),
      search: z
        .string()
        .optional()
        .describe("Search case name or number"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(25)
        .describe("Number of cases to return"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number for pagination"),
    },
    async ({ status, search, limit, page }) => {
      const tokens = await loadTokens();
      try {
        const params: Record<string, string | number | undefined> = {
          limit,
          page,
        };
        if (status && status !== "all") params.status = status;
        if (search) params.search = search;

        const data = (await filevineGet("/v2/projects", params)) as {
          items?: Array<{
            id: string;
            name?: string;
            number?: string;
            status?: string;
            description?: string;
            created_at?: string;
            updated_at?: string;
            client_id?: string;
            assigned_attorney_id?: string;
          }>;
          meta?: { total?: number; page?: number; per_page?: number };
        };

        const cases = data?.items ?? [];
        await auditLog({
          tool: "list-cases",
          args: { status, search, limit, page },
          outcome: "success",
          user_id: tokens?.user_id,
          result_count: cases.length,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                cases: cases.map((c) => ({
                  id: c.id,
                  name: c.name,
                  number: c.number,
                  status: c.status,
                  description: c.description,
                  created_at: c.created_at,
                  updated_at: c.updated_at,
                  client_id: c.client_id,
                  assigned_attorney_id: c.assigned_attorney_id,
                })),
                total: data?.meta?.total,
                page: data?.meta?.page,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = (err as Error).message;
        await auditLog({
          tool: "list-cases",
          args: { status, search, limit, page },
          outcome: "error",
          user_id: tokens?.user_id,
          error: msg,
        });
        return {
          content: [{ type: "text", text: `Error listing cases: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get-case",
    "Get detailed information about a specific case (project) by ID.",
    {
      case_id: z.string().describe("The Filevine project ID"),
    },
    async ({ case_id }) => {
      const tokens = await loadTokens();
      try {
        const data = (await filevineGet(`/v2/projects/${case_id}`)) as Record<
          string,
          unknown
        >;

        await auditLog({
          tool: "get-case",
          args: { case_id },
          outcome: "success",
          user_id: tokens?.user_id,
          case_id,
          result_count: 1,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = (err as Error).message;
        await auditLog({
          tool: "get-case",
          args: { case_id },
          outcome: "error",
          user_id: tokens?.user_id,
          case_id,
          error: msg,
        });
        return {
          content: [{ type: "text", text: `Error fetching case: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
