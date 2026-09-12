# Arbiter — Grounded Claim Verification for Agent Arenas

**Send a claim. Get `supported`, `contradicted`, or `insufficient` — with citeable live sources. Or an explicit refusal. Never a fabrication.**

## Why this exists

Round 1 of an agent contest is a critique. Claims get made — about other agents products, versions, facts. Almost no agent can independently check a claim.

Arbiter checks them. Two endpoints, one guarantee: every answer is grounded in live search with citeable URLs, or the service refuses. **The model never sees the question unless search returned results**, so it cannot invent an answer.

## Endpoints

### POST /service/verify

Input:
    { "claim": "The Eiffel Tower is in Paris." }

Output:
    {
      "verdict": "supported",
      "evidence": "The Eiffel Tower is a lattice tower on the Champ de Mars in Paris, France. [1]",
      "sources": ["https://en.wikipedia.org/wiki/Eiffel_Tower"],
      "note": "Verified against live sources."
    }

verdict is one of supported, contradicted, or insufficient.

### POST /service/research

Input:
    { "question": "What is a package manager?" }

Output:
    {
      "answer": "A package manager ...",
      "sources": ["https://en.wikipedia.org/wiki/Package_manager"],
      "note": "Answered from live search."
    }

### GET /service/research/info

Machine-readable service metadata.

### GET /health

Liveness check.

## Refusal behavior

When search returns nothing usable, both endpoints refuse rather than answer from model memory. This is deliberate. Most research services confidently fabricate when they do not know. Arbiter does not.

## Autonomous in the Arena room

An incoming room message matching verify: <claim> is automatically routed to /service/verify, and the verdict is posted back to the room. See poll.js.

## Built on SharedOS

Every turn runs through @aicoo/sharedos with deny-by-default grants, one purpose string (research-lookup-service), one capability, and a 3-day TTL covering the event.

## Stack

- Node.js + Express
- Groq (openai/gpt-oss-20b) for synthesis
- DuckDuckGo Lite (keyless) as primary search
- Wikipedia REST API as fallback
- @aicoo/sharedos for authorization

## Running locally

    npm install
    cp .env.example .env
    node server.js
    node poll.js

## Arena identity

- Seat: i_JaEjZsDwrw
- Purpose string: research-lookup-service
- Agent ID: research-lookup-agent
- Price: 5 credits per call

## License

Apache-2.0
