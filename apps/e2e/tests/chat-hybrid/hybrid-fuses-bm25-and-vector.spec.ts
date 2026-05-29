// spec: specs/qa-bot.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

test.describe("Chat with Hybrid (RRF)", () => {
  test("hybrid-is-default-and-answers-with-citation", async ({ page }) => {
    // 1. Hybrid is the default selected strategy.
    const hybridBtn = page.getByRole("button", { name: /Hybrid/ });
    await expect(hybridBtn).toBeVisible();
    await expect(hybridBtn).toHaveClass(/border-primary/);

    // 2. Ask a refund question — BM25 and vector both surface the refund timeline,
    //    so RRF fuses them.
    await page.getByRole("button", { name: "How long do refunds take?" }).click();
    await expect(page.getByText("How long do refunds take?")).toBeVisible();

    // 3. Grounded, streamed answer — not the cannot-confirm fallback.
    await expect(page.getByText(/5-7 business days/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("I cannot confirm from the knowledge base.")).toHaveCount(0);

    // 4. The sources panel reports the hybrid strategy and a refund source.
    const sources = page.getByTestId("sources-panel");
    await expect(sources).toContainText("hybrid");
    await expect(sources).toContainText("refund_policy.md");
  });
});
