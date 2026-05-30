// spec: specs/qa-bot.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

test.describe("Chat with LLM Index router", () => {
  test("llm-index-picks-sections-and-answers", async ({ page }) => {
    // 1. Select the "LLM Index" strategy (Hybrid is the default).
    const llmIndexBtn = page.getByRole("button", { name: /LLM Index/ });
    await expect(llmIndexBtn).toBeVisible();
    await llmIndexBtn.click();
    await expect(llmIndexBtn).toHaveClass(/border-primary/);

    // 2. Ask a refund question — the router reads the catalog and should pick the
    //    refund section.
    await page.getByRole("button", { name: "How long do refunds take?" }).click();
    await expect(page.getByText("How long do refunds take?")).toBeVisible();

    // 3. Grounded, cited answer — not the cannot-confirm fallback.
    await expect(page.getByText(/5-7 business days/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("I cannot confirm from the knowledge base.")).toHaveCount(0);

    // 4. Sources panel reports the llm_index strategy and a refund source.
    const sources = page.getByTestId("sources-panel");
    await expect(sources).toContainText("llm_index");
    await expect(sources).toContainText("refund_policy.md");
  });
});
