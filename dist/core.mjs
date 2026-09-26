export const EXCHANGE_DEFAULTS = {
  binance: {
    name: "Binance", quotePerp: "USDT", quoteSpot: "USDT",
    perp: { maker: 0.0002, taker: 0.0005, minQty: 0.001, qtyStep: 0.001, minNotional: 50, maxLeverage: 125, maintenanceMarginRate: 0.4 },
    spot: { maker: 0.001, taker: 0.001, minQty: 0.00001, qtyStep: 0.00001, minNotional: 5, maxLeverage: 1 }
  },
  okx: {
    name: "OKX", quotePerp: "USDT", quoteSpot: "USDT",
    perp: { maker: 0.0002, taker: 0.0005, minQty: 0.0001, qtyStep: 0.0001, minNotional: 1, maxLeverage: 100, maintenanceMarginRate: 0.4 },
    spot: { maker: 0.0008, taker: 0.001, minQty: 0.00001, qtyStep: 0.00001, minNotional: 1, maxLeverage: 1 }
  },
  bitget: {
    name: "Bitget", quotePerp: "USDT", quoteSpot: "USDT",
    perp: { maker: 0.0002, taker: 0.0006, minQty: 0.001, qtyStep: 0.001, minNotional: 5, maxLeverage: 125, maintenanceMarginRate: 0.4 },
    spot: { maker: 0.001, taker: 0.001, minQty: 0.00001, qtyStep: 0.00001, minNotional: 1, maxLeverage: 1 }
  },
  bybit: {
    name: "Bybit", quotePerp: "USDT", quoteSpot: "USDT",
    perp: { maker: 0.0002, taker: 0.00055, minQty: 0.001, qtyStep: 0.001, minNotional: 100, maxLeverage: 100, maintenanceMarginRate: 0.5 },
    spot: { maker: 0.001, taker: 0.001, minQty: 0.00001, qtyStep: 0.00001, minNotional: 1, maxLeverage: 1 }
  },
  hyperliquid: {
    name: "Hyperliquid", quotePerp: "USDC", quoteSpot: "USDC",
    perp: { maker: 0.00015, taker: 0.00045, minQty: 0.00001, qtyStep: 0.00001, minNotional: 10, maxLeverage: 40, maintenanceMarginRate: 1.25 },
    spot: { maker: 0.0004, taker: 0.0007, minQty: 0.00001, qtyStep: 0.00001, minNotional: 10, maxLeverage: 1 }
  }
};

const EPS = 1e-12;
const finitePositive = (value) => Number.isFinite(value) && value > 0;
const countDecimals = (value) => {
  const text = Number(value).toString().toLowerCase();
  if (text.includes("e-")) return Number(text.split("e-")[1]);
  return (text.split(".")[1] || "").length;
};

export function floorToStep(value, step) {
  if (!finitePositive(value) || !finitePositive(step)) return 0;
  const decimals = Math.min(12, countDecimals(step));
  const factor = 10 ** decimals;
  const scaledStep = Math.round(step * factor);
  return Math.floor((value * factor + EPS) / scaledStep) * scaledStep / factor;
}

export function quoteAmountToBaseQty(quoteAmount, executionPrice, quantityStep) {
  if (!finitePositive(quoteAmount) || !finitePositive(executionPrice) || !finitePositive(quantityStep)) return 0;
  return floorToStep(quoteAmount / executionPrice, quantityStep);
}

export function normalizeInput(raw) {
  const numeric = ["equity", "riskPct", "entry", "stop", "target", "leverage", "entryFee", "exitFee", "slippagePct", "fundingCost", "existingRisk", "maxMarginPct", "minQty", "qtyStep", "minNotional", "maxLeverage", "maintenanceMarginRate", "maintenanceDeduction", "extraMargin"];
  const result = { ...raw };
  for (const key of numeric) result[key] = Number(raw[key]);
  result.symbol = String(raw.symbol || "").trim().toUpperCase();
  return result;
}

export function calculatePosition(raw) {
  const p = normalizeInput(raw);
  const fatal = [];
  const requiredPositive = ["equity", "riskPct", "entry", "stop", "target", "leverage", "qtyStep"];
  const fieldNames = { equity: "账户权益", riskPct: "单笔风险", entry: "开仓价格", stop: "止损价格", target: "止盈价格", leverage: "杠杆", qtyStep: "数量步长" };
  for (const key of requiredPositive) if (!finitePositive(p[key])) fatal.push(`${fieldNames[key]}必须大于 0`);
  if (!p.symbol) fatal.push("请输入标的");
  if (fatal.length) return { ok: false, fatal };

  const inferredDirection = p.stop < p.entry ? "long" : p.stop > p.entry ? "short" : null;
  const direction = p.direction === "auto" ? inferredDirection : p.direction;
  if (!direction) fatal.push("止损价格不能等于开仓价格");
  if (direction === "long" && p.stop >= p.entry) fatal.push("做多的止损必须低于开仓价");
  if (direction === "short" && p.stop <= p.entry) fatal.push("做空的止损必须高于开仓价");
  if (direction === "long" && p.target <= p.entry) fatal.push("做多的止盈必须高于开仓价");
  if (direction === "short" && p.target >= p.entry) fatal.push("做空的止盈必须低于开仓价");
  if (p.market === "spot" && direction === "short") fatal.push("普通现货不能直接做空；请改用永续合约或支持借币的杠杆账户");
  if (p.market === "spot" && p.leverage !== 1) fatal.push("普通现货的杠杆必须设为 1 倍");
  if (p.riskPct > 100) fatal.push("单笔风险不能超过账户权益的 100%");
  if (p.entryFee >= 100 || p.exitFee >= 100 || p.slippagePct >= 100) fatal.push("费率和滑点必须小于 100%");
  if (fatal.length) return { ok: false, fatal };

  const riskBudgetGross = p.equity * p.riskPct / 100;
  const riskBudget = Math.max(0, riskBudgetGross - Math.max(0, p.existingRisk || 0));
  if (riskBudget <= 0) return { ok: false, fatal: ["已占用风险不低于本次风险预算，不能再开新仓"] };

  const entryFeeRate = Math.max(0, p.entryFee) / 100;
  const exitFeeRate = Math.max(0, p.exitFee) / 100;
  const slipRate = Math.max(0, p.slippagePct) / 100;
  const priceRiskPerUnit = Math.abs(p.entry - p.stop);
  const feeRiskPerUnit = p.entry * entryFeeRate + p.stop * exitFeeRate;
  const slipRiskPerUnit = (p.entry + p.stop) * slipRate;
  const fundingDebit = Math.max(0, p.fundingCost || 0);
  const availableForVariableRisk = riskBudget - fundingDebit;
  const riskPerUnit = priceRiskPerUnit + feeRiskPerUnit + slipRiskPerUnit;
  if (availableForVariableRisk <= 0 || !finitePositive(riskPerUnit)) return { ok: false, fatal: ["固定资金费已用完风险预算，或每单位风险无效"] };

  const quantityByRiskRaw = availableForVariableRisk / riskPerUnit;
  const marginLimit = p.equity * Math.max(0, p.maxMarginPct) / 100;
  const quantityByCapitalRaw = p.market === "spot"
    ? marginLimit / (p.entry * (1 + entryFeeRate + slipRate))
    : marginLimit * p.leverage / p.entry;
  const bindingLimit = Math.min(quantityByRiskRaw, quantityByCapitalRaw);
  const quantity = floorToStep(bindingLimit, p.qtyStep);
  if (!finitePositive(quantity)) return { ok: false, fatal: ["按当前风险与数量步长向下取整后为 0，无法下单"] };

  const entryNotional = quantity * p.entry;
  const stopNotional = quantity * p.stop;
  const targetNotional = quantity * p.target;
  const priceLoss = quantity * priceRiskPerUnit;
  const entryFeeAmount = entryNotional * entryFeeRate;
  const stopFeeAmount = stopNotional * exitFeeRate;
  const feeLoss = entryFeeAmount + stopFeeAmount;
  const slippageLoss = quantity * slipRiskPerUnit;
  // A projected funding credit is not allowed to reduce the stop-loss risk budget.
  // It may improve the target-side estimate, but the risk side stays conservative.
  const fundingNetCost = p.fundingCost || 0;
  const fundingCost = Math.max(0, fundingNetCost);
  const worstCaseLoss = priceLoss + feeLoss + slippageLoss + fundingCost;
  const margin = p.market === "spot" ? entryNotional + entryFeeAmount : entryNotional / p.leverage;
  const grossProfit = quantity * Math.abs(p.target - p.entry);
  const targetExitFee = targetNotional * exitFeeRate;
  const profitSlippage = quantity * (p.entry + p.target) * slipRate;
  const netProfit = grossProfit - entryFeeAmount - targetExitFee - profitSlippage - fundingNetCost;
  const rewardRisk = worstCaseLoss > 0 ? netProfit / worstCaseLoss : 0;
  const stopDistancePct = priceRiskPerUnit / p.entry * 100;
  const marginSharePct = margin / p.equity * 100;
  const riskUsedPct = worstCaseLoss / riskBudget * 100;
  const roePct = netProfit / p.equity * 100;
  const breakEvenPriceRaw = direction === "long"
    ? (p.entry * (1 + entryFeeRate + slipRate) + fundingNetCost / quantity) / (1 - exitFeeRate - slipRate)
    : (p.entry * (1 - entryFeeRate - slipRate) - fundingNetCost / quantity) / (1 + exitFeeRate + slipRate);
  const breakEvenPrice = Math.max(0, breakEvenPriceRaw);
  const mmr = Math.max(0, p.maintenanceMarginRate || 0) / 100;
  const mmDeduction = Math.max(0, p.maintenanceDeduction || 0);
  const extraMargin = Math.max(0, p.extraMargin || 0);
  let liquidationPrice = null;
  if (p.market === "perp" && p.marginMode !== "cross") {
    const marginBalance = entryNotional / p.leverage + extraMargin;
    const denominator = direction === "long"
      ? quantity * (1 - mmr - exitFeeRate)
      : quantity * (1 + mmr + exitFeeRate);
    const numerator = direction === "long"
      ? entryNotional - marginBalance - mmDeduction
      : entryNotional + marginBalance + mmDeduction;
    if (denominator > 0) liquidationPrice = Math.max(0, numerator / denominator);
  }
  const liquidationDistancePct = liquidationPrice == null ? null : Math.abs(p.entry - liquidationPrice) / p.entry * 100;
  const minRequiredQty = Math.max(p.minQty || 0, (p.minNotional || 0) / p.entry);
  const minTradableQty = finitePositive(minRequiredQty) ? Math.ceil((minRequiredQty - EPS) / p.qtyStep) * p.qtyStep : 0;

  const checks = [];
  const add = (level, text) => checks.push({ level, text });
  if (quantity + EPS < minTradableQty) add("error", `交易所要求至少下 ${minTradableQty} ${p.symbol}，但按你的风险上限只能下 ${quantity} ${p.symbol}。这笔单先不要开，更不要为了凑最低数量而加仓。`);
  if (p.leverage > p.maxLeverage) add("error", `你填了 ${p.leverage} 倍杠杆，但当前规则最多允许 ${p.maxLeverage} 倍。请把杠杆调低。`);
  if (margin > p.equity + EPS) add("error", `预计需要 ${margin.toFixed(2)}，已经超过账户里的 ${p.equity.toFixed(2)}，余额不够开这笔仓。`);
  else if (marginSharePct > p.maxMarginPct + .01) add("warn", `这笔仓会占用约 ${marginSharePct.toFixed(1)}% 的本金，已经碰到你设置的资金占用上限。`);
  if (rewardRisk < 1) add("warn", `每承担 1 元风险，计划净赚只有 ${Math.max(0, rewardRisk).toFixed(2)} 元，赚的不够覆盖一次亏损。`);
  else if (rewardRisk < 1.5) add("warn", `每承担 1 元风险，计划净赚约 ${rewardRisk.toFixed(2)} 元，容错空间比较小。`);
  if (p.riskPct > 3) add("warn", `你准备一笔最多亏本金的 ${p.riskPct.toFixed(1)}%，连续亏几次时账户会掉得很快。`);
  if (p.leverage > 20) add("warn", `${p.leverage} 倍属于高杠杆，离强平更近；行情快速跳动时，止损不一定能按设定价成交。`);
  if (stopDistancePct < (entryFeeRate + exitFeeRate + 2 * slipRate) * 100) add("warn", "止损空间比来回交易成本还小，价格即使方向判断没错，也可能被手续费和滑点吃掉。该策略不适合现在的参数。" );
  if (p.fundingCost === 0 && p.market === "perp") add("warn", "你还没填写资金费。短线且不跨资金费时点影响较小；持仓较久时请补上预计金额。" );
  if (quantityByCapitalRaw + EPS < quantityByRiskRaw) add("warn", `为了不占用太多本金，系统主动把仓位压小了，所以这次不会用满 ${riskBudget.toFixed(2)} 的风险额度。`);
  if (liquidationPrice != null) {
    const stopBeforeLiq = direction === "long" ? p.stop > liquidationPrice : p.stop < liquidationPrice;
    if (!stopBeforeLiq) add("error", `预计强平价约 ${liquidationPrice.toFixed(2)}，会比你的止损更早触发。请降低杠杆或把止损放在强平价之前。`);
    else if (Math.abs(p.stop - liquidationPrice) / p.entry < 0.01) add("warn", "止损价离预计强平价太近，剧烈波动时可能来不及止损就先被强平。" );
    else add("ok", "你的止损在预计强平价之前。止损单正常成交时，会先止损，而不是等到强平。" );
  } else if (p.market === "perp") add("warn", "全仓模式会把账户余额和其他仓位一起计算。只靠本页输入无法可靠估算强平价，请以交易所显示为准。" );
  if (!checks.some((item) => item.level === "error")) add("ok", `最坏预估亏损约 ${worstCaseLoss.toFixed(2)}，没有超过本次可用风险额度 ${riskBudget.toFixed(2)}。`);

  return {
    ok: true, p, direction, quantity, quantityByRiskRaw, quantityByCapitalRaw,
    entryNotional, margin, marginSharePct, riskBudgetGross, riskBudget,
    priceLoss, feeLoss, slippageLoss, fundingCost, fundingNetCost, worstCaseLoss, riskUsedPct,
    entryFeeAmount, stopFeeAmount, targetExitFee, netProfit, rewardRisk,
    stopDistancePct, roePct, breakEvenPrice, liquidationPrice, liquidationDistancePct,
    maintenanceMarginRate: mmr * 100, minTradableQty, checks,
    binding: quantityByCapitalRaw + EPS < quantityByRiskRaw ? "capital" : "risk"
  };
}

export function makeDefaultState(exchange = "binance", market = "perp") {
  const config = EXCHANGE_DEFAULTS[exchange][market];
  return {
    exchange, market, symbol: "BTC", direction: "auto", equity: 10000, riskPct: 1,
    entry: 100000, stop: 98000, target: 106000, leverage: market === "spot" ? 1 : 5,
    entryOrderType: "taker", exitOrderType: "taker",
    entryFee: config.taker * 100, exitFee: config.taker * 100, slippagePct: 0.03,
    fundingCost: 0, existingRisk: 0, maxMarginPct: market === "spot" ? 100 : 30,
    minQty: config.minQty, qtyStep: config.qtyStep, minNotional: config.minNotional,
    maxLeverage: config.maxLeverage,
    marginMode: market === "perp" ? "isolated" : "spot",
    maintenanceMarginRate: config.maintenanceMarginRate || 0,
    maintenanceDeduction: 0,
    extraMargin: 0
  };
}
