import { test as baseTest } from "@playwright/test";

export { expect } from "@playwright/test";

/**
 * Shared fixture: navigate to the app and ensure the index is built.
 * Tests assume a fresh visit to "/" and that the backend already has docs/*.md indexed.
 */
export const test = baseTest.extend({
  page: async ({ page, baseURL }, use) => {
    if (!baseURL) throw new Error("baseURL must be set");
    await page.goto(baseURL);
    await use(page);
  },
});
