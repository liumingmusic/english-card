/* 每日英语单词卡片 — front-end logic (vanilla JS, no build, no key, no runtime API).
   所有单词数据均内置在 data/words.json / 每日快照中，前端只读本地 JSON，
   绝不向云端发请求，加载快、可离线、永不空屏。 */
(function () {
  "use strict";

  const LS = { fav: "ec_fav", mastered: "ec_mastered", review: "ec_review", seen: "ec_seen" };
  const LEVEL_LABEL = {
    PRIMARY: "小学", JUNIOR: "初中", SENIOR: "高中",
    CET4: "四级", CET6: "六级", KAOYAN: "考研", IELTS: "雅思",
  };

  const state = {
    words: [],
    byWord: {},
    manifest: null,
    current: null,
    mode: "today",
    filterLevel: "ALL",
    filterText: "",
    reviewQueue: [],
    reviewPos: 0,
    browseList: [],
    browsePos: 0,
  };

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const todayStr = (d) => {
    d = d || new Date();
    const z = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  };
  function dateIndex(s, n) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % n;
  }
  async function loadJSON(url) {
    try {
      const r = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }
  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function inSet(key, word) { return lsGet(key).includes(word); }
  function toggleSet(key, word) {
    const s = new Set(lsGet(key));
    if (s.has(word)) s.delete(word); else s.add(word);
    const arr = Array.from(s);
    lsSet(key, arr);
    return arr.includes(word);
  }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function normalize(w) {
    const examples = [];
    if (Array.isArray(w.examples) && w.examples.length) {
      w.examples.forEach((e) => examples.push({ en: e.en || "", cn: e.cn || "" }));
    } else if (w.example || w.exampleCn) {
      examples.push({ en: w.example || "", cn: w.exampleCn || "" });
    }
    return {
      word: w.word || "",
      level: w.level || "",
      pos: w.pos || "",
      phonetic: w.phonetic || "",
      audio: w.audio || "",
      cn: w.cn || "",
      en: w.en || w.cn || "",
      examples,
      synonyms: Array.isArray(w.synonyms) ? w.synonyms : [],
      antonyms: Array.isArray(w.antonyms) ? w.antonyms : [],
      usage: w.usage || "",
      _source: w._source || "builtin",
    };
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

  /* ---------- status badges ---------- */
  function statusBadgesHTML(word) {
    let h = "";
    if (inSet(LS.fav, word)) h += '<span class="cbadge fav">★ 收藏</span>';
    if (inSet(LS.mastered, word)) h += '<span class="cbadge mastered">✓ 已掌握</span>';
    if (inSet(LS.review, word)) h += '<span class="cbadge review">↺ 待复习</span>';
    return h;
  }

  /* ---------- rendering ---------- */
  function renderCard() {
    const w = state.current;
    if (!w) return;
    $("wordText").textContent = w.word;
    $("phoneticText").textContent = w.phonetic || "（内置音标缺失，点击发音可用语音合成）";
    $("levelTag").textContent = LEVEL_LABEL[w.level] || w.level || "—";
    $("summaryText").textContent = w.cn || w.en || "";
    $("posText").textContent = w.pos || "";
    $("cnText").textContent = w.cn || "";
    $("enText").textContent = w.en || "";
    $("backExample").innerHTML = (w.examples && w.examples[0])
      ? `<div class="e-en">${esc(w.examples[0].en)}</div>` + (w.examples[0].cn ? `<div class="e-cn">${esc(w.examples[0].cn)}</div>` : "")
      : '<span class="tip">暂无例句</span>';
    const bh = statusBadgesHTML(w.word);
    $("cornerBadges").innerHTML = bh;
    $("cornerBadgesBack").innerHTML = bh;
    $("btnFav").classList.toggle("active", inSet(LS.fav, w.word));
    $("btnMaster").classList.toggle("active", inSet(LS.mastered, w.word));
    $("btnReview").classList.toggle("active", inSet(LS.review, w.word));
    $("btnFav").textContent = inSet(LS.fav, w.word) ? "★ 已收藏" : "☆ 收藏";
    $("btnMaster").textContent = inSet(LS.mastered, w.word) ? "✓ 已掌握" : "✓ 标记掌握";
    $("btnReview").textContent = inSet(LS.review, w.word) ? "↺ 复习中" : "↺ 待复习";
    $("card").classList.remove("flipped");
  }

  function renderDetail() {
    const w = state.current;
    if (!w) return;
    $("dPos").textContent = w.pos || "—";
    $("dCn").textContent = w.cn || "—";
    $("dEn").textContent = w.en || "—";
    // examples
    const box = $("dExamples");
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
      box.innerHTML = '<div class="tip">暂无例句</div>';
    }
    // synonyms
    const syn = $("dSyn");
    syn.innerHTML = "";
    if (w.synonyms && w.synonyms.length) {
      w.synonyms.forEach((s) => {
        const has = !!state.byWord[s.toLowerCase()];
        const c = document.createElement("button");
        c.className = "chip" + (has ? " has-word" : "");
        c.textContent = s;
        if (has) c.addEventListener("click", () => { showWord(state.byWord[s.toLowerCase()]); closeSidebar(); });
        else c.addEventListener("click", () => speak(s, ""));
        syn.appendChild(c);
      });
    } else syn.innerHTML = '<span class="chip empty-note">暂无同义词</span>';
    // antonyms
    const ant = $("dAnt");
    ant.innerHTML = "";
    if (w.antonyms && w.antonyms.length) {
      w.antonyms.forEach((s) => {
        const has = !!state.byWord[s.toLowerCase()];
        const c = document.createElement("button");
        c.className = "chip" + (has ? " has-word" : "");
        c.textContent = s;
        if (has) c.addEventListener("click", () => { showWord(state.byWord[s.toLowerCase()]); closeSidebar(); });
        else c.addEventListener("click", () => speak(s, ""));
        ant.appendChild(c);
      });
    } else ant.innerHTML = '<span class="chip empty-note">暂无反义词</span>';
    // usage
    const us = $("dUsage");
    if (w.usage) {
      us.innerHTML = esc(w.usage);
    } else {
      const lv = LEVEL_LABEL[w.level] || w.level || "";
      us.innerHTML = `该词属于 <b>${esc(lv)}</b> 词表，词性 <b>${esc(w.pos || "—")}</b>。` +
        `中文释义：${esc(w.cn || "—")}。建议结合上方例句体会实际用法。`;
    }
  }

  function updateProgress() {
    const seen = lsGet(LS.seen);
    const map = {};
    seen.forEach((d) => { (map[d.date] = map[d.date] || new Set()).add(d.word); });
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

  function showWord(raw) {
    state.current = normalize(raw);
    renderCard();
    renderDetail();
    markSeen(state.current.word);
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
    if (pick) showWord(pick);
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
      arr = arr.filter((w) => w.word.toLowerCase().includes(q) || (w.cn || "").toLowerCase().includes(q));
    }
    state.browseList = arr;
    $("listMeta").textContent = `共 ${arr.length} 个单词`;
    if (!arr.length) { list.innerHTML = '<li class="hint">没有匹配的单词</li>'; return; }
    arr.forEach((w, i) => {
      const li = document.createElement("li");
      if (state.current && state.current.word === w.word) li.classList.add("active");
      let flags = "";
      if (inSet(LS.fav, w.word)) flags += '<span class="fav" title="收藏">★</span>';
      if (inSet(LS.mastered, w.word)) flags += '<span class="mastered" title="已掌握">✓</span>';
      if (inSet(LS.review, w.word)) flags += '<span class="review" title="待复习">↺</span>';
      li.innerHTML =
        `<div class="wl-main"><div class="wl-word">${esc(w.word)}<span class="wl-phon">${esc(w.phonetic)}</span></div>` +
        `<div class="wl-cn">${esc(w.cn || "")}</div></div>` +
        `<div class="wl-right"><span class="lv-badge">${esc(LEVEL_LABEL[w.level] || w.level)}</span>` +
        `<span class="wl-flags">${flags}</span></div>`;
      li.addEventListener("click", () => { showWord(w); closeSidebar(); });
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
    state.reviewQueue.forEach((w) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<div class="wl-main"><div class="wl-word">${esc(w.word)}<span class="wl-phon">${esc(w.phonetic)}</span></div>` +
        `<div class="wl-cn">${esc(w.cn || "")}</div></div>` +
        `<span class="lv-badge">${esc(LEVEL_LABEL[w.level] || w.level)}</span>`;
      li.addEventListener("click", () => { showWord(w); closeSidebar(); });
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
      const snap = await loadJSON("./" + d.file);
      const w = snap && snap.word ? snap.word : null;
      const li = document.createElement("li");
      li.innerHTML =
        `<div class="wl-main"><div class="wl-word">${esc(d.word || "")}<span class="wl-phon">${esc(w ? w.phonetic : "")}</span></div>` +
        `<div class="wl-cn">${esc(d.date)} · ${esc(w ? (w.cn || "") : "")}</div></div>` +
        `<span class="lv-badge">${esc(LEVEL_LABEL[d.level] || d.level || "")}</span>`;
      li.addEventListener("click", async () => {
        const s = await loadJSON("./" + d.file);
        if (s && s.word) { showWord(s.word); closeSidebar(); }
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
    const titles = { browse: "词库浏览", review: "复习模式", history: "历史回看", today: "今日单词" };
    $("sideTitle").textContent = titles[mode] || "词库浏览";
    if (mode === "browse") renderBrowse();
    if (mode === "review") renderReview();
    if (mode === "history") renderHistory();
    if (mode === "today") showToday();
  }

  async function nextWord() {
    if (state.mode === "review" && state.reviewQueue.length) {
      state.reviewPos = (state.reviewPos + 1) % state.reviewQueue.length;
      showWord(state.reviewQueue[state.reviewPos]);
      return;
    }
    if (state.mode === "browse" && state.browseList.length) {
      state.browsePos = (state.browsePos + 1) % state.browseList.length;
      showWord(state.browseList[state.browsePos]);
      return;
    }
    const w = pickRandomDifferent();
    if (w) showWord(w);
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
    $("speakFront").addEventListener("click", (e) => { e.stopPropagation(); if (state.current) speak(state.current.word, state.current.audio); });
    $("speakBack").addEventListener("click", (e) => { e.stopPropagation(); if (state.current) speak(state.current.word, state.current.audio); });
    $("btnSpeak").addEventListener("click", () => { if (state.current) speak(state.current.word, state.current.audio); });
    $("btnFlip").addEventListener("click", () => $("card").classList.toggle("flipped"));
    $("btnNext").addEventListener("click", nextWord);
    $("btnFav").addEventListener("click", () => { if (state.current) { toggleSet(LS.fav, state.current.word); renderCard(); renderDetail(); } });
    $("btnMaster").addEventListener("click", () => {
      if (!state.current) return;
      const on = toggleSet(LS.mastered, state.current.word);
      if (on) toggleSet(LS.review, state.current.word);
      renderCard(); renderDetail(); updateProgress();
    });
    $("btnReview").addEventListener("click", () => {
      if (!state.current) return;
      const on = toggleSet(LS.review, state.current.word);
      if (on) toggleSet(LS.mastered, state.current.word);
      renderCard(); renderDetail(); updateProgress();
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
      if (state.reviewQueue.length) { state.reviewPos = 0; showWord(state.reviewQueue[0]); closeSidebar(); }
    });
    document.querySelectorAll("#detailTabs .dtab").forEach((b) =>
      b.addEventListener("click", () => {
        document.querySelectorAll("#detailTabs .dtab").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        document.querySelectorAll(".dpanel").forEach((p) => p.classList.remove("active"));
        $("tab-" + b.dataset.tab).classList.add("active");
      })
    );
  }

  /* ---------- init ---------- */
  async function init() {
    bind();
    state.words = (await loadJSON("./data/words.json")) || [];
    state.manifest = (await loadJSON("./data/manifest.json")) || null;
    state.byWord = {};
    state.words.forEach((w) => { state.byWord[w.word.toLowerCase()] = w; });
    if (!state.words.length) {
      $("wordText").textContent = "词表加载失败";
      return;
    }
    updateProgress();
    await showToday();
    renderBrowse(); // pre-populate the word library so the sidebar isn't empty on open
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
