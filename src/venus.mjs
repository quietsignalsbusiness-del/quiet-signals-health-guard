// Venus Core Pool (BNB Chain) health-factor reader. Zero dependencies: Node 18+ / Workers fetch.
export const VENUS = {
  56: { comptroller: "0xfD36E2c2a6789Db23113685031d7F16329158384", rpc: "https://bsc-dataseed.bnbchain.org" },
  97: { comptroller: "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D", rpc: "https://data-seed-prebsc-1-s1.bnbchain.org:8545" },
};
const SEL = {
  getAccountLiquidity: "0x5ec88c79", getAssetsIn: "0xabfceffc", oracle: "0x7dc0d1d0",
  markets: "0x8e8f294b", getAccountSnapshot: "0xc37f68e2", getUnderlyingPrice: "0xfc57d4df",
  symbol: "0x95d89b41", accrueInterest: "0xa6afed95", enterMarkets: "0xc2998238",
  exitMarket: "0xede4edd0", repayBorrow: "0x0e752702",
};
const pad = (h) => h.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const addrArg = (a) => pad(a);
const words = (hex) => (hex.replace(/^0x/, "").match(/.{64}/g) || []).map((w) => BigInt("0x" + w));

const FALLBACK = { 56: ["https://bsc-dataseed1.bnbchain.org", "https://bsc-dataseed2.defibit.io", "https://bsc-rpc.publicnode.com"],
  97: ["https://bsc-testnet-rpc.publicnode.com", "https://data-seed-prebsc-2-s1.bnbchain.org:8545"] };
let RPCS = [];
async function rpc(url, method, params) {
  let last;
  for (const u of [url, ...RPCS.filter((x) => x !== url)]) {
    for (let k = 0; k < 2; k++) {
      try {
        const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
        const j = await r.json();
        if (j.error) { last = new Error(`${method}: ${j.error.message}`); if (/limit|rate/i.test(j.error.message)) continue; throw last; }
        return j.result;
      } catch (e) { last = e; if (/execution reverted/.test(String(e))) throw e; await new Promise((s) => setTimeout(s, 400 * (k + 1))); }
    }
  }
  throw last;
}
const call = (url, to, data) => rpc(url, "eth_call", [{ to, data }, "latest"]);

function decodeString(hex) {
  const b = hex.replace(/^0x/, "");
  if (b.length === 64) return Buffer.from(b, "hex").toString().replace(/\0+$/, "");
  const len = Number(BigInt("0x" + b.slice(64, 128)));
  return Buffer.from(b.slice(128, 128 + len * 2), "hex").toString();
}
const toNum = (x, dec = 18) => Number(x) / 10 ** dec;

/** Full health-factor report for `account` on Venus Core Pool. */
export async function healthReport(account, { chainId = 56, rpcUrl, threshold = 1.2 } = {}) {
  const cfg = VENUS[chainId];
  if (!cfg) throw new Error(`unsupported chain ${chainId}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(account)) throw new Error("bad address");
  const url = rpcUrl || cfg.rpc;
  RPCS = [cfg.rpc, ...FALLBACK[chainId]];
  const C = cfg.comptroller;
  const [liqHex, assetsHex, oracleHex, block] = await Promise.all([
    call(url, C, SEL.getAccountLiquidity + addrArg(account)),
    call(url, C, SEL.getAssetsIn + addrArg(account)),
    call(url, C, SEL.oracle),
    rpc(url, "eth_blockNumber", []),
  ]);
  const [err, liquidity, shortfall] = words(liqHex);
  const oracle = "0x" + oracleHex.slice(-40);
  const aw = words(assetsHex);
  const markets = aw.slice(2, 2 + Number(aw[1] || 0n)).map((w) => "0x" + w.toString(16).padStart(40, "0"));

  let collateralUsd = 0, weightedCfUsd = 0, weightedLtUsd = 0, borrowUsd = 0;
  const positions = [];
  for (const m of markets) {
    const [snap, price, mk, sym] = await Promise.all([
      call(url, m, SEL.getAccountSnapshot + addrArg(account)),
      call(url, oracle, SEL.getUnderlyingPrice + addrArg(m)),
      call(url, C, SEL.markets + addrArg(m)),
      call(url, m, SEL.symbol).catch(() => "0x"),
    ]);
    const [, vBal, borrowBal, exRate] = words(snap);
    const p = BigInt(price);
    const mw = words(mk);
    const cf = toNum(mw[1] || 0n);
    // Newer Venus comptrollers expose a liquidation threshold as the 4th field; fall back to CF.
    const ltRaw = mw.length >= 4 ? toNum(mw[3]) : 0;
    const lt = ltRaw > 0 && ltRaw <= 1 ? ltRaw : cf;
    const supplyUsd = toNum((vBal * exRate / 10n ** 18n) * p / 10n ** 18n);
    const debtUsd = toNum(borrowBal * p / 10n ** 18n);
    collateralUsd += supplyUsd; weightedCfUsd += supplyUsd * cf; weightedLtUsd += supplyUsd * lt; borrowUsd += debtUsd;
    positions.push({ market: m, symbol: sym === "0x" ? null : decodeString(sym), supplyUsd: +supplyUsd.toFixed(4),
      borrowUsd: +debtUsd.toFixed(4), collateralFactor: cf, liquidationThreshold: lt });
  }
  const healthFactor = borrowUsd > 0 ? weightedLtUsd / borrowUsd : null;
  const borrowLimitUsed = weightedCfUsd > 0 ? borrowUsd / weightedCfUsd : null;
  let status = "NO_DEBT";
  if (borrowUsd > 0) status = shortfall > 0n ? "LIQUIDATABLE" : healthFactor < threshold ? "AT_RISK" : "HEALTHY";
  return {
    agent: "quiet-signals-health-guard", category: "health factor", protocol: "Venus Core Pool",
    chainId, block: Number(block), account, threshold,
    comptrollerError: Number(err), liquidityUsd: toNum(liquidity), shortfallUsd: toNum(shortfall),
    collateralUsd: +collateralUsd.toFixed(4), borrowUsd: +borrowUsd.toFixed(4),
    healthFactor: healthFactor === null ? null : +healthFactor.toFixed(4),
    borrowLimitUsed: borrowLimitUsed === null ? null : +borrowLimitUsed.toFixed(4),
    status, positions, recommendedAction: recommend(status, positions), at: new Date().toISOString(),
  };
}

function recommend(status, positions) {
  if (status === "NO_DEBT" || status === "HEALTHY") return { type: "check-in", note: "Refresh interest index (accrueInterest) and keep watching." };
  const debt = positions.filter((p) => p.borrowUsd > 0).sort((a, b) => b.borrowUsd - a.borrowUsd)[0];
  return { type: status === "LIQUIDATABLE" ? "urgent-repay" : "repay", market: debt?.market, symbol: debt?.symbol,
    note: "Repay part of the largest debt (repayBorrow) or add collateral to lift HF above threshold." };
}

/** Unsigned calldata for protective actions. Value is always 0 (no BNB sent). */
export const actions = {
  accrueInterest: (vToken) => ({ to: vToken, value: "0", data: SEL.accrueInterest }),
  enterMarkets: (chainId, vTokens) => ({ to: VENUS[chainId].comptroller, value: "0",
    data: SEL.enterMarkets + pad("20") + pad(vTokens.length.toString(16)) + vTokens.map(pad).join("") }),
  exitMarket: (chainId, vToken) => ({ to: VENUS[chainId].comptroller, value: "0", data: SEL.exitMarket + pad(vToken) }),
  repayBorrow: (vToken, amountRaw) => ({ to: vToken, value: "0", data: SEL.repayBorrow + pad(BigInt(amountRaw).toString(16)) }),
};
