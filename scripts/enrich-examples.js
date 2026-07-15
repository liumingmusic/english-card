/* 构建期：扩充例句并补中文翻译（运行时零联网）。
   流程：Free Dictionary API 取真实英文例句 → MyMemory 补中文（匿名配额，可续跑）。
   规则：只提交带中文的例句；每词最多 3 条；按级别分批处理，增量写回 words.json（断点续跑安全）。
   运行：LEVELS=PRIMARY node scripts/enrich-examples.js   （LEVELS 可逗号分隔；缺省 PRIMARY） */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = __dirname.replace(/\/scripts$/, "");
const DATA = path.join(ROOT, "data", "words.json");
const ENCACHE = path.join(__dirname, ".en_cache.json");
const CNCACHE = path.join(__dirname, ".cn_cache.json");
const TRANSLATE_CAP = 95; // 本回合翻译上限，留余量避免触发 MyMemory 每日配额

const LEVELS = (process.env.LEVELS || "PRIMARY").split(",").map((s) => s.trim()).filter(Boolean);

const loadJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return {}; } };
const saveJSON = (f, o) => fs.writeFileSync(f, JSON.stringify(o));

function curl(url) {
  try {
    return execFileSync("curl", ["-s", "--max-time", "25", "-A", "Mozilla/5.0", "--compressed", url], { maxBuffer: 1 << 22 }).toString();
  } catch (e) { return ""; }
}
function sleep(sec) { try { execFileSync("sleep", [String(sec)]); } catch (e) {} }

const enCache = loadJSON(ENCACHE);
const cnCache = loadJSON(CNCACHE);
let translated = 0;

function translate(en) {
  const key = en.toLowerCase().trim();
  if (cnCache[key]) return cnCache[key];
  if (translated >= TRANSLATE_CAP) return "";
  const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(en) + "&langpair=en|zh-CN";
  const body = curl(url);
  translated++;
  let cn = "";
  try {
    const j = JSON.parse(body);
    if (j && j.responseData && j.responseData.translatedText) {
      cn = j.responseData.translatedText.trim();
      if (/MYMEMORY|QUOTA|INVALID|WARNING|WE ARE SORRY/i.test(cn) || (j.responseStatus && j.responseStatus !== 200)) cn = "";
    }
  } catch (e) {}
  if (cn) { cnCache[key] = cn; saveJSON(CNCACHE, cnCache); }
  return cn;
}

function fetchEnglishExamples(word, tries) {
  tries = tries || 0;
  const url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word.toLowerCase());
  const body = curl(url);
  const out = [];
  try {
    const data = JSON.parse(body);
    if (!Array.isArray(data)) return out;
    const lw = word.toLowerCase();
    for (const entry of data) {
      (entry.meanings || []).forEach((m) => {
        (m.definitions || []).forEach((d) => {
          let ex = (d.example || "").trim();
          if (ex && ex.toLowerCase().includes(lw) && ex.length <= 160) out.push(ex);
        });
      });
    }
  } catch (e) {}
  if (!out.length && tries < 2) { sleep(0.4); return fetchEnglishExamples(word, tries + 1); }
  const seen = new Set(); const uniq = [];
  for (const e of out) { const k = e.toLowerCase(); if (!seen.has(k)) { seen.add(k); uniq.push(e); } if (uniq.length >= 4) break; }
  return uniq;
}

function buildExamples(w) {
  const word = w.word;
  let cands = enCache[word];
  if (!cands) { cands = fetchEnglishExamples(word); enCache[word] = cands; saveJSON(ENCACHE, enCache); sleep(0.12); }

  const allEns = [];
  const seenEn = new Set();
  cands.forEach((e) => { const k = e.toLowerCase().trim(); if (k && !seenEn.has(k)) { seenEn.add(k); allEns.push(e); } });
  (w.examples || []).forEach((e) => { if (e.en) { const k = e.en.toLowerCase().trim(); if (k && !seenEn.has(k)) { seenEn.add(k); allEns.push(e.en); } } });

  const map = {};
  (w.examples || []).forEach((e) => { if (e.en) map[e.en.toLowerCase().trim()] = e.cn || ""; });
  for (const en of allEns) {
    const k = en.toLowerCase().trim();
    if (k in map) { if (!map[k]) { const t = translate(en); if (t) map[k] = t; } }
    else { const t = translate(en); map[k] = t || ""; }
  }

  const final = [];
  const pushed = new Set();
  function add(en, cn) {
    const k = (en || "").toLowerCase().trim();
    if (pushed.has(k)) return;
    pushed.add(k);
    final.push({ en: en || "", cn: cn || "" });
  }
  (w.examples || []).forEach((e) => add(e.en || "", e.cn || ""));
  // 在配额内为原有「有英文无中文」的例句补译（升级为中文，不删已有例句）
  (w.examples || []).forEach((e) => {
    if (e.en && !e.cn) {
      const t = translate(e.en);
      if (t) { const k = e.en.toLowerCase().trim(); const fe = final.find((f) => f.en && f.en.toLowerCase().trim() === k); if (fe) fe.cn = t; }
    }
  });
  // 只补充「带中文」的候选例句，绝不新增缺中文的例句
  const withCn = [];
  allEns.forEach((en) => { const cn = map[en.toLowerCase().trim()] || ""; if (cn) withCn.push({ en, cn }); });
  for (const x of withCn) { if (final.length >= 3) break; add(x.en, x.cn); }
  return final.slice(0, 3);
}

function writeData(raw) { fs.writeFileSync(DATA, JSON.stringify(raw)); }

const raw = JSON.parse(fs.readFileSync(DATA, "utf8"));
const arr = Object.values(raw);
const targets = arr.filter((w) => LEVELS.includes(w.level));
console.log("Target levels:", LEVELS.join(","), "| words to process:", targets.length, "| translate budget:", TRANSLATE_CAP);

let done = 0;
for (const w of targets) {
  w.examples = buildExamples(w);
  done++;
  if (done % 5 === 0) { writeData(raw); console.log(`  ...saved ${done}/${targets.length} (translated ${translated})`); }
}
writeData(raw);

let totalEx = 0, missCn = 0, zeroEx = 0, ok = 0;
targets.forEach((x) => {
  const ex = x.examples || []; totalEx += ex.length; if (!ex.length) zeroEx++;
  ex.forEach((e) => { if (!e.cn) missCn++; });
  if (ex.filter((e) => e.cn).length >= 2) ok++;
});
console.log("Done. translated calls this run:", translated);
console.log(`Result for ${LEVELS.join(",")}: avg examples/word ${(totalEx / targets.length).toFixed(2)} | 0-example words ${zeroEx} | missing-cn examples ${missCn}/${totalEx} | words with >=2 bilingual ${ok}/${targets.length}`);
