/* 每日英语单词卡片 — front-end logic (vanilla JS, no build, no key) */
(function () {
  "use strict";

  const API = "https://api.dictionaryapi.dev/api/v2/entries/en/";
  const LS = { fav: "ec_fav", mastered: "ec_mastered", review: "ec_review", seen: "ec_seen" };

  const state = {
    words: [],
    manifest: null,
    current: null,      // normalized current word
    mode: "today",      // today | review | browse | history
    filterLevel: "ALL",
    filterText: "",
    reviewQueue: [],
    reviewPos: 0,
    browseList: [],
    browsePos: 0,
    loading: false,
  };

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const todayStr = (d) => {
    d = d || new Date();
    const z = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  };
  function dateIndex(dateStr, n) {
    let h = 2166136261;
    for (let i = 0; i < dateStr.length; i++) {
      h ^= dateStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % n;
  }
  async function loadJSON(url) {
    try {
      const r = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  }
  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function normalize(w) {
    const examples = [];
    if (Array.isArray(w.examples) && w.examples.length) {
      w.examples.forEach((e) => examples.push({ en: e.en || "", cn: e.cn || "" }));
    } else if (w.example || w.exampleCn) {
      examples.push({ en: w.example || "", cn: w.exampleCn || "" });
    }
    return {
      word: w.word || "",
      phonetic: w.phonetic || "",
      audio: w.audio || "",
      pos: w.pos || "",
      cn: w.cn || "",
      en: w.en || "",
      level: w.level || "",
      examples: examples,
      _source: w._source || "builtin",
    };
  }
  function inSet(key, word) { return lsGet(key).includes(word); }
  function toggleSet(key, word) {
    const s = new Set(lsGet(key));
    if (s.has(word)) s.delete(word); else s.add(word);
    const arr = Array.from(s);
    lsSet(key, arr);
    return arr.includes(word);
  }

  /* ---------- pronunciation ---------- */
  function speechFallback(word) {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US"; u.rate = 0.95;
    try { speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
  }
  function speak(word, audioUrl) {
    if (audioUrl) {
      const a = new Audio(audioUrl);
      a.play().catch(() => speechFallback(word));
      return;
    }
    speechFallback(word);
  }

  /* ---------- live API enrichment (optional, silent fallback) ---------- */
  async function enrich(word) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 4000);
      const r = await fetch(API + encodeURIComponent(word), { signal: c.signal });
      clearTimeout(t);
      if (!r.ok) return null;
      const d = await r.json();
      if (!Array.isArray(d) || !d.length) return null;
      const entry = d[0];
      const phs = entry.phonetics || [];
      let audio = "", phonetic = entry.phonetic || "";
      for (const p of phs) { if (p && p.audio && p.audio.startsWith("http")) { audio = p.audio; break; } }
      if (!phonetic) for (const p of phs) if (p && p.text) { phonetic = p.text; break; }
      const meanings = entry.meanings || [];
      const pos = meanings.length ? meanings[0].partOfSpeech || "" : "";
      let en = "", exampleEn = "";
      for (const m of meanings) {
        const defs = m.definitions || [];
        if (!en && defs.length) en = defs[0].definition || "";
        for (const df of defs) { if (!exampleEn && df.example) { exampleEn = df.example; break; } }
        if (en && exampleEn) break;
      }
      return { phonetic, audio, pos, en, exampleEn };
    } catch (e) {
      return null;
    }
  }

  /* ---------- rendering ---------- */
  function statusBadgesHTML(word) {
    let h = "";
    if (inSet(LS.fav, word)) h += '<span class="cbadge fav">★ 收藏</span>';
    if (inSet(LS.mastered, word)) h += '<span class="cbadge mastered">✓ 已掌握</span>';
    if (inSet(LS.review, word)) h += '<span class="cbadge review">↺ 待复习</span>';
    return h;
  }

  function renderCard() {
    const w = state.current;
    if (!w) return;
    $("wordText").textContent = w.word;
    $("phoneticText").textContent = w.phonetic || "（内置音标缺失，点击发音可用语音合成）";
    $("levelTag").textContent = w.level || "—";
    $("posText").textContent = w.pos || "";
    $("cnText").textContent = w.cn || "";
    $("enText").textContent = w.en || "";
    // examples
    const box = $("examplesBox");
    box.innerHTML = "";
    if (w.examples && w.examples.length) {
      w.examples.forEach((e) => {
        const div = document.createElement("div");
        div.className = "ex";
        if (e.en) { const a = document.createElement("div"); a.className = "e-en"; a.textContent = e.en; div.appendChild(a); }
        if (e.cn) { const b = document.createElement("div"); b.className = "e-cn"; b.textContent = e.cn; div.appendChild(b); }
        box.appendChild(div);
      });
    } else {
      box.innerHTML = '<div class="hint">暂无例句</div>';
    }
    // badges
    const bh = statusBadgesHTML(w.word);
    $("cornerBadges").innerHTML = bh;
    $("cornerBadgesBack").innerHTML = bh;
    // button states
    $("btnFav").classList.toggle("active", inSet(LS.fav, w.word));
    $("btnMaster").classList.toggle("active", inSet(LS.mastered, w.word));
    $("btnReview").classList.toggle("active", inSet(LS.review, w.word));
    $("btnFav").textContent = inSet(LS.fav, w.word) ? "★ 已收藏" : "☆ 收藏";
    $("btnMaster").textContent = inSet(LS.mastered, w.word) ? "✓ 已掌握" : "✓ 标记掌握";
    $("btnReview").textContent = inSet(LS.review, w.word) ? "↺ 复习中" : "↺ 待复习";
    // reset flip
    $("card").classList.remove("flipped");
  }

  function updateProgress() {
    const seen = lsGet(LS.seen);
    const map = {};
    seen.forEach((d) => { map[d.date] = map[d.date] || new Set(); map[d.date].add(d.word); });
    const today = todayStr();
    $("learnedCount").textContent = map[today] ? map[today].size : 0;
    $("masteredCount").textContent = lsGet(LS.mastered).length;
    $("todayDate").textContent = today;
  }

  function markSeen(word) {
    const seen = lsGet(LS.seen);
    const today = todayStr();
    if (!seen.some((d) => d.date === today && d.word === word)) {
      seen.push({ date: today, word });
      lsSet(LS.seen, seen);
    }
    updateProgress();
  }

  async function showWord(raw, opts) {
    opts = opts || {};
    state.current = normalize(raw);
    renderCard();
    markSeen(state.current.word);
    if (opts.enrich !== false) {
      const e = await enrich(state.current.word);
      if (e) {
        state.current.phonetic = e.phonetic || state.current.phonetic;
        state.current.audio = e.audio || state.current.audio;
        state.current.pos = e.pos || state.current.pos;
        state.current.en = e.en || state.current.en;
        if (e.exampleEn) {
          const base = state.current.examples[0] ? state.current.examples[0].cn : (raw.exampleCn || "");
          state.current.examples = [{ en: e.exampleEn, cn: base }];
        }
        renderCard();
      }
    }
  }

  /* ---------- today's word ---------- */
  async function showToday() {
    const today = todayStr();
    let pick = null;
    if (state.manifest && Array.isArray(state.manifest.days)) {
      const hit = state.manifest.days.find((d) => d.date === today);
      if (hit && hit.file) {
        const snap = await loadJSON("./" + hit.file);
        if (snap && snap.word) pick = Object.assign({}, snap.word, { _source: snap.source || "snapshot" });
      }
    }
    if (!pick && state.words.length) {
      const idx = dateIndex(today, state.words.length);
      pick = state.words[idx];
    }
    if (pick) await showWord(pick, { enrich: !!pick.audio ? false : true });
  }

  function pickRandomDifferent() {
    if (!state.words.length) return null;
    const cur = state.current ? state.current.word : null;
    let idx, guard = 0;
    do { idx = Math.floor(Math.random() * state.words.length); guard++; }
    while (state.words[idx].word === cur && guard < 20);
    return state.words[idx];
  }

  /* ---------- sidebar panels ---------- */
  function renderBrowse() {
    const list = $("wordList");
    list.innerHTML = "";
    let arr = state.words.slice();
    if (state.filterLevel !== "ALL") arr = arr.filter((w) => w.level === state.filterLevel);
    if (state.filterText) {
      const q = state.filterText.toLowerCase();
      arr = arr.filter((w) => w.word.toLowerCase().includes(q) || (w.cn || "").includes(state.filterText));
    }
    state.browseList = arr;
    if (!arr.length) { list.innerHTML = '<li class="hint">没有匹配的单词</li>'; return; }
    arr.forEach((w, i) => {
      const li = document.createElement("li");
      if (state.current && state.current.word === w.word) li.classList.add("active");
      li.dataset.idx = i;
      let flags = "";
      if (inSet(LS.fav, w.word)) flags += '<span title="收藏">★</span>';
      if (inSet(LS.mastered, w.word)) flags += '<span title="已掌握" style="color:var(--mint)">✓</span>';
      if (inSet(LS.review, w.word)) flags += '<span title="待复习" style="color:var(--rose)">↺</span>';
      li.innerHTML =
        `<div style="min-width:0"><div class="wl-word">${w.word}</div><div class="wl-cn">${w.cn || ""}</div></div>` +
        `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px"><span class="wl-tag">${w.level}</span><span class="wl-flags">${flags}</span></div>`;
      li.addEventListener("click", () => {
        state.browsePos = i;
        showWord(w, { enrich: true });
        closeSidebar();
      });
      list.appendChild(li);
    });
  }

  function renderReview() {
    const list = $("reviewList");
    list.innerHTML = "";
    const set = lsGet(LS.review);
    state.reviewQueue = state.words.filter((w) => set.includes(w.word));
    $("reviewStat").textContent = `共 ${state.reviewQueue.length} 个待复习`;
    if (!state.reviewQueue.length) {
      list.innerHTML = '<li class="hint">还没有「待复习」的单词。在卡片上点「待复习」即可加入。</li>';
      return;
    }
    state.reviewQueue.forEach((w, i) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<div style="min-width:0"><div class="wl-word">${w.word}</div><div class="wl-cn">${w.cn || ""}</div></div>` +
        `<span class="wl-tag">${w.level}</span>`;
      li.addEventListener("click", () => { state.reviewPos = i; showWord(w, { enrich: true }); closeSidebar(); });
      list.appendChild(li);
    });
  }

  async function renderHistory() {
    const list = $("historyList");
    list.innerHTML = "";
    if (!state.manifest || !Array.isArray(state.manifest.days)) {
      list.innerHTML = '<li class="hint">暂无历史快照。每日 06:00（北京）自动生成。</li>';
      return;
    }
    const days = state.manifest.days.filter((d) => d.date !== todayStr()).slice(0, 30);
    if (!days.length) { list.innerHTML = '<li class="hint">暂无历史记录。</li>'; return; }
    for (const d of days) {
      const li = document.createElement("li");
      li.innerHTML =
        `<div style="min-width:0"><div class="wl-word">${d.word || ""}</div><div class="wl-cn">${d.date}</div></div>` +
        `<span class="wl-tag">${d.level || ""}</span>`;
      li.addEventListener("click", async () => {
        const snap = await loadJSON("./" + d.file);
        if (snap && snap.word) { showWord(snap.word, { enrich: false }); closeSidebar(); }
      });
      list.appendChild(li);
    }
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll(".mode-pill").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $("panelBrowse").classList.toggle("hidden", mode !== "browse");
    $("panelReview").classList.toggle("hidden", mode !== "review");
    $("panelHistory").classList.toggle("hidden", mode !== "history");
    const titles = { browse: "词表浏览", review: "复习模式", history: "历史回看", today: "今日单词" };
    $("sideTitle").textContent = titles[mode] || "词表浏览";
    if (mode === "browse") renderBrowse();
    if (mode === "review") renderReview();
    if (mode === "history") renderHistory();
    if (mode === "today") showToday();
  }

  /* ---------- next ---------- */
  async function nextWord() {
    if (state.mode === "review" && state.reviewQueue.length) {
      state.reviewPos = (state.reviewPos + 1) % state.reviewQueue.length;
      await showWord(state.reviewQueue[state.reviewPos], { enrich: true });
      return;
    }
    if (state.mode === "browse" && state.browseList.length) {
      state.browsePos = (state.browsePos + 1) % state.browseList.length;
      await showWord(state.browseList[state.browsePos], { enrich: true });
      return;
    }
    const w = pickRandomDifferent();
    if (w) await showWord(w, { enrich: true });
  }

  /* ---------- sidebar open/close (mobile) ---------- */
  function openSidebar() { $("sidebar").classList.add("open"); $("scrim").classList.add("show"); }
  function closeSidebar() { $("sidebar").classList.remove("open"); $("scrim").classList.remove("show"); }

  /* ---------- events ---------- */
  function bind() {
    $("card").addEventListener("click", (e) => {
      if (e.target.closest(".speak-btn")) return;
      $("card").classList.toggle("flipped");
    });
    $("speakFront").addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.current) speak(state.current.word, state.current.audio);
    });
    $("btnSpeak").addEventListener("click", () => { if (state.current) speak(state.current.word, state.current.audio); });
    $("btnFlip").addEventListener("click", () => $("card").classList.toggle("flipped"));
    $("btnNext").addEventListener("click", nextWord);
    $("btnFav").addEventListener("click", () => { if (state.current) { toggleSet(LS.fav, state.current.word); renderCard(); } });
    $("btnMaster").addEventListener("click", () => {
      if (!state.current) return;
      const on = toggleSet(LS.mastered, state.current.word);
      if (on) toggleSet(LS.review, state.current.word); // mastered removes from review
      renderCard(); updateProgress();
    });
    $("btnReview").addEventListener("click", () => {
      if (!state.current) return;
      const on = toggleSet(LS.review, state.current.word);
      if (on) toggleSet(LS.mastered, state.current.word);
      renderCard(); updateProgress();
    });

    document.querySelectorAll(".mode-pill").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    document.querySelectorAll("#levelFilters .lv").forEach((b) =>
      b.addEventListener("click", () => {
        document.querySelectorAll("#levelFilters .lv").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        state.filterLevel = b.dataset.level;
        renderBrowse();
      })
    );
    $("searchInput").addEventListener("input", (e) => { state.filterText = e.target.value.trim(); renderBrowse(); });
    $("menuBtn").addEventListener("click", openSidebar);
    $("closeBtn").addEventListener("click", closeSidebar);
    $("scrim").addEventListener("click", closeSidebar);
    $("btnStartReview").addEventListener("click", () => {
      if (state.reviewQueue.length) { state.reviewPos = 0; showWord(state.reviewQueue[0], { enrich: true }); closeSidebar(); }
    });
  }

  /* ---------- init ---------- */
  async function init() {
    bind();
    state.words = (await loadJSON("./data/words.json")) || [];
    state.manifest = (await loadJSON("./data/manifest.json")) || null;
    if (!state.words.length) {
      $("wordText").textContent = "词表加载失败";
      return;
    }
    updateProgress();
    await showToday();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
