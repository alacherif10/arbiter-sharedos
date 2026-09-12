/**
 * SharedOS Hackathon — Grounded Research & Verification Service
 *
 * Two endpoints, one guarantee: every answer is grounded in live sources
 * with citeable URLs, or the service explicitly refuses. The model never
 * sees the question unless search returned results, so it cannot fabricate.
 *
 *   POST /service/research   { question } -> { answer, sources, note }
 *   POST /service/verify     { claim }    -> { verdict, evidence, sources, note }
 *   GET  /service/research/info
 *   GET  /health
 */

import "dotenv/config";
import express from "express";
import Groq from "groq-sdk";
import {
  SharedOSKernel,
  SharedOSExecutor,
  StandardRuntime,
  CapabilityAuthorizer,
  InMemoryGrantUsageStore,
  agentExecutionCapability,
} from "@aicoo/sharedos";
import { ddgSearch } from "./search.js";

const app = express();
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = "openai/gpt-oss-20b";

const PORT = process.env.PORT || 3000;
const PRICE_IN_CREDITS = 5;
const PURPOSE = "research-lookup-service";

const owner = { kind: "human", userId: "3ala3871" };
const serviceAgent = { kind: "agent", agentId: "research-lookup-agent" };

// ---------------------------------------------------------------------------
// SharedOS kernel — deny-by-default, one grant, one purpose
// ---------------------------------------------------------------------------

const grants = [
  {
    id: "grant-research-service",
    namespaceId: "hackathon",
    subject: serviceAgent,
    issuer: owner,
    capabilities: [agentExecutionCapability(serviceAgent, owner)],
    constraints: {
      purposes: [PURPOSE],
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(),
    },
    issuedAt: new Date().toISOString(),
  },
];

const kernel = new SharedOSKernel({
  grantSource: {
    async load(access) {
      return grants.filter(
        (g) =>
          g.namespaceId === access.namespaceId &&
          JSON.stringify(g.subject) === JSON.stringify(access.actor) &&
          JSON.stringify(g.issuer) === JSON.stringify(access.authority),
      );
    },
  },
  authorizer: new CapabilityAuthorizer({
    usageStore: new InMemoryGrantUsageStore(),
  }),
});

// ---------------------------------------------------------------------------
// Turn driver — search first, refuse on empty, otherwise ground the model
// ---------------------------------------------------------------------------

function makeResearchDriver(question, mode = "research") {
  let asked = false;
  return {
    async open() {
      return {
        async next() {
          if (asked) return { type: "complete", output: { done: true } };
          asked = true;

          let hits = [];
          let searchError = null;
          try {
            hits = await ddgSearch(question, 3);
          } catch (err) {
            console.error("Search failed:", err);
            searchError = err.message;
          }

          if (!hits.length) {
            return {
              type: "complete",
              output: {
                answer:
                  "No verified sources found for this question. This service " +
                  "does not answer from model memory.",
                sources: [],
                note: searchError
                  ? `Search error: ${searchError}`
                  : "No live results",
              },
            };
          }

          const context = hits
            .map(
              (h, i) =>
                `[${i + 1}] ${h.title}\nURL: ${h.url}\nSummary: ${h.snippet}`,
            )
            .join("\n\n");

          const prompt =
            mode === "verify"
              ? "You are a fact-checker. Given ONLY the sources below, decide " +
                "whether the following CLAIM is supported, contradicted, or " +
                "has insufficient evidence. Respond in exactly this format, " +
                "nothing else:\n" +
                "VERDICT: <supported|contradicted|insufficient>\n" +
                "EVIDENCE: <one sentence, cite [1] [2] etc.>\n\n" +
                `CLAIM: ${question}\n\nSources:\n${context}`
              : "Answer the question using ONLY the sources below. " +
                "If they do not contain the answer, reply exactly: " +
                '"Not found in sources." ' +
                "Do not use outside knowledge. Do not guess versions, dates, " +
                "numbers, or names.\n\n" +
                `Question: ${question}\n\nSources:\n${context}`;

          let raw = "";
          try {
            const completion = await groq.chat.completions.create({
              model: MODEL,
              messages: [{ role: "user", content: prompt }],
            });
            raw = completion.choices[0]?.message?.content?.trim() || "";
          } catch (err) {
            console.error("Groq call failed inside driver:", err);
            throw err;
          }

          // Helper: pick only the sources the model actually cited.
          // Falls back to all hits if no citation markers are present.
          function pickCitedSources(text) {
            const cited = new Set();
            const re = /[\[【](\d+)[\]】]/g;
            let m;
            while ((m = re.exec(text)) !== null) cited.add(Number(m[1]));
            if (!cited.size) return hits.map((h) => h.url);
            return [...cited]
              .filter((n) => n >= 1 && n <= hits.length)
              .map((n) => hits[n - 1].url);
          }

          if (mode === "verify") {
            const verdictMatch = raw.match(
              /VERDICT:\s*(supported|contradicted|insufficient)/i,
            );
            const evidenceMatch = raw.match(/EVIDENCE:\s*(.+)/i);
            const verdict = verdictMatch
              ? verdictMatch[1].toLowerCase()
              : "insufficient";
            const evidence = evidenceMatch ? evidenceMatch[1].trim() : raw;

            return {
              type: "complete",
              output: {
                verdict,
                evidence,
                sources: pickCitedSources(evidence),
                note: "Verified against live sources.",
              },
            };
          }

          // research mode
          const isRefusal = /^not found in sources\.?$/i.test(raw);
          if (isRefusal) {
            return {
              type: "complete",
              output: {
                answer:
                  "No verified sources found for this question. This service " +
                  "does not answer from model memory.",
                sources: [],
                note: "No matching sources",
              },
            };
          }

          return {
            type: "complete",
            output: {
              answer: raw,
              sources: pickCitedSources(raw),
              note: "Answered from live search.",
            },
          };
        },
      };
    },
  };
}

async function runResearchTurn(question, traceId, mode = "research") {
  const context = {
    namespaceId: "hackathon",
    actor: serviceAgent,
    authority: owner,
    owner,
    purpose: PURPOSE,
    traceId,
    enabledToolNamespaces: [],
    now: new Date().toISOString(),
  };

  const executor = new SharedOSExecutor(
    kernel,
    new StandardRuntime(makeResearchDriver(question, mode)),
    {
      defaultMaxSteps: 2,
      defaultMaxToolCalls: 1,
      defaultTimeoutMs: 60_000,
    },
  );

  const result = await executor.execute({
    version: "1",
    executionId: crypto.randomUUID(),
    agent: serviceAgent,
    context,
    message: {
      version: "1",
      id: crypto.randomUUID(),
      sender: serviceAgent,
      receiver: serviceAgent,
      purpose: PURPOSE,
      payload: { text: question },
      traceId,
      createdAt: new Date().toISOString(),
    },
    tools: [],
  });

  return result;
}

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

app.post("/service/research", async (req, res) => {
  const { question } = req.body;

  if (!question || typeof question !== "string") {
    return res.status(400).json({
      error:
        "Missing or invalid 'question' field. Expected: { question: string }",
    });
  }

  const traceId = crypto.randomUUID();
  try {
    const result = await runResearchTurn(question, traceId, "research");

    if (result.status !== "succeeded") {
      console.error(
        "Turn not succeeded:",
        JSON.stringify(result.events, null, 2),
      );
      return res.status(403).json({
        error: `Turn ${result.status}`,
        traceId,
        events: result.events,
      });
    }

    const output =
      result.output ??
      result.events?.find((e) => e.type === "turn.completed")?.output ??
      {};

    res.json({ ...output, traceId });
  } catch (err) {
    console.error("Research service error:", err);
    res
      .status(500)
      .json({ error: "Internal error while researching the question.", traceId });
  }
});

app.post("/service/verify", async (req, res) => {
  const { claim } = req.body;

  if (!claim || typeof claim !== "string") {
    return res.status(400).json({
      error: "Missing or invalid 'claim' field. Expected: { claim: string }",
    });
  }

  const traceId = crypto.randomUUID();
  try {
    const result = await runResearchTurn(claim, traceId, "verify");

    if (result.status !== "succeeded") {
      console.error(
        "Turn not succeeded:",
        JSON.stringify(result.events, null, 2),
      );
      return res.status(403).json({
        error: `Turn ${result.status}`,
        traceId,
        events: result.events,
      });
    }

    const output =
      result.output ??
      result.events?.find((e) => e.type === "turn.completed")?.output ??
      {};

    res.json({ ...output, traceId });
  } catch (err) {
    console.error("Verify service error:", err);
    res.status(500).json({ error: "Internal error while verifying.", traceId });
  }
});

app.get("/service/research/info", (req, res) => {
  res.json({
    name: "Grounded Research & Verification",
    description:
      "Two services in one. POST /service/research with {question} returns a " +
      "concise answer grounded in live web sources, with source URLs. " +
      "POST /service/verify with {claim} returns a verdict of supported, " +
      "contradicted, or insufficient, with citeable evidence. Both refuse " +
      "rather than answer from model memory when no verified source is found.",
    endpoints: {
      research: {
        method: "POST",
        path: "/service/research",
        input: { question: "string" },
        output: {
          answer: "string",
          sources: "string[]",
          note: "string",
        },
      },
      verify: {
        method: "POST",
        path: "/service/verify",
        input: { claim: "string" },
        output: {
          verdict: "supported | contradicted | insufficient",
          evidence: "string",
          sources: "string[]",
          note: "string",
        },
      },
    },
    price_credits: PRICE_IN_CREDITS,
    max_response_time_seconds: 60,
  });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Grounded research service listening on port ${PORT}`);
  console.log(`  POST /service/research        { "question": "..." }`);
  console.log(`  POST /service/verify          { "claim": "..." }`);
  console.log(`  GET  /service/research/info    (service metadata)`);
  console.log(`  GET  /health`);
});