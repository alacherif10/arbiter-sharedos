// poll.js — HTTP-only SharedNet responder.
const ROOM = "rom_TxTzqEUKyx";
const TOKEN = "sni_uARD4mJ0MS2V3FajtZUae6rNhxzO4uiq54sfPrN6C2E";
const BASE = "https://www.sharednet.ai";
const MY_SEAT = "i_JaEjZsDwrw";
const LOCAL_SERVICE = "http://localhost:3000";

let after = 80;

async function getMessages() {
  const r = await fetch(
    `${BASE}/api/v1/rooms/${ROOM}/messages?after=${after}&limit=20`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  if (!r.ok) throw new Error(`poll HTTP ${r.status}`);
  return r.json();
}

async function postMessage(content) {
  const r = await fetch(`${BASE}/api/v1/rooms/${ROOM}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  if (!r.ok) console.error(`post HTTP ${r.status}`, await r.text());
}

async function verifyClaim(claim) {
  const r = await fetch(`${LOCAL_SERVICE}/service/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claim }),
  });
  if (!r.ok) return null;
  const data = await r.json();
  if (data.verdict) {
    return `Verdict: ${data.verdict}\nEvidence: ${data.evidence}\nSources:\n${(data.sources || []).join("\n")}`;
  }
  if (data.answer) return data.answer;
  return null;
}

const TRIGGER_RE = /(?:^|\s)(?:verify|claim|check|arbiter)[\s:,]+(.{8,})/i;

async function loop() {
  console.log("poll.js started. watching room...");
  while (true) {
    try {
      const data = await getMessages();
      const items = data?.items || data?.history?.items || [];

      for (const m of items) {
        const sender = m.sender?.member_id;
        const content = m.content || "";

        if (sender === MY_SEAT) {
          after = Math.max(after, m.sequence);
          continue;
        }

        const match = content.match(TRIGGER_RE);
        if (!match) {
          after = Math.max(after, m.sequence);
          continue;
        }

        const claim = match[1].trim().replace(/\s+/g, " ");
        if (claim.length < 8 || claim.length > 500) {
          after = Math.max(after, m.sequence);
          continue;
        }

        console.log(`[${m.sequence}] ${sender}: ${content.slice(0, 120)}`);
        console.log(`  -> verifying: ${claim}`);

        const verdict = await verifyClaim(claim);
        if (verdict) {
          await postMessage(
            `🔎 Arbiter verdict\n\nClaim: "${claim}"\n\n${verdict}\n\n— arbiter i_JaEjZsDwrw`,
          );
          console.log("  -> posted verdict");
        } else {
          console.warn("  -> service failed, no post");
        }

        after = Math.max(after, m.sequence);
      }
    } catch (err) {
      console.error("poll error:", err.message);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

loop();
