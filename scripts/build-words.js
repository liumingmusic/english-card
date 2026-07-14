#!/usr/bin/env node
// Build data/words.json from the curated seeds (scripts/seed.js + seed-school.js)
// by enriching each entry with the Free Dictionary API: phonetic / audio / pos /
// English definition / synonyms / antonyms / example sentences.
//
// IMPORTANT: this runs at BUILD TIME only (local machine or CI). The published
// site reads data/words.json directly — it never calls the API at runtime, so
// the page loads fast and works fully offline. No API key is needed.
// If the API is unreachable, the entry keeps the built-in fallback (cn / exampleCn /
// usage) so the card never goes blank.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SEED_A = require("./seed.js");
const SEED_B = require("./seed-school.js");
const OUT = path.join(ROOT, "data", "words.json");
const API = (w) => `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pickAudio(phonetics) {
  if (!Array.isArray(phonetics)) return "";
  for (const p of phonetics) {
    if (p && p.audio && p.audio.startsWith("http")) return p.audio;
  }
  return "";
}
function pickPhonetic(entry, phonetics) {
  if (entry && entry.phonetic) return entry.phonetic;
  if (Array.isArray(phonetics)) {
    for (const p of phonetics) if (p && p.text) return p.text;
  }
  return "";
}

async function fetchWord(word) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(API(word));
      if (res.status === 429) { await sleep(900 * (attempt + 1)); continue; } // rate limited
      if (!res.ok) return null; // 404 => word not in dictionary
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) return null;
      return data;
    } catch (e) {
      await sleep(600);
    }
  }
  return null;
}

async function parseApi(data) {
  if (!Array.isArray(data) || !data.length) return null;
  const entry = data[0];
  const phonetics = entry.phonetics || [];
  const audio = pickAudio(phonetics);
  const phonetic = pickPhonetic(entry, phonetics);
  const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
  const pos = meanings.length ? meanings[0].partOfSpeech || "" : "";
  let en = "";
  const examples = [];
  const synSet = new Set();
  const antSet = new Set();
  for (const m of meanings) {
    const defs = Array.isArray(m.definitions) ? m.definitions : [];
    if (!en && defs.length) en = defs[0].definition || "";
    if (Array.isArray(m.synonyms)) m.synonyms.forEach((s) => s && synSet.add(s));
    if (Array.isArray(m.antonyms)) m.antonyms.forEach((s) => s && antSet.add(s));
    for (const d of defs) {
      if (d.example && examples.length < 5) examples.push(d.example);
      if (Array.isArray(d.synonyms)) d.synonyms.forEach((s) => s && synSet.add(s));
      if (Array.isArray(d.antonyms)) d.antonyms.forEach((s) => s && antSet.add(s));
    }
  }
  return {
    phonetic, audio, pos, en,
    examples: examples.slice(0, 4),
    synonyms: Array.from(synSet).slice(0, 8),
    antonyms: Array.from(antSet).slice(0, 8),
  };
}

async function main() {
  // Merge both seeds, dedupe by lowercase word (keep first occurrence).
  const SEED = SEED_A.concat(SEED_B);
  const seen = new Set();
  const unique = [];
  for (const s of SEED) {
    const key = s.word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
  }
  const out = [];
  let done = 0;
  let ok = 0;
  console.log(`Building words.json from ${unique.length} unique words (of ${SEED.length} seed entries)...`);

  for (const seed of unique) {
    let parsed = null;
    const data = await fetchWord(seed.word);
    if (data) parsed = await parseApi(data);
    const examples = [];
    if (parsed && parsed.examples.length) {
      examples.push({ en: parsed.examples[0], cn: seed.exampleCn || "" });
      parsed.examples.slice(1).forEach((en) => examples.push({ en, cn: "" }));
    } else if (seed.exampleCn) {
      examples.push({ en: "", cn: seed.exampleCn });
    }
    const entry = {
      word: seed.word,
      level: seed.level,
      pos: (parsed && parsed.pos) || seed.pos || "",
      phonetic: (parsed && parsed.phonetic) || "",
      audio: (parsed && parsed.audio) || "",
      cn: seed.cn || "",
      en: (parsed && parsed.en) || seed.cn || "",
      examples,
      synonyms: (parsed && parsed.synonyms) || [],
      antonyms: (parsed && parsed.antonyms) || [],
      usage: seed.usage || "",
    };
    if (parsed) ok++;
    out.push(entry);
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${unique.length} processed (api hits: ${ok})`);
    await sleep(280); // pace to avoid rate limiting
  }

  // stable sort: by level order then word
  const order = { PRIMARY: 0, JUNIOR: 1, SENIOR: 2, CET4: 3, CET6: 4, KAOYAN: 5, IELTS: 6 };
  out.sort((a, b) => (order[a.level] - order[b.level]) || a.word.localeCompare(b.word));

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.length} words to ${OUT} (API enriched: ${ok}, fallback: ${out.length - ok})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
