// spec: specs/plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

test.describe("Cold start", () => {
  test("shows-welcome-and-controls", async ({ page }) => {
    // 1. Wait for the app to render
    // expect: page title contains "Knowledge Base Q&A Bot"
    await expect(page).toHaveTitle(/Knowledge Base Q&A Bot/);

    // expect: header "Knowledge Base Q&A Bot" is visible
    await expect(page.getByRole("heading", { name: "Knowledge Base Q&A Bot" })).toBeVisible();

    // expect: "Chat" toggle button is visible and selected (has primary background)
    const chatBtn = page.getByRole("button", { name: "Chat" });
    await expect(chatBtn).toBeVisible();
    await expect(chatBtn).toHaveClass(/bg-primary/);

    // expect: "Compare" toggle button is visible and not selected
    const compareBtn = page.getByRole("button", { name: "Compare" });
    await expect(compareBtn).toBeVisible();
    await expect(compareBtn).not.toHaveClass(/bg-primary/);

    // expect: "Ask me anything from the indexed knowledge base." welcome line is visible
    await expect(
      page.getByRole("heading", { name: "Ask me anything from the indexed knowledge base." })
    ).toBeVisible();

    // expect: all four suggestion buttons are visible
    await expect(page.getByRole("button", { name: "How long do refunds take?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Can I change my email address?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "How fast is expedited shipping?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Which restaurants are nearby?" })).toBeVisible();

    // expect: right sidebar shows "INDEX" label and "Build Index" button
    await expect(page.getByText("Index", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Build Index" })).toBeVisible();

    // expect: right sidebar shows "RETRIEVAL STRATEGY" label with two options; "Markdown KB" is selected
    await expect(page.getByText("Retrieval Strategy")).toBeVisible();
    const markdownKbBtn = page.getByRole("button", { name: "Markdown KB BM25 over heading sections" });
    await expect(markdownKbBtn).toBeVisible();
    await expect(markdownKbBtn).toHaveClass(/border-primary/);
    const vectorRagBtn = page.getByRole("button", { name: "Vector RAG Embeddings + HNSW (cosine)" });
    await expect(vectorRagBtn).toBeVisible();
    await expect(vectorRagBtn).not.toHaveClass(/border-primary/);

    // expect: right sidebar shows "SOURCES" with empty state message
    await expect(page.getByText("Sources will appear here after you ask a question.")).toBeVisible();

    // expect: composer textarea with placeholder "Write a message..." is visible
    await expect(page.getByRole("textbox", { name: "Write a message..." })).toBeVisible();
  });
});
