// spec: specs/qa-bot.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

test.describe("Chat with Markdown KB", () => {
  test("refund-question-streams-answer-with-citation", async ({ page }) => {
    // 1. Confirm "Markdown KB" is the selected strategy in the right panel
    // expect: the "Markdown KB" strategy card has a primary-tinted border (class matches /border-primary/)
    const markdownKbBtn = page.getByRole("button", {
      name: /Markdown KB/,
    });
    await expect(markdownKbBtn).toBeVisible();
    await expect(markdownKbBtn).toHaveClass(/border-primary/);

    // 2. Click the suggestion button "How long do refunds take?"
    await page.getByRole("button", { name: "How long do refunds take?" }).click();

    // expect: a user message bubble "How long do refunds take?" appears
    await expect(page.getByText("How long do refunds take?")).toBeVisible();

    // 3. Wait for the assistant response to finish streaming (allow up to 30s)
    // expect: an assistant message appears with "5-7 business days"
    await expect(page.getByText(/5-7 business days/)).toBeVisible({
      timeout: 30_000,
    });

    // expect: the assistant message text contains the citation refund_policy.md#refund-timeline
    await expect(page.getByText(/refund_policy\.md#refund-timeline/)).toBeVisible({
      timeout: 30_000,
    });

    // 4. Inspect the SOURCES panel
    // expect: a badge with text "markdown_kb" is visible
    await expect(page.getByText("markdown_kb")).toBeVisible();

    // expect: a source card contains the code refund_policy.md#refund-timeline
    await expect(page.getByRole("code").filter({ hasText: "refund_policy.md#refund-timeline" })).toBeVisible();

    // expect: that same card shows the heading breadcrumb "Refund Policy > Refund Timeline"
    await expect(page.getByText("Refund Policy > Refund Timeline")).toBeVisible();

    // expect: that card shows a score label starting with "score" followed by a number
    await expect(page.getByText(/score \d/)).toBeVisible();
  });
});
