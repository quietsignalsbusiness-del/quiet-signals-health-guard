// Minimal HTTP endpoint so the agent "responds when invoked".
//   GET  /                      -> agent card
//   GET  /health                -> liveness
//   GET  /report/<address>      -> Venus health-factor JSON report (?chain=56&threshold=1.2)
//   POST /a2a  {"params":{"message":{"parts":[{"text":"0x..."}]}}}  -> A2A-style reply with the report
import http from "node:http";
import { readFileSync } from "node:fs";
import { healthReport } from "./venus.mjs";
const card = JSON.parse(readFileSync(new URL("../agent-card.json", import.meta.url)));
const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(obj)); };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  try {
    if (u.pathname === "/" || u.pathname.startsWith("/.well-known/")) return send(res, 200, card);
    if (u.pathname === "/health") return send(res, 200, { ok: true, agent: card.name, at: new Date().toISOString() });
    const m = u.pathname.match(/^\/report\/(0x[0-9a-fA-F]{40})$/);
    if (m) return send(res, 200, await healthReport(m[1], { chainId: Number(u.searchParams.get("chain") || 56), threshold: Number(u.searchParams.get("threshold") || 1.2) }));
    if (u.pathname === "/a2a" && req.method === "POST") {
      let body = ""; for await (const c of req) body += c;
      const j = JSON.parse(body || "{}");
      const text = JSON.stringify(j.params?.message || j);
      const addr = text.match(/0x[0-9a-fA-F]{40}/)?.[0];
      if (!addr) return send(res, 200, { jsonrpc: "2.0", id: j.id ?? null, result: { kind: "message", role: "agent", parts: [{ kind: "text", text: "Send a BNB Chain address to get its Venus health factor." }] } });
      const rep = await healthReport(addr);
      return send(res, 200, { jsonrpc: "2.0", id: j.id ?? null, result: { kind: "message", role: "agent", parts: [{ kind: "data", data: rep }] } });
    }
    send(res, 404, { error: "not found" });
  } catch (e) { send(res, 500, { error: String(e.message || e) }); }
}).listen(process.env.PORT || 8787, () => console.log("health-guard listening on", process.env.PORT || 8787));
