import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { filevineGet, FileVineApiError } from "../filevine-client.js";
import { auditLog } from "../audit/logger.js";
import { loadTokens } from "../auth/token-store.js";

export function registerCollectionTools(server: McpServer): void {
  server.tool(
    "discover-schema",
    "Discover the firm's custom data structure: list all project types and their collection sections. Use this to map section selectors for get-collection tool.",
    {},
    async () => {
      const tokens = await loadTokens();
      try {
        const projectTypes = (await filevineGet("/v2/projectTypes")) as {
          items?: Array<{
            id: string;
            name?: string;
          }>;
        };

        const types = projectTypes?.items ?? [];
        const schema: Record<string, unknown> = {};

        // For each project type, fetch its sections
        for (const pt of types) {
          try {
            const sections = (await filevineGet(
              `/v2/projectTypes/${pt.id}/sections`
            )) as {
              items?: Array<{
                id: string;
                name?: string;
                selector?: string;
                type?: string;
              }>;
            };

            schema[pt.name ?? pt.id] = {
              id: pt.id,
              sections: (sections?.items ?? []).map((s) => ({
                name: s.name,
                selector: s.selector,
                type: s.type,
              })),
            };
          } catch (sectionErr) {
            console.error(
              `[discover-schema] Failed to fetch sections for ${pt.name}: ${(sectionErr as Error).message}`
            );
            schema[pt.name ?? pt.id] = { id: pt.id, error: "Failed to fetch sections" };
          }
        }

        await auditLog({
          tool: "discover-schema",
          args: {},
          outcome: "success",
          user_id: tokens?.user_id,
          result_count: types.length,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                project_types: types.length,
                schema,
                instructions:
                  "Use the 'selector' values from each section in the get-collection tool to fetch custom data for your firm.",
              }, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = (err as Error).message;
        await auditLog({
          tool: "discover-schema",
          args: {},
          outcome: "error",
          user_id: tokens?.user_id,
          error: msg,
        });
        return {
          content: [{ type: "text", text: `Error discovering schema: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get-collection",
    "Get custom collection data (medical records, liens, settlements, etc.) for a case. Use discover-schema first to find available selectors.",
    {
      case_id: z.string().describe("The Filevine project ID"),
      selector: z
        .string()
        .describe(
          "The collection selector (e.g., 'MedicalRecords', 'Liens'). Find selectors via discover-schema tool."
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(50),
    },
    async ({ case_id, selector, limit }) => {
      const tokens = await loadTokens();
      try {
        const data = (await filevineGet(
          `/v2/projects/${case_id}/collections/${selector}`,
          { limit }
        )) as Record<string, unknown>;

        const itemCount = Array.isArray(data?.items)
          ? (data.items as unknown[]).length
          : 0;

        await auditLog({
          tool: "get-collection",
          args: { case_id, selector, limit },
          outcome: "success",
          user_id: tokens?.user_id,
          case_id,
          result_count: itemCount,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                case_id,
                collection: selector,
                data,
              }, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = (err as Error).message;
        await auditLog({
          tool: "get-collection",
          args: { case_id, selector, limit },
          outcome: "error",
          user_id: tokens?.user_id,
          case_id,
          error: msg,
        });
        return {
          content: [
            {
              type: "text",
              text: `Error fetching collection '${selector}': ${msg}. Run discover-schema to find available collection selectors for your firm.`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
