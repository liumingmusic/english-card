#!/usr/bin/env node
// Build data/words.json from the curated seed by enriching each entry with the
// Free Dictionary API (phonetic / audio / pos / en / example). No API key needed.
// If the API is unreachable, the entry keeps a safe fallback (cn + exampleCn)
// so the card never goes blank.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SEED = require("./seed.js");
const OUT = path.join(ROOT, "data", "words.json");
const API = (w) => `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pick the first usable audio URL (prefer https).
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
      if (res.status === 429) { await sleep(800 * (attempt + 1)); continue; } // rate limited
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
  // collect meanings
  const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
  const pos = meanings.length ? meanings[0].partOfSpeech || "" : "";
  let en = "";
  let exampleEn = "";
  for (const m of meanings) {
    const defs = Array.isArray(m.definitions) ? m.definitions : [];
    if (!en && defs.length) en = defs[0].definition || "";
    for (const d of defs) {
      if (!exampleEn && d.example) { exampleEn = d.example; break; }
    }
    if (en && exampleEn) break;
  }
  return { phonetic, audio, pos, en, exampleEn };
}

async function main() {
  // Dedupe by word (keep first seed entry) to avoid wasted/duplicate API calls.
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
    const entry = {
      word: seed.word,
      level: seed.level,
      pos: (parsed && parsed.pos) || seed.pos || "",
      phonetic: (parsed && parsed.phonetic) || "",
      audio: (parsed && parsed.audio) || "",
      cn: seed.cn || "",
      en: (parsed && parsed.en) || seed.cn || "",
      example: (parsed && parsed.exampleEn) || "",
      exampleCn: seed.exampleCn || "",
    };
    if (parsed) ok++;
    out.push(entry);
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${unique.length} processed (api hits: ${ok})`);
    await sleep(300); // pace to avoid rate limiting
  }

  // stable sort: by level order then word
  const order = { CET4: 0, CET6: 1, KAOYAN: 2, IELTS: 3 };
  out.sort((a, b) => (order[a.level] - order[b.level]) || a.word.localeCompare(b.word));

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.length} words to ${OUT} (API enriched: ${ok}, fallback: ${out.length - ok})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
