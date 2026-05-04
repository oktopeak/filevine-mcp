import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadTokens, clearTokens } from "./token-store.js";
import { exchangePatForToken, getValidTokens } from "./oauth.js";
import { auditLog } from "../audit/logger.js";

export function registerAuthTools(server: McpServer): void {
  server.tool(
    "authenticate",
    "Exchange your Filevine Personal Access Token (PAT) for an access token. Must be called once before using other Filevine tools. Requires FILEVINE_CLIENT_ID, FILEVINE_CLIENT_SECRET, and FILEVINE_PAT in .env",
    {},
    async () => {
      try {
        const tokens = await exchangePatForToken();
        await auditLog({
          tool: "authenticate",
          args: {},
          outcome: "success",
          user_id: tokens.user_id,
          result_count: 1,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                user_id: tokens.user_id,
                org_id: tokens.org_id,
                message:
                  "Successfully authenticated with Filevine. You can now use the other Filevine tools.",
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = (err as Error).message;
        await auditLog({
          tool: "authenticate",
          args: {},
          outcome: "error",
          error: msg,
        });
        return {
          content: [{ type: "text", text: `Authentication failed: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "auth-status",
    "Check whether the server is authenticated with Filevine and when the token expires.",
    {},
    async () => {
      try {
        const tokens = await loadTokens();
        if (!tokens) {
          await auditLog({
            tool: "auth-status",
            args: {},
            outcome: "success",
            result_count: 0,
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  authenticated: false,
                  message:
                    'Not authenticated. Use the "authenticate" tool to connect to Filevine.',
                }),
              },
            ],
          };
        }

        const expiresAt = new Date(tokens.expires_at).toISOString();
        const isExpired = Date.now() >= tokens.expires_at;
        await auditLog({
          tool: "auth-status",
          args: {},
          outcome: "success",
          user_id: tokens.user_id,
          result_count: 1,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                authenticated: true,
                user_id: tokens.user_id,
                org_id: tokens.org_id,
                expires_at: expiresAt,
                is_expired: isExpired,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = (err as Error).message;
        await auditLog({
          tool: "auth-status",
          args: {},
          outcome: "error",
          error: msg,
        });
        return {
          content: [{ type: "text", text: `Error checking auth status: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "logout",
    "Remove the stored Filevine tokens from disk.",
    {},
    async () => {
      try {
        const tokens = await loadTokens();
        await clearTokens();
        await auditLog({
          tool: "logout",
          args: {},
          outcome: "success",
          user_id: tokens?.user_id,
          result_count: 0,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: 'Logged out. Use "authenticate" to reconnect.',
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = (err as Error).message;
        await auditLog({
          tool: "logout",
          args: {},
          outcome: "error",
          error: msg,
        });
        return {
          content: [{ type: "text", text: `Logout failed: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
