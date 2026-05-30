// spec: specs/qa-bot.plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";

test.describe("Feedback loop", () => {
  test("thumbs-down-records-feedback-with-expected-source", async ({ page }) => {
    // 1. Ask a question (Hybrid is the default) and wait for the grounded answer.
    await page.getByRole("button", { name: "How long do refunds take?" }).click();
    await expect(page.getByText(/refund_policy\.md#refund-timeline/)).toBeVisible({
      timeout: 30_000,
    });

    // 2. The feedback panel appears for the latest answer.
    await expect(page.getByTestId("feedback-panel")).toBeVisible();

    // 3. Capture the POST /feedback request, then let it hit the real server.
    let body: { rating?: string; expected_source?: unknown } | null = null;
    await page.route("**/feedback", async (route) => {
      body = route.request().postDataJSON();
      await route.continue();
    });

    // 4. Thumbs-down → pick the source it should have used → submit.
    await page.getByTestId("feedback-down").click();
    // index 0 is the "Pick a source…" placeholder, so index 1 is the first retrieved source.
    await page.getByTestId("feedback-expected").selectOption({ index: 1 });
    await page.getByTestId("feedback-submit").click();

    // 5. The panel confirms the feedback was recorded.
    await expect(page.getByTestId("feedback-recorded")).toBeVisible();

    // expect: the POST carried a "down" rating and a concrete expected_source.
    expect(body?.rating).toBe("down");
    expect(typeof body?.expected_source).toBe("string");
    expect((body?.expected_source as string).length).toBeGreaterThan(0);
  });
});
