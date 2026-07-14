# 每日英语单词卡片 · Daily Word Card

一个**纯静态、零构建**的「每日英语单词」学习网站。每天自动推送一个英语单词，做成可翻转的学习卡片：单词 / 音标 / 发音 / 词性 / 中英释义 / 例句（中英对照）。

- 线上地址（部署后）：`https://<your-user>.github.io/english-card/`
- 无后端、无构建步骤、无任何 API key。

## ✨ 功能

- **每日单词**：用日期哈希从内置词表中确定性地选一个「今日单词」。
- **翻卡动画**：点击卡片正面（单词+音标）→ 翻到背面（词性/中英释义/例句）。CSS 3D flip。
- **发音**：优先用 Free Dictionary API 返回的音频；无音频则用浏览器内置 `speechSynthesis`（Web Speech API，离线可用）。
- **下一个**：从词表随机取词，并可选实时调用 Free Dictionary 补全音标/例句。
- **收藏 / 已掌握 / 待复习**：状态保存在 `localStorage`，卡片角标有明确视觉区分。
- **复习模式**：只循环「待复习」的单词。
- **词表浏览**：按级别（四级 / 六级 / 考研 / 雅思）筛选 + 搜索单词。
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
│   ├── words.json         # 内置词表（核心，含基础释义）
│   ├── manifest.json      # 每日选词快照索引（倒序，保留 60 天）
│   └── snapshots/         # 每日单词卡（含 API 补全后的完整数据）
├── scripts/
│   ├── seed.js            # 内置双语种子词表（来源）
│   ├── build-words.js     # 本地：用 API 补全生成 words.json
│   └── fetch.js           # Actions：每日选词 + 调 API 补全 + 写快照
├── .github/workflows/fetch.yml
├── package.json
├── .gitignore
└── README.md
```

## 🔌 数据源（免 key）

- **内置词表 `data/words.json`**：预置约 200+ 高频/考纲词汇（四六级/考研/雅思），每条含单词、音标、词性、中英释义、例句。
- **Free Dictionary API**（免 key）：`https://api.dictionaryapi.dev/api/v2/entries/en/{word}`
  用于**补全/丰富**音标、发音音频、英文释义与例句。
- **兜底**：API 不可达时，卡片用内置词表自带数据照常展示，发音回退到 `speechSynthesis`，**永不空屏**。

## 🛠 本地开发

```bash
# 1) （可选）用 API 补全并生成 data/words.json
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
node scripts/fetch.js      # 生成 data/snapshots/YYYY-MM-DD.json + 更新 data/manifest.json
```

## ☁️ 部署到 GitHub Pages

1. 将本仓库推送到 `github.com/<user>/english-card`（公开仓库）。
2. 仓库 **Settings → Pages → Source** 选择 `main` 分支、`/ (root)` 目录，保存。
3. GitHub Actions 会在每天 UTC 22:00（≈ 北京次日 06:00）自动生成当日单词快照；也可在 **Actions → Daily Word Fetch → Run workflow** 手动触发。
4. 首次部署后访问 `https://<user>.github.io/english-card/`。

## 📜 License

MIT
