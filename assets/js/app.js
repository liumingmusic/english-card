/* 背单词软件 — 前端逻辑（纯静态、零构建、无 API key、运行时零联网）。
   词表全部内置在 data/words.json，前端只读本地 JSON。 */
(function () {
  "use strict";

  const LS = { fav: "ec_fav", mastered: "ec_mastered", review: "ec_review" };
  const LEVEL_LABEL = {
    PRIMARY: "小学", JUNIOR: "初中", SENIOR: "高中",
    CET4: "四级", CET6: "六级", KAOYAN: "考研", IELTS: "雅思",
  };
  // 单词本选择：全部 + 7 个级别 + 收藏 + 待复习
  const BOOKS = [
    { key: "ALL", label: "全部" },
    { key: "PRIMARY", label: "小学" },
    { key: "JUNIOR", label: "初中" },
    { key: "SENIOR", label: "高中" },
    { key: "CET4", label: "四级" },
    { key: "CET6", label: "六级" },
    { key: "KAOYAN", label: "考研" },
    { key: "IELTS", label: "雅思" },
    { key: "FAV", label: "收藏" },
    { key: "REVIEW", label: "待复习" },
  ];

  const state = {
    words: [],
    byWord: {},
    book: "ALL",
    filterText: "",
    current: null,
    bookList: [],
  };

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
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
    if (!word) return;
    if (audioUrl) {
      const a = new Audio(audioUrl);
      a.play().catch(() => speechFallback(word));
      return;
    }
    speechFallback(word);
  }

  /* ---------- word-book filtering ---------- */
  function getBookWords() {
    let arr = state.words.slice();
    if (state.book === "FAV") arr = arr.filter((w) => inSet(LS.fav, w.word));
    else if (state.book === "REVIEW") arr = arr.filter((w) => inSet(LS.review, w.word));
    else if (state.book !== "ALL") arr = arr.filter((w) => w.level === state.book);
    if (state.filterText) {
      const q = state.filterText.toLowerCase();
      arr = arr.filter((w) => w.word.toLowerCase().includes(q) || (w.cn || "").toLowerCase().includes(q));
    }
    state.bookList = arr;
    return arr;
  }

  /* ---------- rendering: book chips ---------- */
  function renderBookChips() {
    const box = $("bookChips");
    box.innerHTML = "";
    BOOKS.forEach((b) => {
      const el = document.createElement("button");
      el.className = "book-chip" + (b.key === state.book ? " active" : "");
      el.textContent = b.label;
      el.addEventListener("click", () => setBook(b.key));
      box.appendChild(el);
    });
  }

  /* ---------- rendering: word list (scrollable) ---------- */
  function renderList() {
    const arr = getBookWords();
    const list = $("wordList");
    list.innerHTML = "";
    $("listMeta").textContent = `共 ${arr.length} 个单词`;
    if (!arr.length) {
      list.innerHTML = '<li class="hint">这个单词本里还没有单词。</li>';
      return;
    }
    arr.forEach((w) => {
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
      li.addEventListener("click", () => selectWord(w));
      list.appendChild(li);
    });
  }

  /* ---------- rendering: word detail (scrollable page) ---------- */
  function renderDetail() {
    const w = state.current;
    if (!w) return;
    $("dEmpty").hidden = true;
    $("dBody").hidden = false;
    $("dWord").textContent = w.word;
    $("dPhon").textContent = w.phonetic || "（音标缺失，点 🔊 用语音合成发音）";
    $("dLevel").textContent = LEVEL_LABEL[w.level] || w.level || "—";
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
    } else box.innerHTML = '<div class="tip">暂无例句</div>';

    // synonyms / antonyms (clickable to navigate if in library)
    renderChips($("dSyn"), w.synonyms, "暂无同义词");
    renderChips($("dAnt"), w.antonyms, "暂无反义词");

    // usage
    const us = $("dUsage");
    if (w.usage) us.innerHTML = esc(w.usage);
    else {
      const lv = LEVEL_LABEL[w.level] || w.level || "";
      us.innerHTML = `该词属于 <b>${esc(lv)}</b> 词表，词性 <b>${esc(w.pos || "—")}</b>。` +
        `中文释义：${esc(w.cn || "—")}。建议结合上方例句体会实际用法。`;
    }

    // action button states
    $("dFav").classList.toggle("active", inSet(LS.fav, w.word));
    $("dFav").textContent = inSet(LS.fav, w.word) ? "★ 已收藏" : "☆ 收藏";
    $("dMaster").classList.toggle("active", inSet(LS.mastered, w.word));
    $("dMaster").textContent = inSet(LS.mastered, w.word) ? "✓ 已掌握" : "✓ 标记掌握";
    $("dReview").classList.toggle("active", inSet(LS.review, w.word));
    $("dReview").textContent = inSet(LS.review, w.word) ? "↺ 复习中" : "↺ 待复习";
  }

  function renderChips(container, arr, emptyText) {
    container.innerHTML = "";
    if (arr && arr.length) {
      arr.forEach((s) => {
        const has = !!state.byWord[s.toLowerCase()];
        const c = document.createElement("button");
        c.className = "chip" + (has ? " has-word" : "");
        c.textContent = s;
        if (has) c.addEventListener("click", () => selectWord(state.byWord[s.toLowerCase()]));
        else c.addEventListener("click", () => speak(s, ""));
        container.appendChild(c);
      });
    } else {
      container.innerHTML = `<span class="chip empty-note">${emptyText}</span>`;
    }
  }

  /* ---------- progress ---------- */
  function updateProgress() {
    $("masteredCount").textContent = lsGet(LS.mastered).length;
    $("favCount").textContent = lsGet(LS.fav).length;
  }

  /* ---------- selection / navigation ---------- */
  function selectWord(raw) {
    state.current = normalize(raw);
    renderDetail();
    renderList(); // refresh active highlight
    if (window.matchMedia("(max-width: 860px)").matches) {
      document.body.classList.add("show-detail");
    }
    const sc = $("detailScroll");
    if (sc) sc.scrollTop = 0;
  }

  function selectFirstOfBook() {
    const arr = getBookWords();
    if (arr.length) selectWord(arr[0]);
    else { state.current = null; $("dEmpty").hidden = false; $("dBody").hidden = true; renderList(); }
  }

  function setBook(key) {
    state.book = key;
    renderBookChips();
    selectFirstOfBook();
  }

  function step(dir) {
    const arr = state.bookList.length ? state.bookList : getBookWords();
    if (!arr.length) return;
    let idx = arr.findIndex((w) => state.current && w.word === state.current.word);
    if (idx < 0) idx = 0;
    else idx = (idx + dir + arr.length) % arr.length;
    selectWord(arr[idx]);
  }

  function toggleStatus(key, exclusive) {
    if (!state.current) return;
    const on = toggleSet(key, state.current.word);
    if (on && exclusive) toggleSet(exclusive, state.current.word); // 掌握/复习互斥
    renderDetail();
    renderList();
    updateProgress();
  }

  /* ---------- events ---------- */
  function bind() {
    $("dSpeak").addEventListener("click", () => { if (state.current) speak(state.current.word, state.current.audio); });
    $("dPrev").addEventListener("click", () => step(-1));
    $("dNext").addEventListener("click", () => step(1));
    $("dFav").addEventListener("click", () => toggleStatus(LS.fav));
    $("dMaster").addEventListener("click", () => toggleStatus(LS.mastered, LS.review));
    $("dReview").addEventListener("click", () => toggleStatus(LS.review, LS.mastered));
    $("searchInput").addEventListener("input", (e) => {
      state.filterText = e.target.value.trim();
      renderList();
    });
    $("backBtn").addEventListener("click", () => document.body.classList.remove("show-detail"));
    // keyboard: j/k or arrows to move; esc to close mobile detail
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); step(-1); }
      else if (e.key === "Escape") document.body.classList.remove("show-detail");
    });
  }

  /* ---------- init ---------- */
  async function init() {
    bind();
    state.words = (await loadJSON("./data/words.json")) || [];
    state.words.forEach((w) => { state.byWord[w.word.toLowerCase()] = w; });
    if (!state.words.length) {
      $("listMeta").textContent = "词表加载失败";
      return;
    }
    updateProgress();
    renderBookChips();
    selectFirstOfBook();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
