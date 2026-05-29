// spec: specs/qa-bot.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

test.describe("Index management", () => {
  test("build-index-shows-counts", async ({ page }) => {
    const button = page.getByRole("button", { name: /Build Index|Indexing/ });
    await expect(button).toBeVisible();

    // 1. Slow the /build-index request so the "Indexing…" in-flight label is observable.
    await page.route("**/build-index", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });

    await button.click();
    await expect(button).toHaveText("Indexing…");

    // 2. Wait for the request to complete
    // expect: a result card reports the Markdown KB counts (file count stays exact;
    // section count tolerates KB content edits).
    await expect(page.getByText(/Markdown KB: 5 files, \d+ sections/)).toBeVisible();

    // expect: the same card reports the Vector counts.
    await expect(page.getByText(/Vector: 5 files, \d+ chunks/)).toBeVisible();
  });
});
