#!/usr/bin/env node
// Daily fetch: pick today's word (deterministic by date) from the fully built-in
// data/words.json and write data/snapshots/YYYY-MM-DD.json + refresh
// data/manifest.json (newest first, keep last 60 days).
//
// NOTE: words.json already contains the complete card data (phonetic / audio /
// synonyms / antonyms / examples / usage) baked in at BUILD time, so this script
// does NOT call any remote API — it is fully local and offline-safe. No API key.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WORDS_FILE = path.join(ROOT, "data", "words.json");
const SNAP_DIR = path.join(ROOT, "data", "snapshots");
const MANIFEST = path.join(ROOT, "data", "manifest.json");

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

async function main() {
  if (!fs.existsSync(WORDS_FILE)) { console.error("words.json missing — run build-words.js first"); process.exit(1); }
  const words = JSON.parse(fs.readFileSync(WORDS_FILE, "utf8"));
  if (!Array.isArray(words) || !words.length) { console.error("words.json empty"); process.exit(1); }

  const date = dateStr();
  const idx = dateIndex(date, words.length);
  const base = words[idx];
  console.log(`Today (${date}) selected: ${base.word} (index ${idx})`);

  // Copy the full baked-in word object into the snapshot.
  const word = {
    word: base.word,
    level: base.level || "",
    pos: base.pos || "",
    phonetic: base.phonetic || "",
    audio: base.audio || "",
    cn: base.cn || "",
    en: base.en || "",
    examples: Array.isArray(base.examples) ? base.examples : [],
    synonyms: Array.isArray(base.synonyms) ? base.synonyms : [],
    antonyms: Array.isArray(base.antonyms) ? base.antonyms : [],
    usage: base.usage || "",
  };
  const snapshot = { generatedAt: new Date().toISOString(), date, word, source: "builtin" };

  fs.mkdirSync(SNAP_DIR, { recursive: true });
  const snapFile = path.join(SNAP_DIR, `${date}.json`);
  fs.writeFileSync(snapFile, JSON.stringify(snapshot, null, 2));
  console.log(`Wrote snapshot: ${path.relative(ROOT, snapFile)} (source=${snapshot.source})`);

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
