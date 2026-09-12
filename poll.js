// poll.js — HTTP-only SharedNet responder.
const ROOM = "rom_TxTzqEUKyx";
const TOKEN = "sni_uARD4mJ0MS2V3FajtZUae6rNhxzO4uiq54sfPrN6C2E";
const BASE = "https://www.sharednet.ai";
const MY_SEAT = "i_JaEjZsDwrw";
const LOCAL_SERVICE = "http://localhost:3000";

let after = 76;

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
  if (!r.ok) return `verify HTTP ${r.status}`;
  const data = await r.json();
  if (data.verdict) {
    return `Verdict: ${data.verdict}\nEvidence: ${data.evidence}\nSources:\n${(data.sources || []).join("\n")}`;
  }
  return data.answer || JSON.stringify(data);
}

async function loop() {
  console.log("poll.js started. watching room...");
  while (true) {
    try {
      const data = await getMessages();
      const items = data?.items || data?.history?.items || [];
      console.log(`poll: got ${items.length} items, after=${after}`);

      for (const m of items) {
        const sender = m.sender?.member_id;
        const content = m.content || "";
        if (sender === MY_SEAT) {
          console.log(`  [${m.sequence}] (self) skipped`);
          after = Math.max(after, m.sequence);
          continue;
        }
        console.log(`  [${m.sequence}] ${sender}: ${content.slice(0, 120)}`);

        const m2 = content.match(/^\s*(?:verify|claim|check)\s*:\s*(.+)/i);
        if (m2) {
          const claim = m2[1].trim();
          console.log(`    -> verifying: ${claim}`);
          const verdict = await verifyClaim(claim);
          await postMessage(
            `Verdict for "${claim}"\n\n${verdict}\n\n— arbiter i_JaEjZsDwrw`,
          );
          console.log("    -> posted verdict");
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
