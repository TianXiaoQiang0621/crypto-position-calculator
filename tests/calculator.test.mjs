import assert from "node:assert/strict";
import { calculatePosition, floorToStep, makeDefaultState, quoteAmountToBaseQty } from "../dist/core.js";

const approx = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);

assert.equal(floorToStep(1.234567, 0.001), 1.234);
assert.equal(floorToStep(0.009999999, 0.0001), 0.0099);
assert.equal(quoteAmountToBaseQty(837.13, 83713, 0.001), 0.01);
assert.equal(quoteAmountToBaseQty(837.13, 83923.7, 0.001), 0.009, "market price change explains the exchange screenshot");

const base = makeDefaultState("binance", "perp");
const long = calculatePosition(base);
assert.equal(long.ok, true);
assert.equal(long.direction, "long");
assert.equal(long.quantity, 0.046);
approx(long.priceLoss, 92);
approx(long.entryFeeAmount, 2.3);
approx(long.stopFeeAmount, 2.254);
approx(long.slippageLoss, 2.7324);
approx(long.worstCaseLoss, 99.2864);
assert.ok(long.worstCaseLoss <= long.riskBudget);
assert.equal(long.entryNotional, 4600);
assert.equal(long.margin, 920);

const short = calculatePosition({ ...base, direction: "short", entry: 100, stop: 105, target: 85, qtyStep: 0.01, minQty: 0.01, minNotional: 5, slippagePct: 0, entryFee: 0.05, exitFee: 0.05 });
assert.equal(short.ok, true);
assert.equal(short.direction, "short");
assert.ok(short.worstCaseLoss <= short.riskBudget);
assert.ok(short.netProfit > 0);

const spot = calculatePosition({ ...base, market: "spot", leverage: 1, maxMarginPct: 100, entry: 100, stop: 90, target: 120, qtyStep: 0.001, minQty: 0.001, minNotional: 5, entryFee: 0.1, exitFee: 0.1, slippagePct: 0 });
assert.equal(spot.ok, true);
approx(spot.margin, spot.entryNotional + spot.entryFeeAmount);

const badLong = calculatePosition({ ...base, direction: "long", stop: 101000 });
assert.equal(badLong.ok, false);

const spotShort = calculatePosition({ ...base, market: "spot", direction: "short", entry: 100, stop: 110, target: 80 });
assert.equal(spotShort.ok, false);

const minOrder = calculatePosition({ ...base, equity: 10, riskPct: 0.1, minQty: 1, qtyStep: 1, minNotional: 100 });
assert.equal(minOrder.ok, false);

const capitalBound = calculatePosition({ ...base, riskPct: 10, maxMarginPct: 5 });
assert.equal(capitalBound.ok, true);
assert.equal(capitalBound.binding, "capital");
assert.ok(capitalBound.marginSharePct <= 5 + 1e-9);

const fundingCredit = calculatePosition({ ...base, fundingCost: -1000 });
assert.equal(fundingCredit.ok, true);
assert.equal(fundingCredit.fundingCost, 0);
assert.equal(fundingCredit.quantity, long.quantity, "a projected funding credit must not enlarge size");
assert.ok(fundingCredit.netProfit > long.netProfit);

const belowMinimum = calculatePosition({ ...base, equity: 100, riskPct: 1, entry: 100, stop: 95, target: 115, qtyStep: 0.01, minQty: 1, minNotional: 100, slippagePct: 0 });
assert.equal(belowMinimum.ok, true);
assert.ok(belowMinimum.checks.some((check) => check.level === "error" && check.text.includes("至少下")));

assert.ok(long.breakEvenPrice > long.p.entry, "long break-even must include trading costs");
assert.ok(long.liquidationPrice < long.p.entry, "long liquidation should be below entry");
assert.ok(long.liquidationPrice < long.p.stop, "default stop should trigger before liquidation");
const cross = calculatePosition({ ...base, marginMode: "cross" });
assert.equal(cross.ok, true);
assert.equal(cross.liquidationPrice, null, "cross liquidation cannot be derived from one position alone");
const shortBreakEven = calculatePosition({ ...base, direction: "short", entry: 100, stop: 105, target: 85, qtyStep: .01, minQty: .01, minNotional: 5 });
assert.ok(shortBreakEven.breakEvenPrice < shortBreakEven.p.entry, "short break-even must include trading costs");
assert.ok(shortBreakEven.liquidationPrice > shortBreakEven.p.entry, "short liquidation should be above entry");

const beginner300 = calculatePosition({ ...base, symbol: "ETH", equity: 300, riskPct: 1, entry: 4000, stop: 3920, target: 4240, leverage: 5, minQty: .001, qtyStep: .001, minNotional: 5 });
assert.equal(beginner300.ok, true);
assert.ok(beginner300.quantity > 0);
assert.ok(beginner300.worstCaseLoss <= 3);
assert.ok(!beginner300.checks.some((check) => check.level === "error"));

const screenshotCase = calculatePosition({ ...base, equity: 300, riskPct: 30, entry: 83713, stop: 86543, target: 76698, leverage: 10, maxMarginPct: 30, minNotional: 50 });
assert.equal(screenshotCase.ok, true);
assert.equal(screenshotCase.direction, "short");
assert.equal(screenshotCase.quantity, 0.01);
approx(screenshotCase.entryNotional, 837.13);
approx(screenshotCase.margin, 83.713);

// Deterministic property sweep: any accepted risk-bound order must remain at or below its budget,
// sit exactly on the exchange quantity grid, and never exceed the configured capital allocation.
let seed = 20260926;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
for (let i = 0; i < 10000; i += 1) {
  const entry = 10 + random() * 200000;
  const longDirection = random() > 0.5;
  const stopDistance = 0.002 + random() * 0.18;
  const targetDistance = 0.003 + random() * 0.4;
  const candidate = calculatePosition({
    ...base,
    direction: longDirection ? "long" : "short",
    equity: 100 + random() * 1000000,
    riskPct: 0.1 + random() * 4.9,
    entry,
    stop: longDirection ? entry * (1 - stopDistance) : entry * (1 + stopDistance),
    target: longDirection ? entry * (1 + targetDistance) : entry * (1 - targetDistance),
    leverage: 1 + Math.floor(random() * 20),
    qtyStep: [1, 0.1, 0.01, 0.001, 0.0001][Math.floor(random() * 5)],
    minQty: 0,
    minNotional: 0,
    maxMarginPct: 5 + random() * 95,
    slippagePct: random() * 0.1,
    entryFee: random() * 0.1,
    exitFee: random() * 0.1,
    fundingCost: 0
  });
  if (!candidate.ok) continue;
  assert.ok(candidate.worstCaseLoss <= candidate.riskBudget + 1e-6, "risk budget exceeded");
  assert.ok(candidate.marginSharePct <= candidate.p.maxMarginPct + 1e-6, "capital allocation exceeded");
  const stepUnits = candidate.quantity / candidate.p.qtyStep;
  assert.ok(Math.abs(stepUnits - Math.round(stepUnits)) < 1e-7, "quantity is off-grid");
}

console.log("calculator core: all tests passed");
