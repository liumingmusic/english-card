# 每日英语单词卡片 · Daily Word Card

一个**纯静态、零构建**的「每日英语单词」学习网站。每天自动推送一个英语单词，做成可翻转的学习卡片，并提供**同义词 / 反义词 / 例句 / 用法说明 / 中文翻译**等完整信息。

- 线上地址（部署后）：`https://<your-user>.github.io/english-card/`
- 无后端、无构建步骤、无任何 API key。
- **单词数据全部内置**：所有释义、音标、发音、例句、同反义词、用法都在发布时（`data/words.json`）一次性构建好，运行时**不联网、不调 API**，加载更快、可离线、永不空屏。

## ✨ 功能

- **每日单词**：用日期哈希从内置词表中确定性地选一个「今日单词」。
- **翻卡动画**：点击卡片正面（单词+音标+中文摘要）→ 翻到背面（词性/中英释义/例句）。CSS 3D flip。
- **详情面板**：卡片下方分页签展示——**释义 / 例句 / 同义 / 反义 / 用法**，信息密度大幅提升。
- **发音**：优先用内置的发音音频 URL；无音频则用浏览器内置 `speechSynthesis`（Web Speech API，离线可用）。
- **下一个**：从词表随机取词（完全本地，不联网）。
- **收藏 / 已掌握 / 待复习**：状态保存在 `localStorage`，卡片角标有明确视觉区分。
- **复习模式**：只循环「待复习」的单词。
- **词表浏览**：按级别筛选（小学 / 初中 / 高中 / 四级 / 六级 / 考研 / 雅思，共 7 级）+ 中英文搜索。
- **历史回看**：查看过去几天的「今日单词」（由 Actions 每日生成的快照）。
- **移动端适配**：禁缩放、无横向溢出、卡片自适应、按钮触控 ≥ 44px。

## 🗂 目录结构

```
english-card/
├── index.html
├── assets/
│   ├── css/style.css
│   └── js/app.js
├── data/
│   ├── words.json         # 内置词表（核心，含同义/反义/例句/用法等完整数据）
│   ├── manifest.json      # 每日选词快照索引（{ updatedAt, days:[...] }，倒序保留 60 天）
│   └── snapshots/         # 每日单词卡（完整的当日词卡数据，source="builtin"）
├── scripts/
│   ├── seed.js            # 内置双语种子词表（四六级/考研/雅思）
│   ├── seed-school.js     # 内置双语种子词表（小学/初中/高中）
│   ├── build-words.js     # 本地构建：用 API 补全生成 words.json（仅构建期使用）
│   └── fetch.js           # Actions：每日选词 + 写快照（纯本地，不调 API）
├── .github/workflows/fetch.yml
├── package.json
├── .gitignore
└── README.md
```

## 🔌 数据源（免 key）

- **内置词表 `data/words.json`（已随仓库发布）**：共 **437** 个单词，覆盖 7 个级别（小学 41 / 初中 103 / 高中 74 / 四级 99 / 六级 66 / 考研 31 / 雅思 23）。每条含单词、音标、发音音频、词性、中英释义、例句、同义词、反义词、用法说明。
- **Free Dictionary API**（免 key）：`https://api.dictionaryapi.dev/api/v2/entries/en/{word}`
  **仅在本地构建期**（`node scripts/build-words.js`）用于补全发音音频、英文释义、例句、同/反义词。
- **运行时零联网**：网站加载后直接读取 `data/words.json`，不调用任何远程接口；发音缺失时回退到 `speechSynthesis`。**更快、可离线、永不空屏。**

## 🛠 本地开发

```bash
# 1) （可选）本地用 API 补全并重新生成 data/words.json（仅构建期联网）
npm run build

# 2) 启动一个静态服务器（任选）
npx serve .
# 或
python3 -m http.server 8080

# 3) 打开 http://localhost:8080
```

> 直接双击 `index.html` 也能用，但部分浏览器对 `file://` 的 fetch 有限制，建议用本地服务器。

## 🚀 本地验证每日快照

```bash
node scripts/fetch.js      # 生成 data/snapshots/YYYY-MM-DD.json + 更新 data/manifest.json（纯本地）
```

## ☁️ 部署到 GitHub Pages

1. 将本仓库推送到 `github.com/<user>/english-card`（公开仓库）。
2. 仓库 **Settings → Pages → Source** 选择 `main` 分支、`/ (root)` 目录，保存。
3. GitHub Actions 会在每天 UTC 22:00（≈ 北京次日 06:00）自动生成当日单词快照；也可在 **Actions → Daily Word Fetch → Run workflow** 手动触发。
4. 首次部署后访问 `https://<user>.github.io/english-card/`。

## 📜 License

MIT
