# 背单词 · Word Books

一个**纯静态、零构建**的背单词软件。先选单词本（小学 / 初中 / 高中 / 四级 / 六级 / 考研 / 雅思，外加「全部 / 收藏 / 待复习」），再浏览该本**全部单词**（可滚动列表），点开任一单词进入**可滚动的详情页**（例句 / 同义 / 反义 / 用法）。

- 线上地址（部署后）：`https://<your-user>.github.io/english-card/`
- 无后端、无构建步骤、无任何 API key。
- **单词数据全部内置**：所有释义、音标、发音、例句、同反义词、用法都在发布时（`data/words.json`）一次性构建好，运行时**不联网、不调 API**，加载更快、可离线、永不空屏。

## ✨ 功能

- **选单词本**：顶部 chip 切换 全部 / 小学 / 初中 / 高中 / 四级 / 六级 / 考研 / 雅思 / 收藏 / 待复习。
- **浏览全部单词**：左侧是可滚动的单词列表，每条含 单词 / 音标 / 中文 / 级别徽章 / 收藏·掌握·复习角标；支持中英文搜索。
- **可滚动单词详情页**：右侧（移动端为全屏滑入）纵向展示 单词、音标、🔊 发音、词性、中英释义、例句、同义词（可点跳转到库内词）、反义词、用法说明。
- **发音**：优先用内置发音音频 URL；缺失则用浏览器内置 `speechSynthesis`（离线可用）。
- **上一个 / 下一个**：在当前单词本内顺序切换（键盘 ↑/↓ 或 j/k）。
- **收藏 / 已掌握 / 待复习**：状态存 `localStorage`，「收藏」「待复习」也可作为独立单词本筛选；掌握与复习互斥。
- **移动端适配**：列表与详情分屏，详情为全屏滑入页，带返回按钮；禁缩放、无横向溢出。

## 🗂 目录结构

```
english-card/
├── index.html
├── assets/
│   ├── css/style.css
│   └── js/app.js
├── data/
│   └── words.json         # 内置词表（核心，含同义/反义/例句/用法等完整数据，437 词）
├── scripts/
│   ├── seed.js            # 内置双语种子词表（四六级/考研/雅思）
│   ├── seed-school.js     # 内置双语种子词表（小学/初中/高中）
│   └── build-words.js     # 本地构建：用 Free Dictionary API 补全生成 words.json（仅构建期使用）
├── package.json
├── .gitignore
└── README.md
```

## 🔌 数据源（免 key）

- **内置词表 `data/words.json`（随仓库发布）**：共 **437** 个单词，覆盖 7 个级别（小学 41 / 初中 103 / 高中 74 / 四级 99 / 六级 66 / 考研 31 / 雅思 23）。每条含单词、音标、发音音频、词性、中英释义、例句、同义词、反义词、用法说明。
- **Free Dictionary API**（免 key）：`https://api.dictionaryapi.dev/api/v2/entries/en/{word}`
  **仅在本地构建期**（`node scripts/build-words.js`）用于补全发音音频、英文释义、例句、同/反义词。**运行时零联网。**

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

## ☁️ 部署到 GitHub Pages

1. 将本仓库推送到 `github.com/<user>/english-card`（公开仓库）。
2. 仓库 **Settings → Pages → Source** 选择 `main` 分支、`/ (root)` 目录，保存。
3. 首次部署后访问 `https://<user>.github.io/english-card/`。

## 📜 License

MIT
