import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { filevineGet, FileVineApiError } from "../filevine-client.js";
import { auditLog } from "../audit/logger.js";
import { loadTokens } from "../auth/token-store.js";

export function registerContactTools(server: McpServer): void {
  server.tool(
    "search-contacts",
    "Search for contacts across all cases by name or email.",
    {
      search: z
        .string()
        .describe("Name, email, or phone to search for"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(25),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1),
    },
    async ({ search, limit, page }) => {
      const tokens = await loadTokens();
      try {
        const data = (await filevineGet("/v2/contacts", {
          search,
          limit,
          page,
        })) as {
          items?: Array<{
            id: string;
            name?: string;
            email?: string;
            phone?: string;
            person_type?: string;
          }>;
          meta?: { total?: number };
        };

        const contacts = data?.items ?? [];
        await auditLog({
          tool: "search-contacts",
          args: { search, limit, page },
          outcome: "success",
          user_id: tokens?.user_id,
          result_count: contacts.length,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                contacts: contacts.map((c) => ({
                  id: c.id,
                  name: c.name,
                  email: c.email,
                  phone: c.phone,
                  person_type: c.person_type,
                })),
                total: data?.meta?.total,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = (err as Error).message;
        await auditLog({
          tool: "search-contacts",
          args: { search, limit, page },
          outcome: "error",
          user_id: tokens?.user_id,
          error: msg,
        });
        return {
          content: [{ type: "text", text: `Error searching contacts: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get-contact",
    "Get detailed information about a specific contact by ID.",
    {
      contact_id: z.string().describe("The Filevine contact ID"),
    },
    async ({ contact_id }) => {
      const tokens = await loadTokens();
      try {
        const data = (await filevineGet(`/v2/contacts/${contact_id}`)) as Record<
          string,
          unknown
        >;

        await auditLog({
          tool: "get-contact",
          args: { contact_id },
          outcome: "success",
          user_id: tokens?.user_id,
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
          tool: "get-contact",
          args: { contact_id },
          outcome: "error",
          user_id: tokens?.user_id,
          error: msg,
        });
        return {
          content: [{ type: "text", text: `Error fetching contact: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "list-case-contacts",
    "List all contacts assigned to a specific case.",
    {
      case_id: z.string().describe("The Filevine project ID"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50),
    },
    async ({ case_id, limit }) => {
      const tokens = await loadTokens();
      try {
        const data = (await filevineGet(
          `/v2/projects/${case_id}/contacts`,
          { limit }
        )) as {
          items?: Array<{
            id: string;
            name?: string;
            email?: string;
            phone?: string;
            person_type?: string;
            role?: string;
          }>;
        };

        const contacts = data?.items ?? [];
        await auditLog({
          tool: "list-case-contacts",
          args: { case_id, limit },
          outcome: "success",
          user_id: tokens?.user_id,
          case_id,
          result_count: contacts.length,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                case_id,
                contacts: contacts.map((c) => ({
                  id: c.id,
                  name: c.name,
                  email: c.email,
                  phone: c.phone,
                  person_type: c.person_type,
                  role: c.role,
                })),
                count: contacts.length,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = (err as Error).message;
        await auditLog({
          tool: "list-case-contacts",
          args: { case_id, limit },
          outcome: "error",
          user_id: tokens?.user_id,
          case_id,
          error: msg,
        });
        return {
          content: [{ type: "text", text: `Error listing case contacts: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
