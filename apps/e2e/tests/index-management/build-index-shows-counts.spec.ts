// spec: specs/qa-bot.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

test.describe("Index management", () => {
  test("build-index-shows-counts", async ({ page }) => {
    const button = page.getByRole("button", { name: /Build Index|Indexing/ });
    await expect(button).toBeVisible();

    // 1. Slow the /index request so the "Indexing…" in-flight label is observable.
    await page.route("**/index", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });

    await button.click();
    await expect(button).toHaveText("Indexing…");

    // 2. Wait for the request to complete
    // expect: a result card appears containing the text "Markdown KB: 3 files, 12 sections"
    await expect(page.getByText("Markdown KB: 3 files, 12 sections")).toBeVisible();

    // expect: the same card contains the text "Vector: 3 files, 9 chunks"
    await expect(page.getByText("Vector: 3 files, 9 chunks")).toBeVisible();
  });
});
