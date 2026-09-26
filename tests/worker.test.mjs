import assert from "node:assert/strict";
import worker from "../dist/server/index.js";

const page = await worker.fetch(new Request("https://calculator.test/"));
assert.equal(page.status, 200);
assert.match(await page.text(), /账户只有 300U/);

const removedApi = await worker.fetch(new Request("https://calculator.test/api/exchange-rules?exchange=binance&market=perp&symbol=BTC&entry=100000"));
assert.equal(removedApi.status, 404, "runtime exchange-rule fetching must stay disabled");
console.log("worker routes: all tests passed");
