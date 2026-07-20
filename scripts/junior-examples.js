/* 将初中(JUNIOR)双语例句写入 data/words.json，覆盖旧的脏例句。
   例句来源：scripts/junior-examples-part1..4.js（人工/AI 手写，保证中英匹配）。
   运行：node scripts/junior-examples.js  → 仅覆盖 JUNIOR 词的 examples 字段，其余级别不变。 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data", "words.json");

// 合并 4 个分批例句文件，key 统一小写
const MAP = {};
for (let i = 1; i <= 4; i++) {
  const m = require(`./junior-examples-part${i}.js`);
  for (const k in m) MAP[k.toLowerCase()] = m[k];
}

const raw = JSON.parse(fs.readFileSync(DATA, "utf8"));
const arr = Array.isArray(raw) ? raw : Object.values(raw);
let n = 0;
arr.forEach((w) => {
  if (w.level === "JUNIOR") {
    const ex = MAP[w.word.toLowerCase()];
    if (ex && ex.length) {
      w.examples = ex.map(([en, cn]) => ({ en, cn }));
      n++;
    }
  }
});
fs.writeFileSync(DATA, JSON.stringify(raw));
console.log("JUNIOR examples written for", n, "words.");

// 统计
let totalEx = 0, missCn = 0, zeroEx = 0, jc = 0;
arr.filter((x) => x.level === "JUNIOR").forEach((x) => {
  jc++;
  const ex = x.examples || []; totalEx += ex.length; if (!ex.length) zeroEx++;
  ex.forEach((e) => { if (!e.cn) missCn++; });
});
console.log(`JUNIOR: ${jc} words | avg examples/word ${(totalEx / jc).toFixed(2)} | 0-example ${zeroEx} | missing-cn ${missCn}/${totalEx}`);
