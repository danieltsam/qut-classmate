import { defineConfig, devices } from "@playwright/test"

/**
 * Single test tool for QUT Classmate: API contract checks, browser E2E, and
 * pure-logic unit tests all live under `tests/` and run through Playwright.
 *
 * The API specs hit QUT's live servers through our own /api route, so these are
 * integration tests: timeouts are generous and the network-dependent specs are
 * retried once.
 */
export default defineConfig({
  testDir: "./tests",

  // One warm page load before the suite: dev-mode compilation of the first page
  // hit is slow and would otherwise be measured as app behaviour.
  globalSetup: "./tests/global-setup.ts",

  // One worker: the specs trampoline through QUT Virtual 4 and a 5000-iteration
  // in-browser Monte Carlo run. Serial keeps timings predictable and keeps
  // concurrent load off QUT's servers.
  workers: 1,
  fullyParallel: false,

  // Live upstream data - retry once before calling something a failure.
  // The app runs on `next dev` with on-demand compilation, so a slow machine can
  // stall hydration past an action timeout. Behaviour is still asserted strictly;
  // these just stop load from being reported as a bug.
  retries: 2,

  timeout: 120_000,
  expect: { timeout: 30_000 },

  reporter: [["list"]],
  forbidOnly: !!process.env.CI,

  use: {
    baseURL: "http://localhost:3000",
    // These belong under `use` — at the top level Playwright ignores them, which
    // is why the earlier timeout bump changed nothing.
    actionTimeout: 45_000,
    navigationTimeout: 90_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Deliberately NO `webServer` block.
  //
  // It used to be `command: "npm run dev"` with `reuseExistingServer: true`. When
  // the health check on :3000 failed — which happens whenever the dev server is
  // mid-recompile, i.e. exactly when someone has just edited a file — Playwright
  // treated it as "no server" and spawned its own. Because :3000 was occupied,
  // Next fell back to :3001, and BOTH dev servers shared the same `.next`
  // directory. When the spawned one exited it took the startup chunks with it and
  // left :3000 serving 404s for `main-app.js`, so the app could not hydrate until
  // `.next` was deleted and the server restarted.
  //
  // Start the dev server yourself; `tests/global-setup.ts` fails with a readable
  // message if :3000 is not healthy, so a missing server is still obvious.
})
