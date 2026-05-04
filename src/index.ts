#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { registerAuthTools } from "./auth/authTools.js";
import { registerCaseTools } from "./tools/cases.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerNoteTools } from "./tools/notes.js";
import { registerDocumentTools } from "./tools/documents.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerCollectionTools } from "./tools/collections.js";
import { registerAuthStatusResource } from "./resources/auth-status.js";
import { registerComplianceResource } from "./resources/compliance.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

function assertEnv(name: string): void {
  if (!process.env[name]) {
    console.error(
      `[filevine-mcp] ERROR: Required environment variable ${name} is not set.`
    );
    console.error(
      `[filevine-mcp] Copy .env.example to .env and fill in the values.`
    );
    process.exit(1);
  }
}

assertEnv("FILEVINE_CLIENT_ID");
assertEnv("FILEVINE_CLIENT_SECRET");
assertEnv("FILEVINE_PAT");
assertEnv("ENCRYPTION_KEY");

const server = new McpServer({ name: "filevine-mcp", version: "1.0.0" });

// Register all tool groups
registerAuthTools(server);
registerCaseTools(server);
registerContactTools(server);
registerNoteTools(server);
registerDocumentTools(server);
registerTaskTools(server);
registerCollectionTools(server);

// Register resources
registerAuthStatusResource(server);
registerComplianceResource(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[filevine-mcp] Server running on stdio. Ready for connections.");
