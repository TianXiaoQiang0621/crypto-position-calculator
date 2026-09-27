import assert from "node:assert/strict";
import worker from "../dist/server/index.js";

const page = await worker.fetch(new Request("https://calculator.test/"));
assert.equal(page.status, 200);
assert.match(await page.text(), /账户只有 300U/);

const appModule = await worker.fetch(new Request("https://calculator.test/app.js?v=20260927-1"));
assert.equal(appModule.status, 200);
assert.match(appModule.headers.get("content-type"), /^text\/javascript/);
assert.match(await appModule.text(), /from "\.\/core\.js\?v=20260927-1"/);

const coreModule = await worker.fetch(new Request("https://calculator.test/core.js?v=20260927-1"));
assert.equal(coreModule.status, 200);
assert.match(coreModule.headers.get("content-type"), /^text\/javascript/);
assert.match(await coreModule.text(), /export function calculatePosition/);

const removedApi = await worker.fetch(new Request("https://calculator.test/api/exchange-rules?exchange=binance&market=perp&symbol=BTC&entry=100000"));
assert.equal(removedApi.status, 404, "runtime exchange-rule fetching must stay disabled");
console.log("worker routes: all tests passed");
