import { EXCHANGE_DEFAULTS, calculatePosition, makeDefaultState, quoteAmountToBaseQty } from "./core.js?v=20260927-1";

const $ = (id) => document.getElementById(id);
const ids = ["exchange", "market", "equity", "riskPct", "entry", "stop", "target", "leverage", "entryOrderType", "exitOrderType", "entryFee", "exitFee", "slippagePct", "fundingCost", "existingRisk", "maxMarginPct", "minQty", "qtyStep", "minNotional", "maxLeverage", "marginMode", "maintenanceMarginRate", "maintenanceDeduction", "extraMargin"];
const form = $("calculatorForm");
const dialog = $("infoDialog");
let latestResult = null;
let activeRule = null;

const POPULAR_SYMBOLS = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK", "SUI", "TRX", "LTC", "BCH", "DOT", "APT", "NEAR", "UNI", "AAVE", "OP", "ARB", "PEPE", "WIF", "HYPE"];
const BUILTIN_RULES = {
  binance: {
    BTC: [.001,.001,50,125], ETH: [.001,.001,5,100], SOL: [.01,.01,5,75], XRP: [.1,.1,5,75], BNB: [.01,.01,5,75], DOGE: [1,1,5,75], SUI: [.1,.1,5,50]
  },
  okx: {
    BTC: [.0001,.0001,0,100,.01,.01], ETH: [.001,.001,0,100,.1,.01], SOL: [.01,.01,0,100,1,.01], XRP: [1,1,0,100,100,.01], BNB: [.01,.01,0,50,.01,1], DOGE: [10,10,0,50,1000,.01], SUI: [1,1,0,50,1,1]
  },
  bitget: {
    BTC: [.0001,.0001,5,150], ETH: [.01,.01,5,150], SOL: [.1,.1,5,100], XRP: [1,1,5,125], BNB: [.01,.01,5,75], DOGE: [1,1,5,75], SUI: [.1,.1,5,75]
  },
  bybit: {
    BTC: [.001,.001,100,100], ETH: [.01,.01,5,100], SOL: [.1,.1,5,100], XRP: [1,1,5,75], BNB: [.01,.01,5,75], DOGE: [1,1,5,75], SUI: [.1,.1,5,50]
  },
  hyperliquid: {
    BTC: [.00001,.00001,10,40], ETH: [.0001,.0001,10,25], SOL: [.01,.01,10,20], XRP: [1,1,10,20], BNB: [.001,.001,10,10], DOGE: [1,1,10,10], SUI: [.1,.1,10,10]
  }
};

const num = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const compact = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 8 });
const money = (value) => num.format(Number.isFinite(value) ? value : 0);
const percent = (value, digits = 2) => `${Number(value).toFixed(digits)}%`;
const plainNumber = (value, digits = 12) => Number(value).toFixed(digits).replace(/\.?0+$/, "");

function readState() {
  const state = Object.fromEntries(ids.map((id) => [id, $(id).value]));
  state.direction = form.elements.direction.value;
  state.symbol = currentSymbol();
  return state;
}

function setValue(id, value) { if ($(id)) $(id).value = value; }

function applyState(state) {
  const symbol = String(state.symbol || "BTC").toUpperCase();
  if (POPULAR_SYMBOLS.includes(symbol)) {
    setValue("symbolPreset", symbol);
    $("customSymbolField").hidden = true;
  } else {
    setValue("symbolPreset", "custom");
    $("customSymbolField").hidden = false;
    setValue("symbol", symbol);
  }
  for (const [key, value] of Object.entries(state)) {
    if (key === "symbol") continue;
    if (key === "direction") {
      const radio = form.querySelector(`[name="direction"][value="${value}"]`);
      if (radio) radio.checked = true;
    } else setValue(key, value);
  }
  applyBuiltInRule();
}

function currentSymbol() {
  const preset = $("symbolPreset").value;
  return (preset === "custom" ? $("symbol").value : preset).trim().toUpperCase();
}

function updateQuoteLabel() {
  const exchange = $("exchange").value;
  const market = $("market").value;
  const config = EXCHANGE_DEFAULTS[exchange];
  $("quoteLabel").textContent = market === "perp" ? config.quotePerp : config.quoteSpot;
}

function getBuiltInRule() {
  const exchange = $("exchange").value;
  const market = $("market").value;
  const symbol = currentSymbol();
  const config = EXCHANGE_DEFAULTS[exchange][market];
  if (market !== "perp" || !BUILTIN_RULES[exchange]?.[symbol]) return { minQty: config.minQty, qtyStep: config.qtyStep, minNotional: config.minNotional, maxLeverage: config.maxLeverage, contractSize: 1, orderStep: config.qtyStep, orderUnit: "base", verifiedSymbol: false };
  const [minQty, qtyStep, minNotional, maxLeverage, contractSize = 1, orderStep = qtyStep] = BUILTIN_RULES[exchange][symbol];
  return { minQty, qtyStep, minNotional, maxLeverage, contractSize, orderStep, orderUnit: exchange === "okx" ? "contracts" : "base", verifiedSymbol: true };
}

function applyBuiltInRule() {
  const exchange = $("exchange").value;
  const market = $("market").value;
  const config = EXCHANGE_DEFAULTS[exchange][market];
  activeRule = getBuiltInRule();
  setValue("minQty", activeRule.minQty);
  setValue("qtyStep", activeRule.qtyStep);
  setValue("minNotional", activeRule.minNotional);
  setValue("maxLeverage", activeRule.maxLeverage);
  const entryType = $("entryOrderType").value;
  const exitType = $("exitOrderType").value;
  setValue("entryFee", (config[entryType] * 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, ""));
  setValue("exitFee", (config[exitType] * 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, ""));
  if (market === "spot") setValue("leverage", 1);
  updateQuoteLabel();
  if (market === "perp") setValue("maintenanceMarginRate", config.maintenanceMarginRate || .5);
  setValue("marginMode", market === "spot" ? "spot" : "isolated");
  updateRulesSummary();
  render();
}

function applyExchangeDefaults() { applyBuiltInRule(); }

function updateRulesSummary(message) {
  const exchange = $("exchange").value;
  const symbol = currentSymbol();
  const rule = activeRule || getBuiltInRule();
  $("rulesStatus").textContent = message || `内置规则 · ${EXCHANGE_DEFAULTS[exchange].name} ${symbol} · 核对于 2026-09-26`;
  if (rule.orderUnit === "contracts") {
    $("rulesSummary").textContent = `下单单位：张 · 1 张 = ${compact.format(rule.contractSize)} ${symbol} · 步长 ${compact.format(rule.orderStep)} 张`;
  } else {
    const notional = Number($("minNotional").value);
    $("rulesSummary").textContent = `数量步长 ${compact.format(Number($("qtyStep").value))} ${symbol} · 最小数量 ${compact.format(Number($("minQty").value))}${notional > 0 ? ` · 最小名义价值 ${compact.format(notional)} ${$("quoteLabel").textContent}` : ""}`;
  }
}

function render() {
  const result = calculatePosition(readState());
  latestResult = result.ok ? result : null;
  const fatal = $("fatalError");
  if (!result.ok) {
    fatal.hidden = false;
    fatal.textContent = result.fatal.join("；");
    $("resultContent").style.opacity = ".32";
    return;
  }
  fatal.hidden = true;
  $("resultContent").style.opacity = "1";
  const quote = $("quoteLabel").textContent;
  const r = result;
  const rule = activeRule || getBuiltInRule();
  const isLong = r.direction === "long";
  $("directionBadge").textContent = isLong ? "做多 LONG" : "做空 SHORT";
  $("directionBadge").className = `direction-badge ${isLong ? "long" : "short"}`;
  const exchangeOrderQty = rule.orderUnit === "contracts" ? r.quantity / rule.contractSize : r.quantity;
  const exchangeOrderUnit = rule.orderUnit === "contracts" ? "张" : r.p.symbol;
  $("quantityFieldLabel").textContent = rule.orderUnit === "contracts" ? "交易所显示“张数 / Contracts”" : "交易所显示“数量 / Size”";
  $("quantityResult").textContent = `${compact.format(exchangeOrderQty)} ${exchangeOrderUnit}`;
  $("baseFieldHint").textContent = rule.orderUnit === "contracts" ? `约等于 ${compact.format(r.quantity)} ${r.p.symbol}` : `输入框单位为 ${r.p.symbol}`;
  $("quoteOrderLabel").textContent = `若界面可切换“金额 / ${quote}”`;
  $("usdtOrderResult").textContent = `${money(r.entryNotional)} ${quote}`;
  $("orderNotionalGuide").textContent = `${money(r.entryNotional)} ${quote}`;
  const fundsNeeded = r.p.market === "spot" ? r.entryNotional + r.entryFeeAmount : r.margin + r.entryFeeAmount;
  $("fundsNeededLabel").textContent = r.p.market === "spot" ? "理论需要的余额" : "理论初始保证金 + 开仓费";
  $("fundsNeededResult").textContent = `${money(fundsNeeded)} ${quote}`;
  const baseAtEnteredPrice = quoteAmountToBaseQty(r.entryNotional, r.p.entry, r.p.qtyStep);
  $("conversionExplain").textContent = `以你填写的成交价 ${money(r.p.entry)} 计算：${money(r.entryNotional)} ÷ ${money(r.p.entry)}，按 ${compact.format(r.p.qtyStep)} ${r.p.symbol} 精度向下取整后约为 ${compact.format(baseAtEnteredPrice)} ${r.p.symbol}。如果交易所市价不是 ${money(r.p.entry)}，它显示的币数就会不同；市价单下单前请先把“预计成交价”更新为当前价。`;
  $("orderFieldGuide").textContent = rule.orderUnit === "contracts"
    ? `当前 ${EXCHANGE_DEFAULTS[r.p.exchange].name} 使用“张”下单，请优先填左边。右边稳定币金额仅供支持按金额下单的界面使用。`
    : `输入框单位是 ${r.p.symbol} 就填左边；只有单位明确切换成 ${quote}、金额或价值时才填右边。市价变化后两者不会完全等价。`;
  $("roundingNote").textContent = `已按 ${compact.format(r.p.qtyStep)} ${r.p.symbol} 步长向下取整${r.binding === "capital" ? " · 受资金占用上限约束" : ""}`;
  $("notionalResult").textContent = money(r.entryNotional);
  $("marginResult").textContent = money(r.margin);
  $("lossResult").textContent = money(r.worstCaseLoss);
  $("rrResult").textContent = `${r.rewardRisk.toFixed(2)} : 1`;
  $("riskUsedPct").textContent = percent(Math.min(999, r.riskUsedPct), 1);
  $("riskRing").style.setProperty("--risk", `${Math.min(360, Math.max(0, r.riskUsedPct * 3.6))}deg`);
  $("riskBudgetLabel").textContent = `可用风险预算 ${money(r.riskBudget)} ${quote}`;
  $("priceLoss").textContent = money(r.priceLoss);
  $("feeLoss").textContent = money(r.feeLoss);
  $("otherLoss").textContent = money(r.slippageLoss + r.fundingCost);
  const lossBase = Math.max(r.worstCaseLoss, .0000001);
  $("priceRiskBar").style.width = `${Math.max(0, r.priceLoss / lossBase * 100)}%`;
  $("feeRiskBar").style.width = `${Math.max(0, r.feeLoss / lossBase * 100)}%`;
  $("slipRiskBar").style.width = `${Math.max(0, (r.slippageLoss + r.fundingCost) / lossBase * 100)}%`;
  $("stopDistance").textContent = percent(r.stopDistancePct, 4);
  $("marginShare").textContent = percent(r.marginSharePct, 2);
  $("entryFeeAmount").textContent = `${money(r.entryFeeAmount)} ${quote}`;
  $("stopFeeAmount").textContent = `${money(r.stopFeeAmount)} ${quote}`;
  $("profitResult").textContent = `${money(r.netProfit)} ${quote}`;
  $("roeResult").textContent = percent(r.roePct, 2);
  $("entryPriceResult").textContent = money(r.p.entry);
  $("breakEvenResult").textContent = money(r.breakEvenPrice);
  $("profitHero").textContent = `${money(r.netProfit)} ${quote}`;
  if (r.liquidationPrice == null) {
    $("liquidationResult").textContent = r.p.market === "spot" ? "现货无强平" : "以交易所为准";
    $("liquidationNote").textContent = r.p.market === "spot" ? "未使用借贷" : "全仓无法可靠估算";
  } else {
    $("liquidationResult").textContent = money(r.liquidationPrice);
    $("liquidationNote").textContent = `距开仓约 ${percent(r.liquidationDistancePct, 2)}`;
  }
  const list = $("checksList");
  list.innerHTML = "";
  const priority = { error: 0, warn: 1, ok: 2 };
  [...r.checks].sort((a, b) => priority[a.level] - priority[b.level]).forEach((check) => {
    const li = document.createElement("li");
    li.className = check.level;
    li.textContent = check.text;
    list.appendChild(li);
  });
  if ($("entryOrderType").value === "taker") {
    const li = document.createElement("li");
    li.className = "warn";
    li.textContent = `你选择的是市价单。交易所会按真实成交价换算；下单前请确认这里的 ${money(r.p.entry)} 与交易所当前价接近。`;
    list.prepend(li);
  }
  const errors = r.checks.filter((check) => check.level === "error").length;
  const warnings = r.checks.filter((check) => check.level === "warn").length + ($("entryOrderType").value === "taker" ? 1 : 0);
  $("checkCount").textContent = errors ? `${errors} 项不能开 · ${warnings} 项注意` : warnings ? `${warnings} 项需要注意` : "全部通过";
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function load300Example() {
  const config = EXCHANGE_DEFAULTS.binance.perp;
  applyState({
    ...makeDefaultState("binance", "perp"), symbol: "ETH", equity: 300, riskPct: 1,
    entry: 4000, stop: 3920, target: 4240, leverage: 5,
    minQty: .001, qtyStep: .001, minNotional: 5,
    maintenanceMarginRate: config.maintenanceMarginRate
  });
  updateRulesSummary("已载入 300U 教学示例，请按你的真实计划修改价格");
  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast("300U 教学示例已填好，重点看右侧下单数量和最多亏损");
}

function showDialog(type) {
  dialog.classList.toggle("tutorial-dialog", type === "tutorial");
  if (type === "tutorial") {
    $("dialogEyebrow").textContent = "新手教程";
    $("dialogTitle").textContent = "账户只有 300U，应该怎么填？";
    $("dialogBody").innerHTML = $("tutorialTemplate").innerHTML;
    $("load300ExampleDialog")?.addEventListener("click", () => { dialog.close(); load300Example(); });
  } else if (type === "method") {
    $("dialogEyebrow").textContent = "方法说明";
    $("dialogTitle").textContent = "为什么这版计算更准确";
    $("dialogBody").innerHTML = `<h3>1. 先定最多能亏多少</h3><p>例如账户有 300U，单笔风险填 1%，这笔单的亏损上限就是约 3U。计算器再用这个 3U 反推出下单数量。</p><h3>2. 手续费按真实成交价值算</h3><p><code>每单位止损成本 = 价格差 + 开仓费 + 止损平仓费 + 双边滑点</code></p><p>开仓和止损价格不一样，所以两边手续费分别计算，不能简单把一个费率乘以 2。</p><h3>3. 下单数量永远向下取整</h3><p>理论数量会按交易所数量步长向下取整，宁可少开一点，也不会因为四舍五入悄悄超过风险预算。</p><h3>4. 强平价是估算，不是承诺</h3><p>逐仓强平价会参考杠杆、维持保证金率、平仓费率和额外保证金。交易所还会用标记价格、风险档位和速算扣除额，所以最终一定以交易所订单预览为准。</p>`;
  } else if (type.startsWith("help:")) {
    const key = type.split(":")[1];
    const info = HELP_CONTENT[key];
    $("dialogEyebrow").textContent = "名词解释";
    $("dialogTitle").textContent = info.title;
    $("dialogBody").innerHTML = `<p>${info.body}</p><div class="plain-example"><b>举个例子</b><p>${info.example}</p></div>`;
  } else {
    return;
  }
  dialog.showModal();
}

const HELP_CONTENT = {
  equity: { title: "账户权益是什么？", body: "就是你交易账户里真正有多少钱。不要填想开的仓位，也不要把本金乘以杠杆。", example: "账户里有 300 USDT，就填 300。" },
  risk: { title: "单笔风险是什么？", body: "是这笔交易触发止损后，你最多接受亏掉本金的百分之几。它不是价格跌幅。", example: "300U 账户填 1%，代表这笔单计划最多亏约 3U。" },
  entry: { title: "预计成交价应该怎么填？", body: "限价单填你的挂单价；市价单要填交易所此刻价格。稳定币金额会用这个价格换算币数，填成旧价格就会和交易所对不上。", example: "交易所当前 BTC 是 83,923.7，市价开仓就填 83923.7，不要继续使用旧计划价 83713。" },
  stop: { title: "止损价是什么？", body: "当行情证明你的判断可能错了，你准备退出的位置。止损离开仓越远，同样风险下能开的数量越小。", example: "ETH 在 4,000 做多，跌到 3,920 就认亏，止损填 3920。" },
  target: { title: "止盈价是什么？", body: "行情走对时，你计划平仓落袋的价格。计算器会按它估算扣费后的净利润。", example: "ETH 在 4,000 做多，计划涨到 4,240 平仓，止盈填 4240。" },
  leverage: { title: "杠杆倍数是什么？", body: "杠杆决定需要占用多少保证金，也会影响强平距离。仓位数量由风险和止损决定，不应该因为杠杆高就盲目放大。", example: "1,000U 名义仓位使用 5 倍杠杆，大约占用 200U 保证金。" }
};

async function copyResult() {
  if (!latestResult) return showToast("请先把参数填写完整");
  const r = latestResult;
  const rule = activeRule || getBuiltInRule();
  const orderQty = rule.orderUnit === "contracts" ? r.quantity / rule.contractSize : r.quantity;
  const orderUnit = rule.orderUnit === "contracts" ? "张" : r.p.symbol;
  const quote = $("quoteLabel").textContent;
  const text = [
    `${EXCHANGE_DEFAULTS[r.p.exchange].name} · ${r.p.symbol} · ${r.direction === "long" ? "做多" : "做空"}`,
    `交易所下单数量：${compact.format(orderQty)} ${orderUnit}`,
    `对应币数：${compact.format(r.quantity)} ${r.p.symbol}`,
    `稳定币金额：${money(r.entryNotional)} ${quote}`,
    `理论初始保证金：${money(r.margin)} ${quote}`,
    `止损总亏损：${money(r.worstCaseLoss)} ${quote}`,
    `止盈净利润：${money(r.netProfit)} ${quote}`,
    `净盈亏比：${r.rewardRisk.toFixed(2)} : 1`,
    `损益两平价：${money(r.breakEvenPrice)}`,
    `预估强平价：${r.liquidationPrice == null ? "以交易所为准" : money(r.liquidationPrice)}`
  ].join("\n");
  await navigator.clipboard.writeText(text);
  showToast("计算结果已复制");
}

async function copyOrderValue(kind) {
  if (!latestResult) return showToast("请先把参数填写完整");
  const r = latestResult;
  const rule = activeRule || getBuiltInRule();
  const orderQty = rule.orderUnit === "contracts" ? r.quantity / rule.contractSize : r.quantity;
  const value = kind === "base" ? plainNumber(orderQty) : r.entryNotional.toFixed(2);
  await navigator.clipboard.writeText(value);
  showToast(kind === "base" ? `已复制${rule.orderUnit === "contracts" ? "合约张数" : ` ${r.p.symbol} 下单数量`}` : `已复制 ${$("quoteLabel").textContent} 下单金额`);
}

form.addEventListener("input", (event) => {
  if (["entryOrderType", "exitOrderType"].includes(event.target.id)) applyBuiltInRule();
  else render();
});
form.addEventListener("change", (event) => {
  if (["exchange", "market", "entryOrderType", "exitOrderType"].includes(event.target.id)) applyBuiltInRule();
  else render();
});
$("symbol").addEventListener("input", applyBuiltInRule);
$("symbolPreset").addEventListener("change", () => {
  const custom = $("symbolPreset").value === "custom";
  $("customSymbolField").hidden = !custom;
  if (custom) $("symbol").focus();
  applyBuiltInRule();
});
$("resetButton").addEventListener("click", () => applyState(makeDefaultState("binance", "perp")));
$("load300Example").addEventListener("click", load300Example);
$("copyResult").addEventListener("click", copyResult);
$("copyBaseQty").addEventListener("click", () => copyOrderValue("base"));
$("copyUsdtQty").addEventListener("click", () => copyOrderValue("usdt"));
$("openTutorial").addEventListener("click", () => showDialog("tutorial"));
$("openMethod").addEventListener("click", (event) => { event.preventDefault(); showDialog("method"); });
document.querySelectorAll(".help-button").forEach((button) => button.addEventListener("click", () => showDialog(`help:${button.dataset.help}`)));
document.querySelectorAll("[data-risk]").forEach((button) => button.addEventListener("click", () => { setValue("riskPct", button.dataset.risk); render(); showToast(`单笔风险已设为 ${button.dataset.risk}%`); }));
$("closeDialog").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

applyState(makeDefaultState("binance", "perp"));
