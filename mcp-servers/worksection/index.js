#!/usr/bin/env node
// Worksection MCP server (stdio).
//
// Exposes a few read/write tools over the Worksection OAuth2 API. Credentials
// are read from environment variables — never hard-code them:
//   WS_CLIENT_ID, WS_CLIENT_SECRET, WS_REFRESH_TOKEN, [WS_ACCOUNT_URL]
//
// Obtain WS_REFRESH_TOKEN once via `npm run auth` (see bootstrap-auth.js).

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WorksectionClient } from "./worksection.js";

const client = new WorksectionClient({
  clientId: process.env.WS_CLIENT_ID,
  clientSecret: process.env.WS_CLIENT_SECRET,
  refreshToken: process.env.WS_REFRESH_TOKEN,
  accountUrl: process.env.WS_ACCOUNT_URL,
});

const TOOLS = [
  {
    name: "worksection_list_projects",
    description:
      "List Worksection projects (returns id, name, and status for each).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "worksection_list_users",
    description:
      "List Worksection users (returns name and email) — use emails to assign tasks.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "worksection_create_project",
    description: "Create a new Worksection project.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Project title." },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "worksection_create_task",
    description: "Create a task inside a Worksection project.",
    inputSchema: {
      type: "object",
      properties: {
        id_project: {
          type: "string",
          description: "Target project id (from worksection_list_projects).",
        },
        title: { type: "string", description: "Task title." },
        text: { type: "string", description: "Task description (optional)." },
        email_user_to: {
          type: "string",
          description: "Assignee email (optional; must be a project member).",
        },
        priority: {
          type: "number",
          description: "Priority 0-10 (optional).",
        },
        dateend: {
          type: "string",
          description: "Due date YYYY-MM-DD (optional).",
        },
      },
      required: ["id_project", "title"],
      additionalProperties: false,
    },
  },
];

const server = new Server(
  { name: "worksection", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    let result;
    switch (name) {
      case "worksection_list_projects":
        result = await client.listProjects();
        break;
      case "worksection_list_users":
        result = await client.listUsers();
        break;
      case "worksection_create_project":
        result = await client.createProject({ title: args.title });
        break;
      case "worksection_create_task":
        result = await client.createTask({
          idProject: args.id_project,
          title: args.title,
          text: args.text,
          emailUserTo: args.email_user_to,
          priority: args.priority,
          dateEnd: args.dateend,
        });
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${err.message}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("worksection-mcp running on stdio");
