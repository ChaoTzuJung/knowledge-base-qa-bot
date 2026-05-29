<p align="right"><a href="./README.md">English</a> · <strong>繁體中文</strong></p>

# 知識庫問答機器人（Knowledge Base Q&A Bot）

一個可自架的本地 Markdown 知識庫問答聊天機器人。伺服器提供 **兩種可互換的檢索策略** —— Markdown KB（BM25）與 Vector RAG（HNSW + OpenAI 嵌入）—— 並在回答中即時串流附帶來源引用的內容。
Web 前端基於 [assistant-ui](https://www.assistant-ui.com/) 與 [Vercel AI SDK v6](https://ai-sdk.dev/) 的 UI 訊息串流協定。

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

### 安裝與啟動

```bash
npm install
npm run dev:server   # 終端 1 —— Hono 啟動於 :8000
npm run dev:web      # 終端 2 —— Vite 啟動於 :5173（反向代理至 :8000）
```

接著開啟 <http://localhost:5173>。首次載入時索引是空的 —— 點擊側邊欄的 **Build Index**（或 `POST /build-index`）後才能提問。

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

### 常用腳本

```bash
npm run dev:server   # Hono 後端，:8000
npm run dev:web      # Vite 前端，:5173
npm run import:raw   # 將 raw/*.txt|*.html 正規化成 docs/*.md
npm run build        # tsc -b + vite build
npm run test:unit    # node:test 單元測試（raw→Markdown 轉換函式）
npm run test:e2e     # Playwright 測試套件（自動啟動 dev servers）
```

---

## 2 · 運作原理

### 目錄結構

```
.
├── apps/
│   ├── server/                  Hono 後端，監聽 :8000
│   │   └── src/
│   │       ├── app.ts           鏈式 Hono 建構器；匯出 AppType 供 RPC 使用
│   │       ├── index.ts         啟動與伺服
│   │       ├── routes/          /health, /build-index, /chat, /chat/stream, /compare
│   │       ├── strategies/      markdown-kb (BM25), vector-rag (HNSW), 共用 retrieve
│   │       └── scripts/         import-raw：raw/*.{txt,html} → docs/*.md（含測試）
│   ├── web/                     React + Vite + Tailwind + assistant-ui，監聽 :5173
│   │   └── src/lib/api.ts       透過 hc<AppType> 的 Hono RPC 客戶端
│   └── e2e/                     Playwright 測試；透過 webServer 自動啟動 dev servers
├── packages/
│   └── shared/                  Strategy、SourceInfo、ChatResult、IndexResult 共用型別
├── raw/                         待匯入的 .txt / .html 原始檔放置區
├── docs/                        canonical Markdown 知識庫（refund_policy、account_help...）
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
| POST | `/chat`         | `{ query, strategy?: "markdown_kb" \| "vector_rag" }`        | `{ answer, sources, strategy }`                          |
| POST | `/chat/stream`  | `{ query, strategy? }` 或 `{ messages: [...], strategy? }`    | AI SDK UI message stream（SSE）                          |
| POST | `/compare`      | `{ query }`                                                  | `{ markdown_kb: {...}, vector_rag: {...} }`              |

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
實作上使用 `createUIMessageStream` 先插入 `data-sources` 區塊，再將 `streamText().toUIMessageStream({ messageMetadata, onFinish })` 的輸出合併。

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

Playwright 設定檔的 `webServer` 區塊讓 `npm run test:e2e` 自動啟動 `dev:server` 與 `dev:web`，或於本地重複使用已啟動的實例。

單元測試使用 Node 內建的 `node:test`（零依賴），涵蓋 `apps/server/src/scripts/import-raw.test.ts` 裡的純 raw→Markdown 轉換函式。以 `npm run test:unit` 執行。

---

## 3 · 設計決策

### 為何提供兩種檢索策略？

題目要求「具來源引用」。BM25 與向量 RAG 的失敗模式不同，且語料小，並行執行成本極低。`/compare` 可視化差異，讓讀者建立直覺：
「退款多久入帳？」 → BM25 因標題含關鍵字而命中；
「如何更改電子郵件？」 → 向量勝出，因標題為「更新帳號電子郵件」無表面重疊。

### 為何以標題段落為檢索單位？

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
