#!/usr/bin/env node
// Build data/words.json from the curated seeds:
//   scripts/seed-primary.js  (PRIMARY 小学)
//   scripts/seed-junior.js   (JUNIOR 初中)
//   scripts/seed-school.js   (SENIOR 高中)
//   scripts/seed.js          (CET4 / CET6 / KAOYAN / IELTS)
// Each entry is enriched at BUILD TIME with the Free Dictionary API for
// phonetic / English meaning / synonyms / antonyms. We DO NOT store any remote
// audio URL — the site uses the browser's local speechSynthesis for pronunciation,
// so the published site is 100% offline (no runtime network calls).
//
// We also merge in data already present in the previous words.json (images,
// bilingual examples) so we never lose work, and cache API results to .enrich_cache.json
// so the build is resumable.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "data", "words.json");
const CACHE = path.join(__dirname, ".enrich_cache.json");
const API = (w) => `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEED_PRIMARY = require("./seed-primary.js");
const SEED_JUNIOR = require("./seed-junior.js")
  .concat(require("./seed-junior-extra.js"))
  .concat(require("./seed-junior-extra2.js"));
const SEED_SENIOR = require("./seed-school.js").filter((x) => x.level === "SENIOR");
const SEED_CET = require("./seed.js");

function loadCache() { try { return JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { return {}; } }
function saveCache(c) { fs.writeFileSync(CACHE, JSON.stringify(c)); }

function pickPhonetic(entry, phonetics) {
  if (entry && entry.phonetic) return entry.phonetic;
  if (Array.isArray(phonetics)) for (const p of phonetics) if (p && p.text) return p.text;
  return "";
}
async function fetchWord(word) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(API(word));
      if (res.status === 429) { await sleep(900 * (attempt + 1)); continue; }
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) return null;
      return data;
    } catch (e) { await sleep(600); }
  }
  return null;
}
function parseApi(data) {
  if (!Array.isArray(data) || !data.length) return null;
  const entry = data[0];
  const phonetics = entry.phonetics || [];
  const phonetic = pickPhonetic(entry, phonetics);
  const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
  const pos = meanings.length ? meanings[0].partOfSpeech || "" : "";
  let en = "";
  const synSet = new Set();
  const antSet = new Set();
  for (const m of meanings) {
    const defs = Array.isArray(m.definitions) ? m.definitions : [];
    if (!en && defs.length) en = defs[0].definition || "";
    if (Array.isArray(m.synonyms)) m.synonyms.forEach((s) => s && synSet.add(s));
    if (Array.isArray(m.antonyms)) m.antonyms.forEach((s) => s && antSet.add(s));
    for (const d of defs) {
      if (Array.isArray(d.synonyms)) d.synonyms.forEach((s) => s && synSet.add(s));
      if (Array.isArray(d.antonyms)) d.antonyms.forEach((s) => s && antSet.add(s));
    }
  }
  return {
    phonetic, pos, en,
    synonyms: Array.from(synSet).slice(0, 8),
    antonyms: Array.from(antSet).slice(0, 8),
  };
}

async function main() {
  const cache = loadCache();
  // previous words.json (carry over img / bilingual examples / already-enriched fields)
  let prev = [];
  try { prev = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { prev = []; }
  const prevMap = new Map();
  prev.forEach((w) => prevMap.set(w.word.toLowerCase(), w));

  const SEED = SEED_PRIMARY.concat(SEED_JUNIOR, SEED_SENIOR, SEED_CET);
  const seen = new Set();
  const unique = [];
  for (const s of SEED) {
    const key = s.word.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
  }

  const out = [];
  let done = 0, apiHits = 0, fromCache = 0, fromPrev = 0;
  console.log(`Building words.json from ${unique.length} unique words...`);

  for (const seed of unique) {
    const key = seed.word.toLowerCase().trim();
    const old = prevMap.get(key) || {};
    let parsed = null;

    if (cache[key]) { parsed = cache[key]; fromCache++; }
    else if (old.phonetic && old.en) {
      // already enriched previously — reuse
      parsed = { phonetic: old.phonetic, pos: old.pos || "", en: old.en, synonyms: old.synonyms || [], antonyms: old.antonyms || [] };
      fromPrev++;
    } else {
      const data = await fetchWord(seed.word);
      if (data) { parsed = parseApi(data); apiHits++; }
      cache[key] = parsed || null;
      saveCache(cache); // flush after every fetch so progress survives interruptions
    }

    // examples: prefer previous bilingual examples, else seed Chinese example
    let examples = Array.isArray(old.examples) && old.examples.length ? old.examples : [];
    if (!examples.length && seed.exampleCn) examples = [{ en: "", cn: seed.exampleCn }];

    const entry = {
      word: seed.word,
      level: seed.level,
      // 种子词性优先：手写种子 pos 用简写(n./v./adj.)且经人工核对，比 Free Dictionary API 的
      // partOfSpeech(常把 adj./adv./v. 一律返回成 noun) 准确得多，故 seed.pos 排在最前。
      pos: seed.pos || (parsed && parsed.pos) || old.pos || "",
      phonetic: (parsed && parsed.phonetic) || old.phonetic || "",
      audio: "", // local TTS only — never store remote audio
      cn: seed.cn || old.cn || "",
      en: (parsed && parsed.en) || old.en || seed.cn || "",
      examples,
      synonyms: (parsed && parsed.synonyms && parsed.synonyms.length) ? parsed.synonyms : (old.synonyms || []),
      antonyms: (parsed && parsed.antonyms && parsed.antonyms.length) ? parsed.antonyms : (old.antonyms || []),
      usage: seed.usage || old.usage || "",
      img: old.img || "",
    };
    out.push(entry);
    done++;
    // incremental durable checkpoint — survives being killed mid-build
    if (done % 100 === 0) {
      fs.writeFileSync(OUT, JSON.stringify(out));
      console.log(`  [ckpt] ${done}/${unique.length} (api:${apiHits} cache:${fromCache} prev:${fromPrev})`);
    }
    if (!cache[key] && !old.phonetic) await sleep(80);
  }
  saveCache(cache);

  const order = { PRIMARY: 0, JUNIOR: 1, SENIOR: 2, CET4: 3, CET6: 4, KAOYAN: 5, IELTS: 6 };
  out.sort((a, b) => (order[a.level] - order[b.level]) || a.word.localeCompare(b.word));

  fs.writeFileSync(OUT, JSON.stringify(out));
  // per-level counts
  const lv = {};
  out.forEach((w) => { lv[w.level] = (lv[w.level] || 0) + 1; });
  console.log("Wrote", out.length, "words. Per level:", JSON.stringify(lv));
  console.log(`(api:${apiHits} cache:${fromCache} prev-enriched:${fromPrev})`);

  // 应用手写双语例句，覆盖脏/缺失例句（幂等，重建不丢例句）
  try { require("./primary-examples.js"); } catch (e) { console.error("primary-examples failed:", e.message); }
  try { require("./junior-examples.js"); } catch (e) { console.error("junior-examples failed:", e.message); }
}

main().catch((e) => { console.error(e); process.exit(1); });
