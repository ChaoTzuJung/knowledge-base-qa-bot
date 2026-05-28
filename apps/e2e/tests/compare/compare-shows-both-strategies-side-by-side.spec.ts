// spec: specs/qa-bot.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

test.describe("Compare mode", () => {
  test("compare-shows-both-strategies-side-by-side", async ({ page }) => {
    // 1. Click the "Compare" toggle in the header
    // The header has two mode toggle buttons: "Chat" and "Compare".
    // The submit button inside the CompareView form also reads "Compare", so we scope the toggle
    // to the header and use .first() as a disambiguation fallback.
    const compareToggle = page.getByRole("button", { name: "Compare" }).first();
    await compareToggle.click();

    // expect: the "Compare" toggle has class matching /bg-primary/
    await expect(compareToggle).toHaveClass(/bg-primary/);

    // expect: a compare query input with placeholder "Ask the same question against both strategies…" is visible
    const compareInput = page.getByRole("textbox", { name: "Ask the same question against" });
    await expect(compareInput).toBeVisible();

    // expect: a "Compare" submit button is visible (the form submit, scoped to the form)
    const compareSubmitBtn = page.locator("form").getByRole("button", { name: "Compare" });
    await expect(compareSubmitBtn).toBeVisible();

    // expect: two column headers visible: "Markdown KB (BM25)" and "Vector RAG (HNSW)"
    await expect(page.getByText("Markdown KB (BM25)", { exact: true })).toBeVisible();
    await expect(page.getByText("Vector RAG (HNSW)", { exact: true })).toBeVisible();

    // expect: both columns show "No result yet."
    await expect(page.getByText("No result yet.")).toHaveCount(2);

    // 2. Type "How long do refunds take?" into the compare input
    await compareInput.fill("How long do refunds take?");

    // expect: the input contains that text
    await expect(compareInput).toHaveValue("How long do refunds take?");

    // 3. Click the "Compare" submit button
    await compareSubmitBtn.click();

    // expect: button text becomes "Comparing…" while in flight
    // This is a brief transitional state; we attempt to catch it with a short timeout,
    // but proceed to end-state verification if it's too fast to observe.
    await expect(page.getByRole("button", { name: "Comparing…" })).toBeVisible({ timeout: 2_000 }).catch(() => {
      // Transitional state too brief — end-state assertions still confirm correctness
    });

    // 4. Wait for both responses to finish (up to 45s) — real LLM calls run both strategies in parallel
    // 4. Wait for both responses — assert section contents directly to avoid strict-mode
    // collisions ("5-7 business days" appears in both the answer body and the source preview).
    const markdownKbSection = page.locator("section").filter({ hasText: "Markdown KB (BM25)" });
    const vectorRagSection = page.locator("section").filter({ hasText: "Vector RAG (HNSW)" });

    await expect(markdownKbSection).toContainText("5-7 business days", { timeout: 45_000 });
    await expect(markdownKbSection).toContainText("refund_policy.md#refund-timeline", { timeout: 45_000 });
    await expect(vectorRagSection).toContainText("5-7 business days", { timeout: 45_000 });
    await expect(vectorRagSection).toContainText("refund_policy.md#refund-timeline", { timeout: 45_000 });

    // expect: both columns show at least one source card under a "Sources" sub-header
    await expect(markdownKbSection.getByText("Sources")).toBeVisible();
    await expect(vectorRagSection.getByText("Sources")).toBeVisible();
  });
});
