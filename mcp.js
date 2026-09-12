// mcp.js — MCP (JSON-RPC 2.0) endpoint exposing verify and research as tools.
// Mounts at /mcp. Speaks the subset of MCP that HTTP clients need:
// initialize, tools/list, tools/call.

import express from "express";

const router = express.Router();
const LOCAL_SERVICE = "http://localhost:3000";

const TOOLS = [
  {
    name: "verify",
    description:
      "Verify a factual claim against live web sources. Returns a verdict of " +
      "supported, contradicted, or insufficient, with citeable source URLs. " +
      "If search returns nothing usable, returns a refusal rather than a guess.",
    inputSchema: {
      type: "object",
      properties: {
        claim: { type: "string", description: "The claim to verify." },
      },
      required: ["claim"],
    },
  },
  {
    name: "research",
    description:
      "Answer a factual question grounded in live web sources. Returns an " +
      "answer with source URLs, or an explicit refusal if no source is found.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question to answer." },
      },
      required: ["question"],
    },
  },
];

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function callLocal(path, body) {
  const r = await fetch(LOCAL_SERVICE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("service HTTP " + r.status);
  return r.json();
}

router.post("/", async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};

  if (jsonrpc !== "2.0") {
    return res.json(rpcError(id ?? null, -32600, "Invalid Request"));
  }

  try {
    if (method === "initialize") {
      return res.json(
        rpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "arbiter", version: "1.0.0" },
        }),
      );
    }

    if (method === "tools/list") {
      return res.json(rpcResult(id, { tools: TOOLS }));
    }

    if (method === "tools/call") {
      const name = params && params.name;
      const args = (params && params.arguments) || {};

      if (name === "verify") {
        const data = await callLocal("/service/verify", { claim: args.claim });
        return res.json(
          rpcResult(id, {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
            isError: false,
          }),
        );
      }

      if (name === "research") {
        const data = await callLocal("/service/research", {
          question: args.question,
        });
        return res.json(
          rpcResult(id, {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
            isError: false,
          }),
        );
      }

      return res.json(rpcError(id, -32601, "Unknown tool: " + name));
    }

    if (method === "notifications/initialized") {
      return res.status(204).end();
    }

    return res.json(rpcError(id, -32601, "Method not found: " + method));
  } catch (err) {
    return res.json(
      rpcResult(id, {
        content: [{ type: "text", text: "Error: " + err.message }],
        isError: true,
      }),
    );
  }
});

// Some MCP clients probe with GET for SSE; reply with JSON so they don't hang.
router.get("/", (req, res) => {
  res.status(200).json({
    name: "arbiter-mcp",
    protocol: "mcp",
    version: "1.0.0",
    tools: TOOLS.map((t) => t.name),
  });
});

export default router;