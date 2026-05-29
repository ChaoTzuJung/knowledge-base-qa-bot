// spec: specs/qa-bot.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

test.describe("Assistant message rendering", () => {
  // The refund-request answer quotes Markdown bold from the KB (**Request Refund**).
  // It must render as formatting, not surface raw "**" markers to the user.
  test("renders-markdown-not-raw-markers", async ({ page }) => {
    await page.getByPlaceholder("Write a message...").fill("How do I start a refund?");
    await page.getByRole("button", { name: "Send" }).click();

    // expect: "**Request Refund**" becomes a <strong>, scoped to the rendered answer
    // (the raw text also appears in the sources panel, but not as a <strong>).
    await expect(page.locator("strong", { hasText: "Request Refund" })).toBeVisible({
      timeout: 30_000,
    });
  });
});
