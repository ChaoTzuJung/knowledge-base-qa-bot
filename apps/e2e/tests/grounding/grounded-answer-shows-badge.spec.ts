// spec: specs/qa-bot.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

test.describe("Grounding verifier", () => {
  test("grounded-answer-shows-grounding-badge", async ({ page }) => {
    // Ask a well-supported question (hybrid default).
    await page.getByRole("button", { name: "How long do refunds take?" }).click();
    await expect(page.getByText(/5-7 business days/)).toBeVisible({ timeout: 30_000 });

    // The grounding verdict streams AFTER the answer (a second verifier call).
    const badge = page.getByTestId("grounding-badge");
    await expect(badge).toBeVisible({ timeout: 30_000 });
    await expect(badge).toContainText("Grounding");
    // The refund-timeline answer is fully supported, so it's the grounded variant.
    await expect(badge).not.toContainText("not found in the sources");
  });
});
