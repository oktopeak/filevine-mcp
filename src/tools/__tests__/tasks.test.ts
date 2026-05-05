import { describe, it, expect, beforeEach } from "@jest/globals";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTaskTools } from "../tasks.js";
import * as filevineClient from "../../filevine-client.js";
import * as tokenStore from "../../auth/token-store.js";
import * as auditLogger from "../../audit/logger.js";

jest.mock("../../filevine-client.js");
jest.mock("../../auth/token-store.js");
jest.mock("../../audit/logger.js");

describe("Task Tools", () => {
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
    it("should register both task tools", () => {
      registerTaskTools(mockServer as McpServer);

      expect(registeredTools.has("list-tasks")).toBe(true);
      expect(registeredTools.has("create-task")).toBe(true);
      expect(registeredTools.size).toBe(2);
    });
  });

  describe("list-tasks tool", () => {
    it("should successfully list open tasks with pagination", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockTasks = {
        items: [
          {
            id: "task_1",
            title: "Follow up with client",
            status: "open",
            assigned_to: "attorney_1",
            due_date: "2024-05-10",
            created_at: "2024-05-01T10:00:00Z",
            completed_at: null,
            description: "Call client to discuss settlement offer",
          },
          {
            id: "task_2",
            title: "Review medical records",
            status: "open",
            assigned_to: "paralegal_1",
            due_date: "2024-05-08",
            created_at: "2024-04-30T14:30:00Z",
            completed_at: null,
            description: "Review and summarize medical records from Dr. Johnson",
          },
          {
            id: "task_3",
            title: "Prepare discovery responses",
            status: "open",
            assigned_to: "attorney_1",
            due_date: "2024-05-15",
            created_at: "2024-05-01T09:00:00Z",
            completed_at: null,
            description: "Draft responses to interrogatories",
          },
        ],
        meta: { total: 3 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockTasks);

      registerTaskTools(mockServer as McpServer);
      const listTasksTool = registeredTools.get("list-tasks");
      const result = await listTasksTool.handler({
        case_id: "case_1",
        status: "open",
        limit: 50,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.case_id).toBe("case_1");
      expect(content.tasks).toHaveLength(3);
      expect(content.total).toBe(3);
      expect(content.tasks[0].title).toBe("Follow up with client");
      expect(content.tasks[0].status).toBe("open");
      expect(content.tasks[1].assigned_to).toBe("paralegal_1");

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects/case_1/tasks",
        expect.objectContaining({ status: "open", limit: 50, page: 1 })
      );

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "list-tasks",
          outcome: "success",
          user_id: "user_456",
          case_id: "case_1",
          result_count: 3,
        })
      );
    });

    it("should filter tasks by completed status", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockTasks = {
        items: [
          {
            id: "task_100",
            title: "Initial consultation",
            status: "completed",
            assigned_to: "attorney_1",
            due_date: "2024-04-15",
            created_at: "2024-04-01T00:00:00Z",
            completed_at: "2024-04-15T14:00:00Z",
            description: "Initial client consultation",
          },
          {
            id: "task_101",
            title: "Conflict check",
            status: "completed",
            assigned_to: "paralegal_1",
            due_date: "2024-04-10",
            created_at: "2024-04-01T00:00:00Z",
            completed_at: "2024-04-10T09:00:00Z",
            description: "Perform conflict of interest check",
          },
        ],
        meta: { total: 2 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockTasks);

      registerTaskTools(mockServer as McpServer);
      const listTasksTool = registeredTools.get("list-tasks");
      const result = await listTasksTool.handler({
        case_id: "case_1",
        status: "completed",
        limit: 50,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.tasks).toHaveLength(2);
      expect(content.tasks[0].status).toBe("completed");
      expect(content.tasks[0].completed_at).toBeDefined();

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects/case_1/tasks",
        expect.objectContaining({ status: "completed" })
      );
    });

    it("should filter tasks by overdue status", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockTasks = {
        items: [
          {
            id: "task_200",
            title: "Submit settlement docs",
            status: "overdue",
            assigned_to: "attorney_1",
            due_date: "2024-04-20",
            created_at: "2024-04-01T00:00:00Z",
            completed_at: null,
            description: "Submit settlement documents to court",
          },
        ],
        meta: { total: 1 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockTasks);

      registerTaskTools(mockServer as McpServer);
      const listTasksTool = registeredTools.get("list-tasks");
      const result = await listTasksTool.handler({
        case_id: "case_1",
        status: "overdue",
        limit: 50,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.tasks[0].status).toBe("overdue");

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects/case_1/tasks",
        expect.objectContaining({ status: "overdue" })
      );
    });

    it("should list all tasks when status is 'all'", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockTasks = {
        items: [
          {
            id: "task_1",
            title: "Task 1",
            status: "open",
            assigned_to: "user_1",
            due_date: "2024-05-10",
            created_at: "2024-05-01T00:00:00Z",
            completed_at: null,
            description: "Open task",
          },
          {
            id: "task_2",
            title: "Task 2",
            status: "completed",
            assigned_to: "user_1",
            due_date: "2024-04-15",
            created_at: "2024-04-01T00:00:00Z",
            completed_at: "2024-04-15T00:00:00Z",
            description: "Completed task",
          },
        ],
        meta: { total: 2 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockTasks);

      registerTaskTools(mockServer as McpServer);
      const listTasksTool = registeredTools.get("list-tasks");
      await listTasksTool.handler({
        case_id: "case_1",
        status: "all",
        limit: 50,
        page: 1,
      });

      const callArgs = (filevineClient.filevineGet as any).mock.calls[0][1];
      expect(callArgs.status).toBeUndefined();
    });

    it("should handle pagination with custom limits", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockTasks = {
        items: Array.from({ length: 10 }, (_, i) => ({
          id: `task_${i + 1}`,
          title: `Task ${i + 1}`,
          status: "open",
          assigned_to: "user_1",
          due_date: `2024-05-${String((i % 30) + 1).padStart(2, "0")}`,
          created_at: "2024-05-01T00:00:00Z",
          completed_at: null,
          description: `Task ${i + 1}`,
        })),
        meta: { total: 50 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockTasks);

      registerTaskTools(mockServer as McpServer);
      const listTasksTool = registeredTools.get("list-tasks");
      const result = await listTasksTool.handler({
        case_id: "case_1",
        status: "open",
        limit: 10,
        page: 3,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.tasks).toHaveLength(10);
      expect(content.total).toBe(50);

      expect(filevineClient.filevineGet).toHaveBeenCalledWith(
        "/v2/projects/case_1/tasks",
        expect.objectContaining({ limit: 10, page: 3 })
      );
    });

    it("should handle case with no tasks", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockTasks = {
        items: [],
        meta: { total: 0 },
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevineGet as any).mockResolvedValue(mockTasks);

      registerTaskTools(mockServer as McpServer);
      const listTasksTool = registeredTools.get("list-tasks");
      const result = await listTasksTool.handler({
        case_id: "case_1",
        status: "open",
        limit: 50,
        page: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.tasks).toHaveLength(0);
      expect(content.total).toBe(0);
    });

    it("should handle API errors during task listing", async () => {
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

      registerTaskTools(mockServer as McpServer);
      const listTasksTool = registeredTools.get("list-tasks");
      const result = await listTasksTool.handler({
        case_id: "nonexistent_case",
        status: "open",
        limit: 50,
        page: 1,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error listing tasks");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "list-tasks",
          outcome: "error",
          user_id: "user_456",
          case_id: "nonexistent_case",
          error: "Case not found",
        })
      );
    });
  });

  describe("create-task tool", () => {
    it("should successfully create a task with all parameters", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockResponse = {
        id: "task_new_1",
        created_at: "2024-05-04T15:30:00Z",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevinePost as any).mockResolvedValue(mockResponse);

      registerTaskTools(mockServer as McpServer);
      const createTaskTool = registeredTools.get("create-task");
      const result = await createTaskTool.handler({
        case_id: "case_1",
        title: "Deposition prep",
        description: "Prepare client for deposition with opposing counsel",
        assigned_to: "attorney_1",
        due_date: "2024-05-15",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.task_id).toBe("task_new_1");
      expect(content.created_at).toBe("2024-05-04T15:30:00Z");
      expect(content.message).toBeDefined();

      expect(filevineClient.filevinePost).toHaveBeenCalledWith(
        "/v2/projects/case_1/tasks",
        expect.objectContaining({
          title: "Deposition prep",
          description: "Prepare client for deposition with opposing counsel",
          assigned_to: "attorney_1",
          targetDate: "2024-05-15",
        })
      );

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "create-task",
          outcome: "success",
          user_id: "user_456",
          case_id: "case_1",
          result_count: 1,
        })
      );
    });

    it("should create task with only required title", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockResponse = {
        id: "task_minimal_1",
        created_at: "2024-05-04T14:00:00Z",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevinePost as any).mockResolvedValue(mockResponse);

      registerTaskTools(mockServer as McpServer);
      const createTaskTool = registeredTools.get("create-task");
      const result = await createTaskTool.handler({
        case_id: "case_1",
        title: "Quick task",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.task_id).toBe("task_minimal_1");

      expect(filevineClient.filevinePost).toHaveBeenCalledWith(
        "/v2/projects/case_1/tasks",
        expect.objectContaining({
          title: "Quick task",
        })
      );
    });

    it("should create task with description but no assignment", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockResponse = {
        id: "task_desc_1",
        created_at: "2024-05-04T13:00:00Z",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevinePost as any).mockResolvedValue(mockResponse);

      registerTaskTools(mockServer as McpServer);
      const createTaskTool = registeredTools.get("create-task");
      const result = await createTaskTool.handler({
        case_id: "case_1",
        title: "Review discovery",
        description: "Review defendant's discovery responses",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);

      expect(filevineClient.filevinePost).toHaveBeenCalledWith(
        "/v2/projects/case_1/tasks",
        expect.objectContaining({
          title: "Review discovery",
          description: "Review defendant's discovery responses",
        })
      );
    });

    it("should create task with assignment but no due date", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockResponse = {
        id: "task_assign_1",
        created_at: "2024-05-04T12:00:00Z",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevinePost as any).mockResolvedValue(mockResponse);

      registerTaskTools(mockServer as McpServer);
      const createTaskTool = registeredTools.get("create-task");
      const result = await createTaskTool.handler({
        case_id: "case_1",
        title: "Task for paralegal",
        assigned_to: "paralegal_1",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);

      expect(filevineClient.filevinePost).toHaveBeenCalledWith(
        "/v2/projects/case_1/tasks",
        expect.objectContaining({
          title: "Task for paralegal",
          assigned_to: "paralegal_1",
        })
      );
    });

    it("should handle long description and truncate for audit logging", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const longDescription =
        "This is a long task description that contains detailed instructions about what needs to be done. It includes multiple paragraphs of information.";

      const mockResponse = {
        id: "task_long_1",
        created_at: "2024-05-04T11:00:00Z",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevinePost as any).mockResolvedValue(mockResponse);

      registerTaskTools(mockServer as McpServer);
      const createTaskTool = registeredTools.get("create-task");
      const result = await createTaskTool.handler({
        case_id: "case_1",
        title: "Long task",
        description: longDescription,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);

      // Verify that audit log truncates description to first 50 chars
      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "create-task",
          args: expect.objectContaining({
            description: longDescription.slice(0, 50),
          }),
        })
      );
    });

    it("should use API field name 'targetDate' for due_date", async () => {
      const mockTokens = {
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        org_id: "org_123",
        user_id: "user_456",
      };

      const mockResponse = {
        id: "task_date_1",
        created_at: "2024-05-04T10:00:00Z",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevinePost as any).mockResolvedValue(mockResponse);

      registerTaskTools(mockServer as McpServer);
      const createTaskTool = registeredTools.get("create-task");
      await createTaskTool.handler({
        case_id: "case_1",
        title: "Task with date",
        due_date: "2024-05-20",
      });

      expect(filevineClient.filevinePost).toHaveBeenCalledWith(
        "/v2/projects/case_1/tasks",
        expect.objectContaining({
          targetDate: "2024-05-20",
        })
      );
    });

    it("should handle API errors during task creation", async () => {
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

      registerTaskTools(mockServer as McpServer);
      const createTaskTool = registeredTools.get("create-task");
      const result = await createTaskTool.handler({
        case_id: "invalid_case",
        title: "Test task",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error creating task");

      expect(auditLogger.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: "create-task",
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
        id: "task_format_1",
        created_at: "2024-05-04T09:00:00Z",
      };

      (tokenStore.loadTokens as any).mockResolvedValue(mockTokens);
      (filevineClient.filevinePost as any).mockResolvedValue(mockResponse);

      registerTaskTools(mockServer as McpServer);
      const createTaskTool = registeredTools.get("create-task");
      const result = await createTaskTool.handler({
        case_id: "case_1",
        title: "Formatted task",
      });

      expect(result.content[0].type).toBe("text");
      const content = JSON.parse(result.content[0].text);
      expect(typeof content).toBe("object");
      expect(content.success).toBe(true);
      expect(content.task_id).toBeDefined();
      expect(content.created_at).toBeDefined();
      expect(content.message).toBeDefined();
    });
  });
});
