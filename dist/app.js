import { EXCHANGE_DEFAULTS, calculatePosition, makeDefaultState, quoteAmountToBaseQty } from "./core.js?v=20260927-2";

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
  leverage: { title: "杠杆倍数是什么？", body: "杠杆决定需要占用多少保证金，也会影响强平距离。仓位数量由风险和止损决定，不应该因为杠杆高就盲目放大。", example: "1,000U 名义仓位使用 5 倍杠杆，大约占用 200U 保证金。" },
  exitOrderType: { title: "止损成交怎么选？", body: "止损触发后立即按盘口成交，选 Taker / 市价；只有确认会挂在盘口等待成交时才选 Maker / 挂单。拿不准时选 Taker 更保守。", example: "你使用常见的止损市价单，就选择 Taker / 市价。" },
  entryFee: { title: "开仓费率怎么填？", body: "填写这笔订单开仓成交时，你的账户实际会收取的手续费百分比。它要和开仓订单类型对应。", example: "交易所显示 Taker 费率 0.05%，这里填 0.05，而不是 5 或 0.0005。" },
  exitFee: { title: "平仓费率怎么填？", body: "填写止损或止盈平仓时预计使用的费率。止损通常会立即成交，所以多数情况下按 Taker 费率填写更保守。", example: "止损市价费率是 0.05%，这里填 0.05。" },
  slippagePct: { title: "单边滑点是什么？", body: "行情波动或盘口深度不足时，实际成交价可能比看到的价格差。这里预留一次成交可能偏离计划价的百分比，计算器会考虑开仓和离场两边。", example: "主流币可先参考 0.03；冷门币或剧烈行情要结合盘口适当加大。" },
  fundingCost: { title: "预计资金费净成本怎么填？", body: "填写预计持仓期间全部资金费的合计金额。预计支付填正数，预计收到可以填负数；不跨资金费时间可填 0。", example: "预计一共支付 0.8U，就填 0.8；预计收到 0.5U，可以填 -0.5。" },
  existingRisk: { title: "已占用风险是什么？", body: "其他持仓如果同时打到各自止损，预计还会亏多少钱。系统会先扣掉这部分，避免多笔交易合起来超出风险预算。", example: "其他两笔仓位触发止损共会亏 12U，这里填 12；没有其他仓位填 0。" },
  maxMarginPct: { title: "最大保证金占比是什么？", body: "这是本单最多可以占用本金的比例，不是必须用满，也不是单笔风险。仓位同时受风险上限和资金上限限制，系统永远取更小的那个。", example: "300U账户填30，代表本单最多占用约90U保证金。即使风险填100%，仓位也不会突破这个资金上限。" },
  minQty: { title: "最小数量是什么？", body: "交易所允许提交的最小币种数量。低于它的订单会被拒绝。通常保留内置值，只有交易所规则明确变化时才修改。", example: "最小数量是0.001 BTC，计算结果只有0.0008 BTC时就不能下单。" },
  qtyStep: { title: "数量步长是什么？", body: "下单数量每次允许增加的最小间隔。计算器会按步长向下取整，确保不会因四舍五入超过风险上限。", example: "步长是0.001 BTC，只能填写0.001、0.002、0.003等数量。" },
  minNotional: { title: "最小名义价值是什么？", body: "币种数量乘以开仓价得到的订单总价值必须达到这个门槛。它不是最低保证金。", example: "规则要求订单价值至少5 USDT，这里填5。" },
  maxLeverage: { title: "该标的最大杠杆怎么填？", body: "填写交易所允许这个币种、当前风险档位使用的最高杠杆，只用于检查你输入的杠杆是否合法，不代表建议使用这么高。", example: "该币种当前档位最高允许50倍，这里填50。" },
  marginMode: { title: "保证金模式怎么选？", body: "逐仓只使用分给这一仓位的保证金；全仓会把账户余额和其他仓位一起计算；普通现货选择现货不适用。全仓强平价必须看交易所。", example: "你在合约页面选择了逐仓，就在这里选择逐仓。" },
  maintenanceMarginRate: { title: "维持保证金率 MMR 是什么？", body: "这是仓位维持不被强平所需的最低保证金比例，会随币种、仓位大小和风险档位变化。应以交易所当前档位为准。", example: "交易所显示 MMR 为0.4%，这里填0.4。" },
  extraMargin: { title: "额外加入保证金是什么？", body: "填写你准备额外补进逐仓仓位的保证金，只用于调整预估强平价，不会自动放大建议仓位。", example: "没有额外补保证金填0；已经额外加入20U就填20。" },
  maintenanceDeduction: { title: "维持保证金速算扣除额是什么？", body: "这是部分交易所风险档位强平公式中的固定扣除额，不是手续费，也不是已经缴纳的保证金。只有官方风险限额表明确给出时才填写。", example: "当前风险档位未显示扣除额或找不到该项，就填0。" }
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
