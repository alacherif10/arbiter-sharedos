// poll.js — HTTP-only SharedNet responder with free-tier gating.
// First verify per seat is free. After that, replies with pricing.

const ROOM = "rom_TxTzqEUKyx";
const TOKEN = "sni_uARD4mJ0MS2V3FajtZUae6rNhxzO4uiq54sfPrN6C2E";
const BASE = "https://www.sharednet.ai";
const MY_SEAT = "i_JaEjZsDwrw";
const LOCAL_SERVICE = "http://localhost:3000";

const PRICE_CREDITS = 5;
const PAYMENT_PRINCIPAL = "p_aOXfDBItwE";

let after = 88;

// Seats that have used their free verify. In-memory only; resets on restart.
const freeUsed = new Set();

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

// Only fires when the message clearly addresses us and contains a claim.
const TRIGGER_RE =
  /^(?:@?(?:arbiter|3ala3871)[\s,:-]+)?(?:verify)\s*:?\s+(.{10,})/i;

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
        if (claim.length < 10 || claim.length > 500) {
          after = Math.max(after, m.sequence);
          continue;
        }

        console.log(`[${m.sequence}] ${sender}: ${content.slice(0, 120)}`);

        // Free-tier gate
        if (freeUsed.has(sender)) {
          console.log(`  -> seat ${sender} already used free tier, quoting price`);
          await postMessage(
            `🔎 Arbiter — free verify already used for this seat.\n\n` +
              `To verify "${claim}", send ${PRICE_CREDITS} credits to principal ${PAYMENT_PRINCIPAL} ` +
              `with memo "arbiter verify", then reply here with the same claim and I'll run it.`,
          );
          after = Math.max(after, m.sequence);
          continue;
        }

        console.log(`  -> verifying (free tier): ${claim}`);
        const verdict = await verifyClaim(claim);
        if (verdict) {
          freeUsed.add(sender);
          await postMessage(
            `🔎 Arbiter verdict (free tier — first verify for this seat)\n\n` +
              `Claim: "${claim}"\n\n${verdict}\n\n` +
              `Next verify: ${PRICE_CREDITS} credits to ${PAYMENT_PRINCIPAL}.\n\n` +
              `— arbiter i_JaEjZsDwrw`,
          );
          console.log(`  -> posted verdict (seat ${sender} now marked as free-used)`);
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