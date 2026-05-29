// spec: specs/qa-bot.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

test.describe("Chat follow-up with conversation memory", () => {
  // Regression: a follow-up that reuses earlier wording ("How do I start one?")
  // must bind to the MOST RECENT topic, not an earlier one. The user asks about
  // email, switches to refunds, then asks "How do I start one?" — which should
  // resolve to "a refund", not snap back to the earlier email topic.
  test("followup-binds-to-most-recent-topic", async ({ page }) => {
    const composer = page.getByPlaceholder("Write a message...");
    const send = page.getByRole("button", { name: "Send" });

    // 1. First topic: email. Wait for the email answer to finish (its citation).
    await composer.fill("Can I change my email address?");
    await send.click();
    await expect(
      page.getByRole("code").filter({ hasText: "account_help.md#change-email-address" }),
    ).toBeVisible({ timeout: 30_000 });

    // 2. Switch topic: refunds. Wait for the refund answer to finish.
    await composer.fill("How long do refunds take?");
    await send.click();
    await expect(
      page.getByRole("code").filter({ hasText: "refund_policy.md#refund-timeline" }),
    ).toBeVisible({ timeout: 30_000 });

    // 3. Ambiguous follow-up that reuses the earlier wording.
    await composer.fill("How do I start one?");
    await send.click();
    await expect(
      page.getByTestId("user-message").filter({ hasText: "How do I start one?" }),
    ).toBeVisible();

    // expect: memory binds "one" to the most recent topic (refund), NOT email.
    const interpreted = page.getByTestId("interpreted-query");
    await expect(interpreted).toBeVisible({ timeout: 30_000 });
    await expect(interpreted).toContainText(/refund/i);
    await expect(interpreted).not.toContainText(/email/i);

    // expect: the answer is grounded, not a generic fallback.
    await expect(page.getByText("I cannot confirm from the knowledge base.")).toHaveCount(0);

    // expect: retrieval for the follow-up surfaced refund sources, not the email doc.
    const sources = page.getByTestId("sources-panel");
    await expect(sources).toContainText("refund_policy.md");
    await expect(sources).not.toContainText("account_help.md");
  });
});
