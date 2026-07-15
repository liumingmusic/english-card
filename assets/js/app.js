/* 背单词软件 — 百词斩式背诵流（纯静态、零构建、无 API key、运行时零联网）。
   词表全部内置在 data/words.json，前端只读本地 JSON。 */
(function () {
  "use strict";

  const LS = { fav: "ec_fav", mastered: "ec_mastered", review: "ec_review" };
  const LEVEL_LABEL = {
    PRIMARY: "小学", JUNIOR: "初中", SENIOR: "高中",
    CET4: "四级", CET6: "六级", KAOYAN: "考研", IELTS: "雅思",
  };
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
    screen: "books",
    session: null,
    // browse 模式
    book: "ALL",
    filterText: "",
    current: null,
    bookList: [],
  };

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  function show(screen) {
    state.screen = screen;
    ["books", "study", "summary", "browse"].forEach((s) => {
      $("screen-" + s).classList.toggle("active", s === screen);
    });
    window.scrollTo(0, 0);
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
  function addSet(key, word) {
    if (!word) return;
    const s = new Set(lsGet(key)); s.add(word); lsSet(key, Array.from(s));
  }
  function removeSet(key, word) {
    if (!word) return;
    const s = new Set(lsGet(key)); s.delete(word); lsSet(key, Array.from(s));
  }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function labelFor(key) { const b = BOOKS.find((x) => x.key === key); return b ? b.label : key; }

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
  function getBookWords(bookKey, filterText) {
    let arr = state.words.slice();
    if (bookKey === "FAV") arr = arr.filter((w) => inSet(LS.fav, w.word));
    else if (bookKey === "REVIEW") arr = arr.filter((w) => inSet(LS.review, w.word));
    else if (bookKey !== "ALL") arr = arr.filter((w) => w.level === bookKey);
    if (filterText) {
      const q = filterText.toLowerCase();
      arr = arr.filter((w) => w.word.toLowerCase().includes(q) || (w.cn || "").toLowerCase().includes(q));
    }
    return arr;
  }

  /* ---------- progress ---------- */
  function updateProgress() {
    $("masteredCount").textContent = lsGet(LS.mastered).length;
    $("favCount").textContent = lsGet(LS.fav).length;
  }

  /* ============================================================
     屏幕 1：选单词本
     ============================================================ */
  function renderBookCards() {
    const grid = $("bookGrid");
    grid.innerHTML = "";
    BOOKS.forEach((b) => {
      const list = getBookWords(b.key, "");
      const mastered = list.filter((w) => inSet(LS.mastered, w.word)).length;
      const pct = list.length ? Math.round((mastered / list.length) * 100) : 0;
      const card = document.createElement("button");
      card.className = "book-card";
      card.innerHTML =
        `<div class="bc-top"><span class="bc-label">${esc(b.label)}</span>` +
        `<span class="bc-count">${list.length} 词</span></div>` +
        `<div class="bc-bar"><div class="bc-bar-fill" style="width:${pct}%"></div></div>` +
        `<div class="bc-sub">已掌握 ${mastered}</div>` +
        `<div class="bc-start">开始背单词 →</div>`;
      card.addEventListener("click", () => startStudy(b.key, {}));
      grid.appendChild(card);
    });
  }

  /* ============================================================
     屏幕 2：背单词（百词斩式）
     ============================================================ */
  function buildQuiz(word, pool) {
    // 干扰项来源：优先同本；不足 4 个词时用全词表
    const src = pool.length >= 4 ? pool : state.words;
    const distractPool = shuffle(
      src.filter((w) => w.word.toLowerCase() !== word.word.toLowerCase() && w.cn && w.cn.trim())
    );
    const reverse = Math.random() < 0.5; // 一半概率出"看释义选单词"
    const taken = [];
    const seen = new Set([reverse ? word.word : word.cn]);
    for (const w of distractPool) {
      const t = reverse ? w.word : w.cn;
      if (!seen.has(t)) { seen.add(t); taken.push(t); }
      if (taken.length >= 3) break;
    }
    if (reverse) {
      const opts = shuffle([word.word, ...taken]).map((t) => ({ text: t, correct: t === word.word }));
      return { type: "word", prompt: word.cn, q: "下面哪个是正确单词？", options: opts };
    } else {
      const opts = shuffle([word.cn, ...taken]).map((t) => ({ text: t, correct: t === word.cn }));
      return { type: "meaning", prompt: word.word, q: "这个单词是什么意思？", options: opts };
    }
  }

  function startStudy(bookKey, opts) {
    opts = opts || {};
    let list = getBookWords(bookKey, "");
    if (opts.onlyReview) {
      list = list.filter((w) => inSet(LS.review, w.word));
      if (!list.length) { alert("这一本里还没有「待复习」的单词，先去背一轮吧～"); return; }
    }
    if (!list.length) { alert("这个单词本里还没有单词。"); return; }
    state.session = {
      bookKey, bookLabel: labelFor(bookKey),
      list, idx: 0, answered: false, quiz: null, current: null,
      known: [], unknown: [], skip: 0,
    };
    show("study");
    renderStudy();
  }

  function renderStudy() {
    const s = state.session;
    const w = s.list[s.idx];
    s.current = w;
    s.answered = false;

    $("studyTitle").textContent = s.bookLabel;
    $("studyCount").textContent = (s.idx + 1) + " / " + s.list.length;
    $("studyFill").style.width = (s.idx / s.list.length * 100) + "%";

    $("scWord").textContent = w.word;
    $("scPhon").textContent = w.phonetic || "（点 🔊 听发音）";
    $("scPos").textContent = w.pos || "";
    $("scEn").textContent = w.en || "";
    const ex = w.examples && w.examples[0] ? w.examples[0] : null;
    $("scExample").innerHTML = ex
      ? `<div class="e-en">${esc(ex.en)}</div>` + (ex.cn ? `<div class="e-cn">${esc(ex.cn)}</div>` : "")
      : "";

    const quiz = buildQuiz(w, s.list);
    s.quiz = quiz;
    $("quizQ").textContent = quiz.q;
    const qo = $("quizOptions");
    qo.innerHTML = "";
    quiz.options.forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "quiz-opt";
      b.dataset.i = String(i);
      b.innerHTML = `<span class="qk">${String.fromCharCode(65 + i)}</span><span>${esc(opt.text)}</span>`;
      qo.appendChild(b);
    });
    $("quizHint").textContent = "想想意思，选一个 👆";
    $("reveal").hidden = true;
    const sc = $("studyScroll"); if (sc) sc.scrollTop = 0;
  }

  function onQuizClick(e) {
    const btn = e.target.closest(".quiz-opt");
    if (!btn || !state.session || state.session.answered) return;
    const s = state.session;
    const i = +btn.dataset.i;
    s.answered = true;
    const opts = $("quizOptions").children;
    for (const o of opts) o.classList.add("locked");
    s.quiz.options.forEach((opt, idx) => {
      const el = opts[idx];
      if (opt.correct) el.classList.add("correct");
      else if (idx === i) el.classList.add("wrong");
    });
    const correct = s.quiz.options[i] && s.quiz.options[i].correct;
    $("quizHint").textContent = correct ? "✅ 答对了！" : "❌ 答对的是绿色那项";
    renderReveal(s.current);
    $("reveal").hidden = false;
  }

  function renderReveal(w) {
    $("revealWord").textContent = w.word;
    $("revealPhon").textContent = w.phonetic || "（点 🔊 听发音）";
    $("revealCn").textContent = w.cn || "—";
    const exBox = $("revealExamples");
    exBox.innerHTML = "";
    if (w.examples && w.examples.length) {
      w.examples.forEach((e) => {
        const div = document.createElement("div");
        div.className = "ex";
        if (e.en) { const a = document.createElement("div"); a.className = "e-en"; a.textContent = e.en; div.appendChild(a); }
        if (e.cn) { const b = document.createElement("div"); b.className = "e-cn"; b.textContent = e.cn; div.appendChild(b); }
        exBox.appendChild(div);
      });
    } else exBox.innerHTML = '<div class="tip">暂无例句</div>';
    renderChips($("revealSyn"), w.synonyms, "暂无同义词");
    renderChips($("revealAnt"), w.antonyms, "暂无反义词");
    const us = $("revealUsage");
    if (w.usage) us.innerHTML = esc(w.usage);
    else {
      const lv = LEVEL_LABEL[w.level] || w.level || "";
      us.innerHTML = `该词属于 <b>${esc(lv)}</b> 词表，词性 <b>${esc(w.pos || "—")}</b>。` +
        `中文释义：${esc(w.cn || "—")}。建议结合上方例句体会实际用法。`;
    }
  }

  function renderChips(container, arr, emptyText) {
    container.innerHTML = "";
    if (arr && arr.length) {
      arr.forEach((s) => {
        const has = !!state.byWord[s.toLowerCase()];
        const c = document.createElement("button");
        c.className = "chip" + (has ? " has-word" : "");
        c.textContent = s;
        if (has) c.addEventListener("click", () => { speak(s, ""); });
        else c.addEventListener("click", () => speak(s, ""));
        container.appendChild(c);
      });
    } else {
      container.innerHTML = `<span class="chip empty-note">${emptyText}</span>`;
    }
  }

  function assess(known) {
    if (!state.session) return;
    const w = state.session.current;
    if (!w) return;
    if (known) {
      addSet(LS.mastered, w.word); removeSet(LS.review, w.word);
      state.session.known.push(w.word);
    } else {
      addSet(LS.review, w.word); removeSet(LS.mastered, w.word);
      state.session.unknown.push(w.word);
    }
    updateProgress();
    nextWord();
  }

  function nextWord() {
    const s = state.session;
    s.idx++;
    if (s.idx >= s.list.length) endSession();
    else renderStudy();
  }

  function endSession() {
    const s = state.session;
    show("summary");
    $("summarySub").textContent = s.bookLabel + " · " + s.list.length + " 词";
    $("sumKnown").textContent = s.known.length;
    $("sumUnknown").textContent = s.unknown.length;
    $("sumSkip").textContent = s.skip;
  }

  /* ============================================================
     屏幕 4：浏览全部单词（复用旧逻辑）
     ============================================================ */
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
  function renderList() {
    const arr = getBookWords(state.book, state.filterText);
    state.bookList = arr;
    const list = $("wordList");
    list.innerHTML = "";
    $("listMeta").textContent = `共 ${arr.length} 个单词`;
    if (!arr.length) { list.innerHTML = '<li class="hint">这个单词本里还没有单词。</li>'; return; }
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
    renderChips($("dSyn"), w.synonyms, "暂无同义词");
    renderChips($("dAnt"), w.antonyms, "暂无反义词");
    const us = $("dUsage");
    if (w.usage) us.innerHTML = esc(w.usage);
    else {
      const lv = LEVEL_LABEL[w.level] || w.level || "";
      us.innerHTML = `该词属于 <b>${esc(lv)}</b> 词表，词性 <b>${esc(w.pos || "—")}</b>。中文释义：${esc(w.cn || "—")}。建议结合上方例句体会实际用法。`;
    }
    $("dFav").classList.toggle("active", inSet(LS.fav, w.word));
    $("dFav").textContent = inSet(LS.fav, w.word) ? "★ 已收藏" : "☆ 收藏";
    $("dMaster").classList.toggle("active", inSet(LS.mastered, w.word));
    $("dMaster").textContent = inSet(LS.mastered, w.word) ? "✓ 已掌握" : "✓ 标记掌握";
    $("dReview").classList.toggle("active", inSet(LS.review, w.word));
    $("dReview").textContent = inSet(LS.review, w.word) ? "↺ 复习中" : "↺ 待复习";
  }
  function selectWord(raw) {
    state.current = normalize(raw);
    renderDetail();
    renderList();
    if (window.matchMedia("(max-width: 860px)").matches) document.body.classList.add("show-detail");
    const sc = $("detailScroll"); if (sc) sc.scrollTop = 0;
  }
  function selectFirstOfBook() {
    const arr = getBookWords(state.book, state.filterText);
    if (arr.length) selectWord(arr[0]);
    else { state.current = null; $("dEmpty").hidden = false; $("dBody").hidden = true; renderList(); }
  }
  function setBook(key) {
    state.book = key;
    renderBookChips();
    selectFirstOfBook();
  }
  function step(dir) {
    const arr = state.bookList.length ? state.bookList : getBookWords(state.book, state.filterText);
    if (!arr.length) return;
    let idx = arr.findIndex((w) => state.current && w.word === state.current.word);
    if (idx < 0) idx = 0; else idx = (idx + dir + arr.length) % arr.length;
    selectWord(arr[idx]);
  }
  function toggleStatus(key, exclusive) {
    if (!state.current) return;
    if (inSet(key, state.current.word)) removeSet(key, state.current.word);
    else { addSet(key, state.current.word); if (exclusive) removeSet(exclusive, state.current.word); }
    renderDetail(); renderList(); updateProgress();
  }

  /* ---------- events ---------- */
  function bind() {
    // books
    $("openBrowse").addEventListener("click", () => { show("browse"); renderBookChips(); selectFirstOfBook(); updateProgress(); });
    // study
    $("studyExit").addEventListener("click", () => { show("books"); renderBookCards(); updateProgress(); });
    $("scSpeak").addEventListener("click", () => { if (state.session) speak(state.session.current.word, state.session.current.audio); });
    $("revealSpeak").addEventListener("click", () => { if (state.session) speak(state.session.current.word, state.session.current.audio); });
    $("quizOptions").addEventListener("click", onQuizClick);
    $("btnKnown").addEventListener("click", () => assess(true));
    $("btnUnknown").addEventListener("click", () => assess(false));
    $("btnNext").addEventListener("click", () => { if (state.session) { state.session.skip++; nextWord(); } });
    // summary
    $("sumAgain").addEventListener("click", () => startStudy(state.session.bookKey, {}));
    $("sumReviewWrong").addEventListener("click", () => startStudy(state.session.bookKey, { onlyReview: true }));
    $("sumBack").addEventListener("click", () => { show("books"); renderBookCards(); updateProgress(); });
    // browse
    $("browseExit").addEventListener("click", () => { show("books"); renderBookCards(); updateProgress(); });
    $("dSpeak").addEventListener("click", () => { if (state.current) speak(state.current.word, state.current.audio); });
    $("dPrev").addEventListener("click", () => step(-1));
    $("dNext").addEventListener("click", () => step(1));
    $("dFav").addEventListener("click", () => toggleStatus(LS.fav));
    $("dMaster").addEventListener("click", () => toggleStatus(LS.mastered, LS.review));
    $("dReview").addEventListener("click", () => toggleStatus(LS.review, LS.mastered));
    $("searchInput").addEventListener("input", (e) => { state.filterText = e.target.value.trim(); renderList(); });
    $("backBtn").addEventListener("click", () => document.body.classList.remove("show-detail"));
    document.addEventListener("keydown", (e) => {
      if (state.screen === "browse") {
        if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); step(1); }
        else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); step(-1); }
        else if (e.key === "Escape") document.body.classList.remove("show-detail");
      } else if (state.screen === "study") {
        if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); if (state.session && state.session.answered) { state.session.skip++; nextWord(); } }
      }
    });
  }

  /* ---------- init ---------- */
  async function init() {
    bind();
    state.words = (await loadJSON("./data/words.json")) || [];
    state.words.forEach((w) => { state.byWord[w.word.toLowerCase()] = w; });
    updateProgress();
    renderBookCards();
    show("books");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
