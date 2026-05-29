// spec: specs/qa-bot.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

test.describe("Chat follow-up with conversation memory", () => {
  test("followup-resolves-pronoun-via-memory", async ({ page }) => {
    // 1. Ask the first question via the suggestion button.
    await page.getByRole("button", { name: "How long do refunds take?" }).click();

    // expect: the assistant answers with the refund timeline + citation.
    await expect(page.getByText(/5-7 business days/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/refund_policy\.md#refund-timeline/)).toBeVisible({
      timeout: 30_000,
    });

    // 2. Ask a follow-up whose subject ("one") only resolves via the prior turn.
    await page.getByPlaceholder("Write a message...").fill("How do I start one?");
    await page.getByRole("button", { name: "Send" }).click();

    // expect: the user bubble for the follow-up appears.
    await expect(page.getByTestId("user-message").filter({ hasText: "How do I start one?" })).toBeVisible();

    // 3. Conversation memory rewrites the follow-up into a standalone refund query.
    // expect: the "Interpreted as" panel surfaces a rewritten question mentioning refund(s).
    const interpreted = page.getByTestId("interpreted-query");
    await expect(interpreted).toBeVisible({ timeout: 30_000 });
    await expect(interpreted).toContainText(/refund/i);

    // 4. The answer is grounded in the refund policy doc, not a generic fallback.
    await expect(page.getByText("I cannot confirm from the knowledge base.")).toHaveCount(0);
    await expect(
      page.getByRole("code").filter({ hasText: "refund_policy.md#refund-timeline" }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
