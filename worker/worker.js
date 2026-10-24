// Cloudflare Worker variant (free tier): `npx wrangler deploy` from repo root.
import { healthReport } from "../src/venus.mjs";
import card from "../agent-card.json";
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
export default {
  async fetch(req) {
    const u = new URL(req.url);
    try {
      if (u.pathname === "/" || u.pathname.startsWith("/.well-known/")) return json(card);
      if (u.pathname === "/health") return json({ ok: true, agent: card.name, at: new Date().toISOString() });
      const m = u.pathname.match(/^\/report\/(0x[0-9a-fA-F]{40})$/);
      if (m) return json(await healthReport(m[1], { chainId: Number(u.searchParams.get("chain") || 56) }));
      if (u.pathname === "/a2a" && req.method === "POST") {
        const j = await req.json().catch(() => ({}));
        const addr = JSON.stringify(j).match(/0x[0-9a-fA-F]{40}/)?.[0];
        if (!addr) return json({ jsonrpc: "2.0", id: j.id ?? null, result: { kind: "message", role: "agent", parts: [{ kind: "text", text: "Send a BNB Chain address to get its Venus health factor." }] } });
        return json({ jsonrpc: "2.0", id: j.id ?? null, result: { kind: "message", role: "agent", parts: [{ kind: "data", data: await healthReport(addr) }] } });
      }
      return json({ error: "not found" }, 404);
    } catch (e) { return json({ error: String(e.message || e) }, 500); }
  },
};
