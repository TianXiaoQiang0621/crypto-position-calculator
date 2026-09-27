import assert from "node:assert/strict";
import worker from "../dist/server/index.js";

const page = await worker.fetch(new Request("https://calculator.test/"));
assert.equal(page.status, 200);
const pageHtml = await page.text();
assert.match(pageHtml, /账户只有 300U/);
assert.match(pageHtml, /为什么我改了数字，结果却没变/);
assert.match(pageHtml, /styles\.css\?v=20260927-2/);
assert.equal((pageHtml.match(/class="help-button"/g) || []).length, 21, "all basic and advanced fields should expose plain-language help");

const appModule = await worker.fetch(new Request("https://calculator.test/app.js?v=20260927-2"));
assert.equal(appModule.status, 200);
assert.match(appModule.headers.get("content-type"), /^text\/javascript/);
const appSource = await appModule.text();
assert.match(appSource, /from "\.\/core\.js\?v=20260927-2"/);
assert.match(appSource, /最大保证金占比是什么/);

const coreModule = await worker.fetch(new Request("https://calculator.test/core.js?v=20260927-2"));
assert.equal(coreModule.status, 200);
assert.match(coreModule.headers.get("content-type"), /^text\/javascript/);
assert.match(await coreModule.text(), /export function calculatePosition/);

const removedApi = await worker.fetch(new Request("https://calculator.test/api/exchange-rules?exchange=binance&market=perp&symbol=BTC&entry=100000"));
assert.equal(removedApi.status, 404, "runtime exchange-rule fetching must stay disabled");
console.log("worker routes: all tests passed");
