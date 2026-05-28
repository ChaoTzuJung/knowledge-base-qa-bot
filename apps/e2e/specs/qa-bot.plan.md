# Knowledge Base Q&A Bot — E2E Test Plan

## Application Overview

A Vite + React frontend (assistant-ui v0.14) over a Hono + AI SDK v6 backend.
The user picks a retrieval strategy (Markdown KB / Vector RAG), clicks **Build Index**
to index `docs/*.md`, then asks questions in a streaming chat thread. Sources for
each answer appear in a right-hand panel. A **Compare** mode runs both strategies
side-by-side for the same query. Answers must cite sources as `filename.md#heading`
and fall back to "I cannot confirm from the knowledge base." for out-of-scope queries.

The frontend on `:5173` proxies `/health`, `/index`, `/chat`, `/chat/stream`, `/compare`
to the backend on `:8000`. Tests assume both servers are running and `OPENAI_API_KEY` is set.

The backend persists `.kb/index.json` and `.kb/vector_index/`, so the index survives
between test runs. The **Build Index** scenario explicitly rebuilds to verify the flow.

## Test Scenarios

### 1. Cold start

**Seed:** `tests/seed.spec.ts`

#### 1.1. shows-welcome-and-controls

**File:** `tests/cold-start/shows-welcome-and-controls.spec.ts`

**Steps:**
  1. Wait for the app to render
    - expect: page title contains "Knowledge Base Q&A Bot"
    - expect: header "Knowledge Base Q&A Bot" is visible
    - expect: "Chat" toggle button is visible and selected (has primary background)
    - expect: "Compare" toggle button is visible and not selected
    - expect: "Ask me anything from the indexed knowledge base." welcome line is visible
    - expect: all four suggestion buttons are visible — "How long do refunds take?", "Can I change my email address?", "How fast is expedited shipping?", "Which restaurants are nearby?"
    - expect: right sidebar shows "INDEX" label and "Build Index" button
    - expect: right sidebar shows "RETRIEVAL STRATEGY" label with two options "Markdown KB" and "Vector RAG"; "Markdown KB" is selected
    - expect: right sidebar shows "SOURCES" with empty state "Sources will appear here after you ask a question."
    - expect: composer textarea with placeholder "Write a message..." is visible

### 2. Index management

**Seed:** `tests/seed.spec.ts`

#### 2.1. build-index-shows-counts

**File:** `tests/index-management/build-index-shows-counts.spec.ts`

**Steps:**
  1. Click the "Build Index" button
    - expect: button text changes to "Indexing…" while in flight
  2. Wait for the request to complete
    - expect: a result card appears containing the text "Markdown KB: 3 files, 12 sections"
    - expect: the same card contains the text "Vector: 3 files, 9 chunks"

### 3. Chat with Markdown KB

**Seed:** `tests/seed.spec.ts`

#### 3.1. refund-question-streams-answer-with-citation

**File:** `tests/chat-markdown-kb/refund-question-streams-answer-with-citation.spec.ts`

**Steps:**
  1. Confirm "Markdown KB" is the selected strategy in the right panel
    - expect: the "Markdown KB" strategy card has a primary-tinted border (the selected style)
  2. Click the suggestion button "How long do refunds take?"
    - expect: a user message bubble "How long do refunds take?" appears
  3. Wait for the assistant response to finish streaming
    - expect: an assistant message appears
    - expect: the assistant message text contains "5-7 business days"
    - expect: the assistant message text contains the citation `refund_policy.md#refund-timeline`
  4. Inspect the SOURCES panel
    - expect: the strategy badge in the SOURCES header reads "markdown_kb"
    - expect: a source card contains the code `refund_policy.md#refund-timeline`
    - expect: that same card shows the heading breadcrumb "Refund Policy > Refund Timeline"
    - expect: that card shows a score label starting with "score" followed by a number

### 4. Chat with Vector RAG

**Seed:** `tests/seed.spec.ts`

#### 4.1. email-question-uses-vector-strategy

**File:** `tests/chat-vector-rag/email-question-uses-vector-strategy.spec.ts`

**Steps:**
  1. Click the "Vector RAG" strategy card in the right panel
    - expect: the "Vector RAG" card now has the selected (primary-tinted border) style
    - expect: the "Markdown KB" card no longer has the selected style
  2. Click the suggestion button "Can I change my email address?"
    - expect: a user message bubble "Can I change my email address?" appears
  3. Wait for the assistant response to finish streaming
    - expect: the assistant message text contains the citation `account_help.md#change-email-address`
  4. Inspect the SOURCES panel
    - expect: the strategy badge in the SOURCES header reads "vector_rag"
    - expect: a source card contains the code `account_help.md#change-email-address`

### 5. Out-of-scope fallback

**Seed:** `tests/seed.spec.ts`

#### 5.1. nearby-restaurants-returns-cannot-confirm

**File:** `tests/out-of-scope/nearby-restaurants-returns-cannot-confirm.spec.ts`

**Steps:**
  1. Type "Which restaurants are nearby?" into the composer textarea
    - expect: the textarea contains that text
  2. Click the send button
    - expect: a user message bubble "Which restaurants are nearby?" appears
  3. Wait for the assistant response to finish
    - expect: the assistant message text equals exactly "I cannot confirm from the knowledge base."
    - expect: the SOURCES panel shows the empty state "Sources will appear here after you ask a question." (no source cards)

### 6. Compare mode

**Seed:** `tests/seed.spec.ts`

#### 6.1. compare-shows-both-strategies-side-by-side

**File:** `tests/compare/compare-shows-both-strategies-side-by-side.spec.ts`

**Steps:**
  1. Click the "Compare" toggle in the header
    - expect: the "Compare" toggle is now selected (primary background)
    - expect: a compare query input with placeholder "Ask the same question against both strategies…" is visible
    - expect: a "Compare" submit button is visible
    - expect: two result columns are visible with headers "Markdown KB (BM25)" and "Vector RAG (HNSW)"
    - expect: both columns show "No result yet."
  2. Type "How long do refunds take?" into the compare input
    - expect: the input contains that text
  3. Click the "Compare" submit button
    - expect: the button shows "Comparing…" while in flight
  4. Wait for both responses to finish
    - expect: the Markdown KB column contains "5-7 business days" and the citation `refund_policy.md#refund-timeline`
    - expect: the Vector RAG column contains "5-7 business days" and the citation `refund_policy.md#refund-timeline`
    - expect: both columns show at least one source card under a "Sources" sub-header
