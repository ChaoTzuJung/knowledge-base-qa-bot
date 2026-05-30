<p align="right"><a href="./README.md">English</a> · <strong>繁體中文</strong></p>

# 知識庫問答機器人（Knowledge Base Q&A Bot）

一個可自架的本地 Markdown 知識庫問答聊天機器人。伺服器提供 **兩種可互換的檢索策略** —— Markdown KB（BM25）與 Vector RAG（HNSW + OpenAI 嵌入）—— 並在回答中即時串流附帶來源引用的內容。
Web 前端基於 [assistant-ui](https://www.assistant-ui.com/) 與 [Vercel AI SDK v6](https://ai-sdk.dev/) 的 UI 訊息串流協定。

![Demo：附來源的回答、追問記憶，以及誠實的「我無法確認」備援](.github/assets/demo.gif)

> 發問 → 來源先串流出現，接著是附引用的答案。追問會依脈絡解讀，超出範圍的問題誠實回「我無法確認」、絕不幻覺，而 Compare 分頁則把兩種檢索策略放在同一問題下並排比較。

## 快速開始

> **前置條件：** Node.js 20+ 與 `OPENAI_API_KEY`。可選環境變數見 [前置條件](#前置條件)。

```bash
export OPENAI_API_KEY="sk-..."
npm install
npm run dev:server   # 終端 1 —— Hono 啟動於 :8000
npm run dev:web      # 終端 2 —— Vite 啟動於 :5173（反向代理至 :8000）
```

接著開啟 <http://localhost:5173>。首次載入時索引是空的 —— 點擊側邊欄的 **Build Index**（或 `POST /build-index`）後才能提問。

## 功能特色

- **四種檢索策略** —— Markdown KB（BM25）、Vector RAG（HNSW）、**Hybrid（預設）**（用 Reciprocal Rank Fusion 融合前兩者），以及 **LLM Index**（讓模型直接從 wiki 目錄挑段落）；可逐次查詢切換，並有並排 `/compare` 比較（[原因](#為何提供兩種檢索策略)）。
- **具來源引用的答案**，以 AI SDK v6 [串流協議](#串流協議)逐字串流。
- **誠實的「我無法確認」**，沒命中時不幻覺（[原因](#為何明確我無法確認)）。
- **對話記憶**，把追問改寫成獨立完整的查詢（[細節](#對話記憶追問)）。
- **歸檔與瀏覽** —— 把[審核過的答案歸檔](#answer-filing歸檔已審核的-qa)回知識庫，並產生[可瀏覽的 wiki 索引](#wiki-索引可瀏覽的主題清單)。
- **端對端型別安全**（Hono RPC）、[paraphrase 評測](#paraphrase-評測檢索穩健度)與 Playwright + 單元[測試](#測試)。

**目錄：** [如何使用](#1--如何使用) · [進階使用](#2--進階使用) · [運作原理](#3--運作原理) · [設計決策](#4--設計決策)

---

## 1 · 如何使用

### 前置條件

- Node.js 20+（已在 22.11 測試）
- 在 shell 中匯出 `OPENAI_API_KEY`，否則 `/chat`、`/chat/stream`、`/compare` 以及 `/build-index` 的嵌入生成將會失敗。

```bash
export OPENAI_API_KEY="sk-..."
```

可選環境變數：

| 變數名稱                 | 預設值                   | 用途                                 |
|--------------------------|--------------------------|--------------------------------------|
| `OPENAI_MODEL`           | `gpt-4o-mini`            | 聊天模型                             |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | 嵌入模型（向量索引用)                |
| `PORT`                   | `8000`                   | 伺服器埠號                           |

### 用 curl 試玩

```bash
# 健康檢查
curl http://localhost:8000/health
# {"status":"ok"}

# 從 docs/*.md 建立兩種索引
curl -X POST http://localhost:8000/build-index
# {"files_indexed":3,"sections_indexed":12,"chunks_indexed":12,"vector_files_indexed":3}

# 單次問答（預設 BM25）
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"退款多久入帳？"}'
```

<details>
<summary>更多 curl 範例 —— 向量策略、誠實備援、串流、比較</summary>

```bash
# 相同問題，改採向量策略
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"如何更改電子郵件？","strategy":"vector_rag"}'

# 超出範圍 → 誠實備援
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"附近有什麼餐廳？"}'
# "我無法從知識庫確認。"

# 串流（AI SDK v6 UI message stream）
curl -N -X POST http://localhost:8000/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"query":"退款多久入帳？"}'

# 並排比較兩種策略
curl -X POST http://localhost:8000/compare \
  -H 'Content-Type: application/json' \
  -d '{"query":"退款多久入帳？"}'
```

</details>

### 常用腳本

```bash
npm run dev:server   # Hono 後端，:8000
npm run dev:web      # Vite 前端，:5173
npm run import:raw   # 將 raw/*.txt|*.html 正規化成 docs/*.md
npm run generate:wiki # 從 .kb/index.json 重新產生 wiki/index.md
npm run eval         # paraphrase 檢索評測（BM25 vs 向量）
npm run build        # tsc -b + vite build
npm run test:unit    # node:test 單元測試（raw→Markdown 轉換函式）
npm run test:e2e     # Playwright 測試套件（自動啟動 dev servers）
```

---

## 2 · 進階使用

### 匯入原始檔（選用）

知識庫以 `docs/` 底下的 canonical Markdown 為準。若要匯入純文字或 HTML 來源，
把檔案放進 `raw/`，再正規化成 `docs/*.md`：

```bash
npm run import:raw              # raw/*.txt | raw/*.html -> docs/*.md
npm run import:raw -- --force   # 覆蓋已存在的 docs
```

每個轉換後的檔案都會加上 YAML front matter 記錄原始 `source` 檔名，並保證至少有
一個標題，索引器才一定吃得到內容。此腳本只負責正規化——之後再用 **Build Index**
或 `POST /build-index` 重建索引。

### Wiki 索引（可瀏覽的主題清單）

`wiki/index.md` 是一份給人與 agent 瀏覽的目錄，從 `.kb/index.json` 產生——每個來源
文件一個 `##`，子段落依標題層級縮排，每一條都連回 `../docs/<file>#<anchor>`。讀者
（或 agent）不必呼叫 API 就能看出知識庫涵蓋哪些主題。

它會在每次 `POST /build-index` 結束時自動重新產生。若只想從現有索引單獨重建（不重新
建索引、不需要 API key）：

```bash
npm run generate:wiki
```

```text
# Knowledge Base Index

**5 documents · 17 sections**

## refund_policy.md

- [Refund Policy](../docs/refund_policy.md#refund-policy)
  - [Cancellation Window](../docs/refund_policy.md#cancellation-window)
  - [Refund Timeline](../docs/refund_policy.md#refund-timeline)
```

anchor 與索引器替每個標題指派的 slug 一致，所以連結在任何 Markdown 檢視器都能正確跳轉。

### Answer filing（歸檔已審核的 Q&A）

審核過 `/chat` 的答案、確認沒問題後，把它歸檔回知識庫。`POST /file-answer` 收下你核可的
結果，寫成一份具來源引用的 Markdown 到 `wiki/answers/<slug>.md`，並保留引用：答案裡 inline
的 `[file.md#section]` 標記會被改寫成連回 `docs/` 的連結，每個檢索到的來源也會附上分數列出。
它同時重建 `wiki/answers/index.md`，讓歸檔的答案可以瀏覽。

```bash
# 審核 /chat 結果後，把核可的答案與來源歸檔
curl -X POST http://localhost:8000/file-answer \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "How long do refunds take?",
    "answer": "Refunds arrive in 5-7 business days [refund_policy.md#refund-timeline].",
    "sources": [{"source":"refund_policy.md#refund-timeline","heading":"Refund Policy > Refund timeline","score":2.152,"content":"..."}]
  }'
# {"filed":true,"slug":"how-long-do-refunds-take","file":"wiki/answers/how-long-do-refunds-take.md"}
```

這個端點會原封不動保存你審核過的內容——不會重跑檢索或 LLM。

### Paraphrase 評測（檢索穩健度）

`npm run eval` 會把一組精選的「改寫查詢」——同一個意圖、不同說法——丟進兩種策略的
檢索層（不呼叫 LLM 產生回答），回報每種策略是否仍命中預期的段落。它把兩種失敗模式
具體化：BM25 漏同義詞（「money back」永遠對不上「refund」這個字），而向量檢索可能撈到
語意相近但其實錯誤的段落。

```bash
npm run eval   # 請先建立索引：POST /build-index，或確保 .kb/ 已存在
```

BM25 欄位不需 API key；向量欄位會對每個查詢做嵌入，因此需要 `OPENAI_API_KEY`
（未設定時這些格子會降級為 error，BM25 欄位仍正常印出）。

```text
▸ refund timing   →  expect: refund_policy.md#refund-timeline
   "How long do refunds take?"
       BM25    ✅ refund_policy.md#refund-timeline  (2.152)
       Vector  ✅ refund_policy.md#refund-timeline  (0.683)
   "When will I get my money back?"
       BM25    ⚠️  cannot-confirm (below threshold)
       Vector  ✅ refund_policy.md#refund-timeline  (0.466)

Summary (out of 15 paraphrases)
   Markdown KB (BM25):   hit@1 10/15    hit@3 11/15
   Vector RAG:           hit@1 14/15    hit@3 15/15
```

圖例：✅ 預期段落為 top-1、🔸 預期段落落在 top-3、❌ 命中錯誤段落。題庫位於
[`apps/server/src/eval/paraphrase.ts`](apps/server/src/eval/paraphrase.ts)，可在此
新增意圖與改寫句。

### 對話記憶（追問）

`/chat/stream` 會接收完整的 `messages` 陣列，因此追問會在對話脈絡下被解讀。檢索之前，
伺服器會用最近幾輪對話把最新的問題改寫成「獨立完整的查詢」——解析代名詞與省略的主詞
（「How do I start **one**?」→「How do I start a refund?」）——再用改寫後的查詢去檢索。
記憶只影響「檢索什麼」；回答仍只 ground 在檢索到的來源，並維持相同的引用規則。

改寫只在「有前文」時才執行——第一輪原樣放行——而且採 fail-open：改寫呼叫若出錯就退回
原問題，聊天永遠不會因此中斷。當問題被改寫時，串流會多送一個 `data-rewrite` 區塊，
UI 會在來源面板上方顯示為「Interpreted as …」一行。

```bash
curl -s http://localhost:8000/chat/stream -H 'content-type: application/json' -d '{
  "strategy": "markdown_kb",
  "messages": [
    {"role":"user","parts":[{"type":"text","text":"How long do refunds take?"}]},
    {"role":"assistant","parts":[{"type":"text","text":"Refunds take 5-7 business days [refund_policy.md#refund-timeline]."}]},
    {"role":"user","parts":[{"type":"text","text":"How do I start one?"}]}
  ]
}'
# ... data: {"type":"data-rewrite","id":"rewrite","data":{"original":"How do I start one?","rewritten":"How do I start a refund?"}}
```

改寫需要 `OPENAI_API_KEY`（每次追問多一次小型呼叫）；第一輪會略過，因此單輪行為維持不變。

---

## 3 · 運作原理

```
┌────────────┐   POST /chat/stream    ┌──────────────┐
│  React +   │ ─────────────────────▶ │  Hono server │
│ assistant- │                        │  (Node.js)   │
│    ui      │  data-sources part     │              │
│            │  ◀── text-* parts ──── │   strategies │
└────────────┘                        └──────┬───────┘
                                             │
                                  ┌──────────┴──────────┐
                                  ▼                     ▼
                         markdown_kb (BM25)     vector_rag (HNSW
                         heading sections        + embeddings)
```

### 目錄結構

```
.
├── apps/
│   ├── server/                  Hono 後端，監聽 :8000
│   │   └── src/
│   │       ├── app.ts           鏈式 Hono 建構器；匯出 AppType 供 RPC 使用
│   │       ├── index.ts         啟動與伺服
│   │       ├── routes/          /health, /build-index, /chat, /chat/stream, /compare, /file-answer
│   │       ├── strategies/      markdown-kb (BM25), vector-rag (HNSW), 共用 retrieve
│   │       ├── scripts/         import-raw（raw→docs）+ generate-wiki（索引→wiki）
│   │       └── eval/            paraphrase：BM25 vs 向量的檢索穩健度評測
│   ├── web/                     React + Vite + Tailwind + assistant-ui，監聽 :5173
│   │   └── src/lib/api.ts       透過 hc<AppType> 的 Hono RPC 客戶端
│   └── e2e/                     Playwright 測試；透過 webServer 自動啟動 dev servers
├── packages/
│   └── shared/                  Strategy、SourceInfo、ChatResult、IndexResult 共用型別
├── raw/                         待匯入的 .txt / .html 原始檔放置區
├── docs/                        canonical Markdown 知識庫（refund_policy、account_help...）
├── wiki/                        產生的內容（已 gitignore）：index.md + answers/（歸檔 Q&A）
├── .kb/                         產生的索引（已加入 .gitignore）
│   ├── index.json               BM25 段落 + 統計
│   └── vector_index/            HNSW 二進位檔 + metadata.json
└── tsconfig.json                嚴格共用根設定；各 apps 繼承
```

### API 端點

| 方法 | 路徑            | 請求主體                                                     | 回應                                                     |
|------|-----------------|--------------------------------------------------------------|----------------------------------------------------------|
| GET  | `/health`       | —                                                            | `{ "status": "ok" }`                                     |
| POST | `/build-index`  | —                                                            | `{ files_indexed, sections_indexed, chunks_indexed, … }` |
| POST | `/chat`         | `{ query, strategy?: "markdown_kb" \| "vector_rag" \| "hybrid" \| "llm_index" }` | `{ answer, sources, strategy }` |
| POST | `/chat/stream`  | `{ query, strategy? }` 或 `{ messages: [...], strategy? }`    | AI SDK UI message stream（SSE）                          |
| POST | `/compare`      | `{ query }`                                                  | `{ markdown_kb: {...}, vector_rag: {...}, llm_index: {...} }` |
| POST | `/file-answer`  | `{ query, answer, sources?, strategy? }`                    | `{ filed, slug, file }`                                  |

### 檢索流程

每次查詢：

1. **斷詞與檢索** 選定策略。
   - **Markdown KB**：解析 `docs/*.md` 為標題段落，用 BM25 計分，回傳前 k 段。
   - **Vector RAG**：同樣解析，但將超過 1500 字元的段落以 200 字重疊切塊，使用 `text-embedding-3-small` 轉為嵌入向量，再用 HNSW 索引以餘弦相似度搜尋。
2. **閾值檢查**。BM25 ≥ 0.5 或餘弦 ≥ 0.3 —— 低於此值即視為「信心不足」；伺服器直接回覆「我無法從知識庫確認」，不再呼叫 LLM。
3. **組裝提示**。將命中段落與其標題路徑（如 `refund_policy.md > 退款政策 > 退款時程`）合併至系統 + 使用者提示模板。
4. **生成回答**。使用 `streamText` 並將結果以 UI message 串流回傳。

### 串流協議

`/chat/stream` 回傳 Vercel AI SDK v6 UI message stream，順序如下：

```
data: {"type":"data-sources","id":"sources","data":{"strategy":"markdown_kb","sources":[...]}}
data: {"type":"start","messageId":"..."}
data: {"type":"text-start","id":"..."}
data: {"type":"text-delta","id":"...","delta":"退款通常 "}
data: {"type":"text-delta","id":"...","delta":"會在 3-5 個工作日內 "}
...
data: {"type":"finish"}
```

來源會在回答文字之前先串流，讓 UI 可立即顯示來源面板，避免看起來卡住。
實作上使用 `createUIMessageStream` 先插入 `data-sources` 區塊，再將 `streamText().toUIMessageStream({ messageMetadata, onFinish })` 的輸出合併。追問時還會額外插入 `data-rewrite` 區塊（見[對話記憶](#對話記憶追問)）。

### 端對端型別安全

伺服器定義單一鏈式 Hono app 於
[`apps/server/src/app.ts`](apps/server/src/app.ts)，並匯出其型別：

```ts
export const app = new Hono()
  .use("*", cors())
  .route("/", healthRoute)
  .route("/", indexRoute)
  .route("/", chatRoute)
  // ...

export type AppType = typeof app;
```

Web 端透過
[`apps/web/src/lib/api.ts`](apps/web/src/lib/api.ts) 使用：

```ts
import { hc } from "hono/client";
import type { AppType } from "@kb/server/app";

export const client = hc<AppType>(window.location.origin);

// 編譯時期即可偵測 body 錯誤：
await client.compare.$post({ json: { query: "..." } });
```

請求/回應的形狀由伺服器的 `c.req.valid("json")`（透過 `@hono/zod-validator` 驗證）與 `c.json(...)` 直接傳遞給客戶端，無需重複宣告型別。

### 測試

Playwright 涵蓋可見流程，位於 `apps/e2e/tests/`：

- `cold-start` —— 歡迎畫面於尚未索引時顯示。
- `chat-markdown-kb` —— 退款問題，驗證串流回答與引用。
- `chat-vector-rag` —— 信箱問題走向量策略。
- `compare` —— `/compare` 頁面呈現兩欄。
- `index-management` —— Build Index 按鈕顯示「Indexing…」並呈現統計。
- `out-of-scope` —— 餐廳問題觸發「無法確認」並清空來源面板。
- `chat-followup` —— 追問（「How do I start one?」）透過對話記憶解讀；驗證「Interpreted as」改寫與退款來源。

Playwright 設定檔的 `webServer` 區塊讓 `npm run test:e2e` 自動啟動 `dev:server` 與 `dev:web`，或於本地重複使用已啟動的實例。

單元測試使用 Node 內建的 `node:test`（零依賴），涵蓋純函式：`apps/server/src/scripts/import-raw.test.ts` 的 raw→Markdown 轉換、`apps/server/src/strategies/markdown-kb/wiki.test.ts` 的 wiki 索引產生，以及 `apps/server/src/strategies/markdown-kb/answer-filing.test.ts` 的答案歸檔（引用改寫、索引產生）。以 `npm run test:unit` 執行。

---

## 4 · 設計決策

### 為何提供兩種檢索策略？

題目要求「具來源引用」。BM25 與向量 RAG 的失敗模式不同，且語料小，並行執行成本極低。`/compare` 可視化差異，讓讀者建立直覺：
「退款多久入帳？」 → BM25 因標題含關鍵字而命中；
「When will I get my money back?（我的錢何時退回？）」 → 向量勝出，因「money back」對不上「refund」這個字，BM25 無法據以回答，而向量仍能檢索到退款時程段落。本 README 最上方的 demo 即示範了這個對比。

**Hybrid 是預設**，讓你不必逐題二選一：它同時跑兩種檢索，用 Reciprocal Rank Fusion（RRF，K=60）融合兩邊的排名——只要任一邊把某段落排得高就會浮上來，同時拿到 BM25 的關鍵字精準度與向量的同義詞召回。RRF 融合的是**排名**，不是 BM25／cosine 那種彼此不可比的原始分數。它仍維持「至少一種檢索通過自己的信心門檻才回答」，保住「我無法確認」的保證。

**LLM Index** 是第四種、輕檢索的模式：不用 BM25 也不用向量，而是把段落目錄（就是 `wiki/index.md` 呈現的那份對照表）丟給模型，讓它按語意挑出相關的 section id。它不需要向量索引——只要 Markdown 段落——並直接沿用專案本來就會產生的目錄。模型亂編的 id 會被丟掉，若它什麼都沒挑就短路回「我無法確認」。代價是每次查詢多一次 LLM 呼叫，換來不靠 embedding 也能理解意圖的檢索。

Markdown 已具語意邊界 —— 標題。段落足夠小適合 prompt，又足夠大保留局部上下文。向量索引中，超過 1500 字元者再切塊（200 字重疊），避免密集段落於邊界丟失鄰居。

### 為何明確「我無法確認」？

知識庫機器人的重點是「不幻覺」。低於信心閾值即固定回覆，不呼叫 LLM，成本可控，也避免模型用訓練時的一般知識橋接。

### 為何先串流來源再串流文字？

1. **感知延遲**：來源面板立即顯示，LLM 生成時 UI 不凍結。
2. **誠實**：使用者可在閱讀答案前先看到證據，驗證更容易。

AI SDK v6 協定支援亂序區塊，assistant-ui 的 `SourcesPanel` 直接讀取最新訊息中的 `data-sources`。

### 為何鏈式 Hono builder + Hono RPC 而非 fetch？

初版有五個獨立 `new Hono()` 掛載於 `/`，加上原生 `fetch("/chat", ...)`。缺點：

- 請求/回應型別重複於 `apps/server/src/lib/types.ts` 與 `apps/web/src/lib/types.ts`，已不同步。
- 請求主體打錯字（`query`→`qery`）會在執行期才失敗。

改採鏈式 builder 後，`typeof app` 會自動捕捉所有路由輸入/輸出形狀。Web 端獲得型別代理 (`client.compare.$post({ json: { query } })`)，重複型別收斂到 `packages/shared/`。

`@hono/zod-validator` 搭配 `c.req.valid("json")` 一次完成驗證與型別推導。

### 為何 `/build-index` 而非 `/index`？

Hono RPC 將 `client.index` 解析為 `/` 的別名，導致 `client.index.$post()` 實際發到 `POST /` 並失敗。改名為 `/build-index` 避免衝突，也讀起來更清楚「建立索引」。

### 為何獨立 `packages/shared` workspace？

跨 app 型別非伺服器專用也非前端專用。第三個 workspace 明確依賴方向（兩端皆依賴 `@kb/shared`），防止 `apps/web` 為了型別引入伺服器專用模組。伺服器專有型別如 `Section`、`Chunk`、`VectorMetadata` 留在 `apps/server/src/lib/types.ts`。

### 為何在 repo root 啟用 strict TypeScript？

單一 `tsconfig.json` 於根目錄，啟用 `strict`、`verbatimModuleSyntax`、`isolatedModules`、`noFallthroughCasesInSwitch`、`noImplicitOverride`。兩端皆繼承。好處：一致性；任一 app 升級嚴格檢查，另一端同步生效，審查者不需記得哪個套件較寬鬆。成本是一次性修正若干 `as unknown as`，揭露了 `UIMessage.parts` 的型別漏洞。

### 規模上限

此實作在數千段落內游刃有餘。再往上：

- JavaScript 記憶體內 BM25 會撐爆單程序 → 改用專用後端（Tantivy、Meilisearch、OpenSearch）。
- `hnswlib-node` 的 HNSW 支援到百萬級向量，但 `/build-index` 重建會變慢 → 改為增量 upsert 的向量資料庫（pgvector、Qdrant、Pinecone）。
- `/build-index` 端點應改為背景工作，避免重建超過請求週期。

目前語料不需上述改動，架構已將策略與儲存分離，替換僅需局部更動。
