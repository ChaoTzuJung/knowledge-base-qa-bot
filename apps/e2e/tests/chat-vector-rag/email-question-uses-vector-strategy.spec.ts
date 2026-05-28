// spec: specs/qa-bot.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

test.describe("Chat with Vector RAG", () => {
  test("email-question-uses-vector-strategy", async ({ page }) => {
    // 1. Click the "Vector RAG" strategy card in the right panel
    const vectorRagBtn = page.getByRole("button", { name: /Vector RAG/ });
    const markdownKbBtn = page.getByRole("button", { name: /Markdown KB/ });

    await vectorRagBtn.click();

    // expect: the "Vector RAG" card now has the selected style (class matches /border-primary/)
    await expect(vectorRagBtn).toHaveClass(/border-primary/);

    // expect: the "Markdown KB" card no longer has /border-primary/
    await expect(markdownKbBtn).not.toHaveClass(/border-primary/);

    // 2. Click the suggestion button "Can I change my email address?"
    await page.getByRole("button", { name: "Can I change my email address?" }).click();

    // expect: a user message bubble "Can I change my email address?" appears
    await expect(page.getByText("Can I change my email address?")).toBeVisible();

    // 3. Wait for the assistant response to finish streaming (allow up to 30s)
    // expect: the assistant message text contains the citation account_help.md#change-email-address
    await expect(page.getByText(/account_help\.md#change-email-address/)).toBeVisible({
      timeout: 30_000,
    });

    // 4. Inspect the SOURCES panel
    // expect: a badge with text "vector_rag" is visible
    await expect(page.getByText("vector_rag")).toBeVisible();

    // expect: a source card contains the code account_help.md#change-email-address
    await expect(
      page.getByRole("code").filter({ hasText: "account_help.md#change-email-address" }),
    ).toBeVisible();
  });
});
