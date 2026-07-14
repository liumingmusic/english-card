#!/usr/bin/env node
// Daily fetch: pick today's word (deterministic by date), enrich it with the
// Free Dictionary API, write data/snapshots/YYYY-MM-DD.json and refresh
// data/manifest.json (newest first, keep last 60 days).
// No API key. If the API is unreachable, the snapshot falls back to built-in
// word data so there is always a "word of the day".
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WORDS_FILE = path.join(ROOT, "data", "words.json");
const SNAP_DIR = path.join(ROOT, "data", "snapshots");
const MANIFEST = path.join(ROOT, "data", "manifest.json");
const API = (w) => `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`;

function dateStr(d) {
  d = d || new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
// FNV-1a, must match the client-side picker in assets/js/app.js
function dateIndex(s, n) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % n;
}

async function fetchEnrich(word) {
  try {
    const r = await fetch(API(word));
    if (!r.ok) return null;
    const d = await r.json();
    if (!Array.isArray(d) || !d.length) return null;
    const entry = d[0];
    const phs = entry.phonetics || [];
    let audio = "", phonetic = entry.phonetic || "";
    for (const p of phs) if (p && p.audio && p.audio.startsWith("http")) { audio = p.audio; break; }
    if (!phonetic) for (const p of phs) if (p && p.text) { phonetic = p.text; break; }
    const meanings = entry.meanings || [];
    const pos = meanings.length ? meanings[0].partOfSpeech || "" : "";
    let en = "", examplesEn = [];
    for (const m of meanings) {
      const defs = m.definitions || [];
      if (!en && defs.length) en = defs[0].definition || "";
      for (const df of defs) if (df.example) examplesEn.push(df.example);
    }
    return { phonetic, audio, pos, en, examplesEn: examplesEn.slice(0, 3) };
  } catch (e) {
    return null;
  }
}

async function main() {
  if (!fs.existsSync(WORDS_FILE)) { console.error("words.json missing — run build-words.js first"); process.exit(1); }
  const words = JSON.parse(fs.readFileSync(WORDS_FILE, "utf8"));
  if (!Array.isArray(words) || !words.length) { console.error("words.json empty"); process.exit(1); }

  const date = dateStr();
  const idx = dateIndex(date, words.length);
  const base = words[idx];
  console.log(`Today (${date}) selected: ${base.word} (index ${idx})`);

  const enriched = await fetchEnrich(base.word);
  let source = "builtin";
  let phonetic = base.phonetic || "";
  let audio = base.audio || "";
  let pos = base.pos || "";
  let en = base.en || base.cn || "";
  const examples = [];
  if (base.example || base.exampleCn) examples.push({ en: base.example || "", cn: base.exampleCn || "" });
  if (enriched) {
    source = "dictionaryapi+builtin";
    if (enriched.phonetic) phonetic = enriched.phonetic;
    if (enriched.audio) audio = enriched.audio;
    if (enriched.pos) pos = enriched.pos;
    if (enriched.en) en = enriched.en;
    if (enriched.examplesEn.length) {
      enriched.examplesEn.forEach((ex, i) => {
        if (i === 0 && (base.exampleCn)) examples[0] = { en: ex, cn: base.exampleCn };
        else examples.push({ en: ex, cn: "" });
      });
    }
  }

  const word = {
    word: base.word, phonetic, audio, pos, cn: base.cn || "", en, level: base.level || "",
    examples,
  };
  const snapshot = { generatedAt: new Date().toISOString(), date, word, source };

  fs.mkdirSync(SNAP_DIR, { recursive: true });
  const snapFile = path.join(SNAP_DIR, `${date}.json`);
  fs.writeFileSync(snapFile, JSON.stringify(snapshot, null, 2));
  console.log(`Wrote snapshot: ${path.relative(ROOT, snapFile)} (source=${source})`);

  // refresh manifest (newest first, keep 60)
  let manifest = { updatedAt: "", days: [] };
  if (fs.existsSync(MANIFEST)) {
    try { manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")); } catch (e) {}
  }
  if (!Array.isArray(manifest.days)) manifest.days = [];
  manifest.days = manifest.days.filter((d) => d.date !== date);
  manifest.days.unshift({ date, word: base.word, level: base.level || "", file: `data/snapshots/${date}.json` });
  manifest.days = manifest.days.slice(0, 60);
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`Manifest updated: ${manifest.days.length} days, newest ${manifest.days[0].date}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
