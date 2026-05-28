// spec: specs/qa-bot.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

test.describe("Out-of-scope fallback", () => {
  test("nearby-restaurants-returns-cannot-confirm", async ({ page }) => {
    // 1. Type "Which restaurants are nearby?" into the composer textarea
    const composer = page.getByRole("textbox", { name: "Write a message..." });
    await composer.fill("Which restaurants are nearby?");

    // expect: the textarea has value "Which restaurants are nearby?"
    await expect(composer).toHaveValue("Which restaurants are nearby?");

    // 2. Press Enter to send the message
    await page.keyboard.press("Enter");

    // expect: a user message bubble "Which restaurants are nearby?" appears
    await expect(
      page.getByTestId("user-message").filter({ hasText: "Which restaurants are nearby?" }),
    ).toBeVisible();

    // 3. Wait for the assistant response to finish (allow up to 30s)
    // expect: the assistant message text equals exactly "I cannot confirm from the knowledge base."
    await expect(
      page.getByText("I cannot confirm from the knowledge base."),
    ).toBeVisible({ timeout: 30_000 });

    // expect: the SOURCES panel shows the empty state (no source cards)
    await expect(
      page.getByText("Sources will appear here after you ask a question."),
    ).toBeVisible();
  });
});
