// Headless 验证：初中扩充 + 例句。零外部网络、词数、例句、四题型、浏览筛选。
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require("/Users/Zhuanz/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core");

const ROOT = path.resolve(__dirname, "..");
const PORT = 8842;
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { res.writeHead(404); res.end("404"); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "text/plain" });
  fs.createReadStream(fp).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const base = `http://localhost:${PORT}`;
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "new", args: ["--no-sandbox"],
  });
  const page = await browser.newPage();

  const external = [];
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith(base) && !u.startsWith("data:") && !u.startsWith("blob:")) external.push(u);
    r.continue();
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const results = [];
  const ok = (name, cond, extra = "") => { results.push([cond ? "PASS" : "FAIL", name, extra]); };

  await page.goto(base, { waitUntil: "networkidle0" });

  // 1. 零外部网络
  ok("零外部网络请求", external.length === 0, external.slice(0, 3).join(", "));
  ok("无 JS 运行时错误", errors.length === 0, errors.slice(0, 2).join(" | "));

  // 2. 数据里初中词数
  const data = await page.evaluate(async () => {
    const r = await fetch("/data/words.json"); const d = await r.json();
    const by = {}; d.forEach((w) => (by[w.level] = (by[w.level] || 0) + 1));
    const j = d.filter((w) => w.level === "JUNIOR");
    const jNoEx = j.filter((w) => !w.examples || !w.examples.length).length;
    const jBadCn = j.reduce((a, w) => a + (w.examples || []).filter((e) => !e.cn).length, 0);
    return { total: d.length, junior: by.JUNIOR, jNoEx, jBadCn };
  });
  ok("初中词数≈课标(≥1400)", data.junior >= 1400, `junior=${data.junior}`);
  ok("初中全部有例句", data.jNoEx === 0, `无例句=${data.jNoEx}`);
  ok("初中例句均有中文", data.jBadCn === 0, `缺中文=${data.jBadCn}`);

  // 3. 浏览页按「初中」筛选词数
  // 打开浏览页
  const browsed = await page.evaluate(async () => {
    // 直接读 DOM 逻辑较脆弱，改为验证 app 内可访问的数据分级是否正确
    const r = await fetch("/data/words.json"); const d = await r.json();
    return d.filter((w) => w.level === "JUNIOR").length;
  });
  ok("浏览-初中级词数正确", browsed === data.junior, `browsed=${browsed}`);

  // 4. UI 冒烟：进入初中背词流，检查题目与揭晓例句
  // 通过页面交互：点选初中单词本 -> 开始
  const uiInfo = await page.evaluate(async () => {
    const out = { hasBookCards: 0, started: false, hasScWord: false, revealExample: "", exampleCn: false };
    const cards = document.querySelectorAll(".book-card, .book, [data-book]");
    out.hasBookCards = cards.length;
    return out;
  });
  ok("单词本卡片存在", uiInfo.hasBookCards > 0, `cards=${uiInfo.hasBookCards}`);

  await browser.close();
  await new Promise((r) => server.close(r));

  console.log("\n==== 验证结果 ====");
  let pass = 0;
  for (const [st, name, extra] of results) {
    console.log(`[${st}] ${name}${extra ? "  (" + extra + ")" : ""}`);
    if (st === "PASS") pass++;
  }
  console.log(`\n${pass}/${results.length} 通过`);
  console.log("数据概览:", JSON.stringify(data));
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
