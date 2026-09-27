# 虚拟货币仓位计算器

一个面向合约与现货交易的仓位、风险和下单数量计算器。计算时会同时考虑止损距离、手续费、滑点、资金费、保证金占用，以及交易所的最小数量、数量步长和最低名义价值。

在线演示：<https://jsq.tianevan.com/>

## 主要功能

- 根据账户权益和单笔风险反推仓位大小
- 同时给出币种数量与 USDT/USDC 下单金额
- 支持 Binance、OKX、Bitget、Bybit 和 Hyperliquid 常用规则
- 支持 U 本位永续、普通现货、做多和做空
- 计算手续费、滑点、资金费与止损总亏损
- 显示预估强平价、损益两平价、止盈净利润和净盈亏比
- OKX 合约按张下单时提供对应的下单张数
- 内置 300U 教学示例和完整新手教程
- 所有仓位数量按照交易所数量步长向下取整

## 快速开始

需要 Node.js 18 或更高版本。

```powershell
node .\scripts\preview-worker.mjs
```

随后在浏览器打开：<http://127.0.0.1:4173/>

## 宝塔部署与更新

1. 网站目录使用 Git 仓库根目录，网站运行目录设置为 `/dist`。
2. GitHub 有新版本后，在宝塔的 Git 部署页面执行“拉取 / 更新”；也可以进入网站目录运行 `git pull origin main`。
3. 更新完成后清除宝塔网站缓存，并在浏览器按 `Ctrl + F5` 强制刷新。

页面交互脚本使用标准 `.js` 文件，兼容宝塔默认 Nginx 类型配置。若页面只有静态文字、输入后结果不变化，请先确认线上 `/app.js` 与 `/core.js` 返回 `200`，且响应类型为 `text/javascript` 或 `application/javascript`。

## 检查计算结果

```powershell
node --test .\tests\calculator.test.mjs .\tests\worker.test.mjs
```

## 项目结构

```text
dist/
  index.html          页面结构
  styles.css          页面样式
  app.js              页面交互与结果展示
  core.js             仓位计算核心
  server/index.js     发布使用的 Worker 文件
scripts/
  build-worker.mjs    生成 Worker 文件
  preview-worker.mjs  本地预览
tests/
  calculator.test.mjs 计算逻辑测试
  worker.test.mjs     页面路由测试
使用说明.md            完整使用教程
```

完整填写方法、字段说明与计算口径请查看：[使用说明.md](./使用说明.md)。

## 风险提示

本项目只用于仓位规划和计算复核，不提供投资建议。交易所费率、风险档位、合约面值和强平规则可能随账户等级、地区、币种和仓位变化；真实下单前应以交易所订单预览和风险限额页面为准。
