import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  filevineGet,
  filevinePost,
  FileVineApiError,
} from "../filevine-client.js";
import { auditLog } from "../audit/logger.js";
import { loadTokens } from "../auth/token-store.js";

export function registerTaskTools(server: McpServer): void {
  server.tool(
    "list-tasks",
    "List all tasks for a specific case, optionally filtered by status.",
    {
      case_id: z.string().describe("The Filevine project ID"),
      status: z
        .enum(["open", "completed", "overdue", "all"])
        .optional()
        .default("open")
        .describe('Filter by task status. Defaults to "open".'),
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
    async ({ case_id, status, limit, page }) => {
      const tokens = await loadTokens();
      try {
        const params: Record<string, string | number | undefined> = {
          limit,
          page,
        };
        if (status && status !== "all") params.status = status;

        const data = (await filevineGet(`/v2/projects/${case_id}/tasks`, params)) as {
          items?: Array<{
            id: string;
            title?: string;
            status?: string;
            assigned_to?: string;
            due_date?: string;
            created_at?: string;
            completed_at?: string;
            description?: string;
          }>;
          meta?: { total?: number };
        };

        const tasks = data?.items ?? [];
        await auditLog({
          tool: "list-tasks",
          args: { case_id, status, limit, page },
          outcome: "success",
          user_id: tokens?.user_id,
          case_id,
          result_count: tasks.length,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                case_id,
                tasks: tasks.map((t) => ({
                  id: t.id,
                  title: t.title,
                  status: t.status,
                  assigned_to: t.assigned_to,
                  due_date: t.due_date,
                  created_at: t.created_at,
                  completed_at: t.completed_at,
                  description: t.description,
                })),
                total: data?.meta?.total,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = (err as Error).message;
        await auditLog({
          tool: "list-tasks",
          args: { case_id, status, limit, page },
          outcome: "error",
          user_id: tokens?.user_id,
          case_id,
          error: msg,
        });
        return {
          content: [{ type: "text", text: `Error listing tasks: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "create-task",
    "Create a new task on a case. Note: targetDate field may be ignored by Filevine API (known issue as of Aug 2025).",
    {
      case_id: z.string().describe("The Filevine project ID"),
      title: z.string().describe("Task title"),
      description: z
        .string()
        .optional()
        .describe("Task description"),
      assigned_to: z
        .string()
        .optional()
        .describe("Filevine user ID to assign task to"),
      due_date: z
        .string()
        .optional()
        .describe("Due date in ISO format (YYYY-MM-DD). Note: may be ignored by API."),
    },
    async ({ case_id, title, description, assigned_to, due_date }) => {
      const tokens = await loadTokens();
      try {
        const body: Record<string, unknown> = { title };
        if (description) body.description = description;
        if (assigned_to) body.assigned_to = assigned_to;
        if (due_date) body.targetDate = due_date; // API field name

        const data = (await filevinePost(`/v2/projects/${case_id}/tasks`, body)) as {
          id?: string;
          created_at?: string;
        };

        await auditLog({
          tool: "create-task",
          args: { case_id, title, description: description?.slice(0, 50), assigned_to, due_date },
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
                task_id: data?.id,
                created_at: data?.created_at,
                message: "Task created successfully. (Note: due_date may not be applied by API)",
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = (err as Error).message;
        await auditLog({
          tool: "create-task",
          args: { case_id, title, description: description?.slice(0, 50), assigned_to, due_date },
          outcome: "error",
          user_id: tokens?.user_id,
          case_id,
          error: msg,
        });
        return {
          content: [{ type: "text", text: `Error creating task: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
