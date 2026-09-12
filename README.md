# Research Lookup — SharedOS Hackathon Service

A callable service for the SharedOS Arena. Another agent sends a question,
this service answers it concisely using Groq (free tier, no credit card).

No live web search — answers come from the model's own knowledge, not a
real-time search. This was a deliberate tradeoff for reliability: Gemini's
free tier kept returning inconsistent quota errors, and Groq's search tool
is billed per-call rather than free. Swap in a free, keyless search API
(e.g. DuckDuckGo) later if there's time before submission.

## What it does

- **Input:** `{ "question": "..." }`
- **Output:** `{ "answer": "...", "sources": ["https://...", ...] }`
- **Price:** 5 Arena credits
- **Response time:** well under the 5-minute cap (typically a few seconds)

## Setup

**Note:** this project is ESM (`"type": "module"` in `package.json`), because
`@aicoo/sharedos` is ESM-only. Node.js 18+ handles this fine as long as you
don't rename files to `.cjs` or mix in `require()`.

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in:
   - `GROQ_API_KEY` — free, no credit card required, from
     https://console.groq.com/keys
   - No SharedOS account/tenant ID needed — it's a self-hosted, Apache-2.0
     npm package. The kernel is embedded directly in `server.js`.
3. Run it:
   ```
   npm start
   ```

## Testing locally

```bash
curl -X POST http://localhost:3000/service/research \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the current version of the SharedOS npm package?"}'
```

Check the metadata endpoint too:

```bash
curl http://localhost:3000/service/research/info
```

## SharedOS integration — what's already wired in

`server.js` embeds a real `SharedOSKernel`: a grant scoping the service
agent to one purpose (`research-lookup-service`), deny-by-default (no
capabilities beyond that purpose), and every request routed through
`SharedOSExecutor` so it shows up in the turn/audit trail. This satisfies
the "built on SharedOS" requirement structurally.

**Still to do before submitting:**

1. `npm install` and run a real call locally — verify the shape of
   `result` matches the `// NOTE` comment in `server.js` (the quickstart
   docs don't show pulling output back out of a completed turn, so this
   needs a live check).
2. Swap `owner.userId` from `"you"` to your actual name/handle.
3. **Confirm with `#arena-support` how SharedNet discovery actually
   works** — i.e., how another agent finds and calls
   `POST /service/research` over the network. This isn't in the public
   docs (SharedNet is marked "not documented publicly yet" on the
   overview page), so it's presumably covered in the pinned Discord
   materials or requires a specific registration step there.
4. Once you know that mechanism, the `sender`/`receiver` addresses in
   `runResearchTurn()` need to reflect the actual calling agent's
   identity, not a placeholder pointing at `serviceAgent` on both ends.
5. Get your product's **purpose string** (`research-lookup-service`,
   already set) and **agent addresses** for the Devpost submission.
6. Test an actual end-to-end call from another agent before submissions
   close.

## Submission checklist reminder

- [ ] Devpost project page (name, tagline, what it does, what it sells)
- [ ] Agent's SharedNet node ID
- [ ] Service listing (this doc covers most of it)
- [ ] Purpose string + agent addresses
- [ ] Repo link
- [ ] Discord username of team lead
- [ ] (Optional) 2-min video of a real agent-to-agent call