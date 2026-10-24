#!/usr/bin/env node
// CLI: node src/monitor.mjs report <address> [--chain 56] [--threshold 1.2]
//      node src/monitor.mjs plan   <address>   -> report + the protective tx (unsigned) and the `baw` command to sign it
import { healthReport, actions } from "./venus.mjs";
const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [cmd = "report", account] = args;
const chainId = Number(opt("--chain", 56));
const threshold = Number(opt("--threshold", 1.2));
const wallet = opt("--from", process.env.AGENT_WALLET || "0x998803104673C36cc7fD13F899Cf2C9c99E5A4f1");
if (!account) { console.error("usage: monitor.mjs report|plan <address> [--chain 56] [--threshold 1.2]"); process.exit(1); }
const rep = await healthReport(account, { chainId, threshold, rpcUrl: process.env.RPC_URL });
if (cmd === "report") { console.log(JSON.stringify(rep, null, 2)); process.exit(rep.status === "LIQUIDATABLE" ? 2 : 0); }
if (cmd === "plan") {
  const ra = rep.recommendedAction;
  const tx = ra.type === "check-in" ? actions.accrueInterest(rep.positions[0]?.market || VUSDT)
    : actions.repayBorrow(ra.market, process.env.REPAY_RAW || "0");
  console.log(JSON.stringify({ report: rep, tx,
    sign: `baw contract-call preview --binanceChainId ${chainId} --from ${wallet} --to ${tx.to} --value 0 --inputData ${tx.data} --json  # then: baw contract-call execute --requestId <id>` }, null, 2));
}
