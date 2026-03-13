/**
 * Golf Clash Shot Calculator — Demo Script
 *
 * Run:    npm run demo
 * Record: Start Screen Studio / OBS, then run this script.
 *
 * Opens a visible Chrome browser at iPhone size and walks through
 * realistic shot scenarios with natural pacing.
 * The sticky result bar at top updates in real-time — no scrolling needed.
 */

import { chromium } from "@playwright/test";

const APP_URL = "https://golf-clash-auto-aim.vercel.app";
const PAUSE = 1200;
const SCENE_GAP = 2500;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function selectAndWait(page, selector, value, ms = PAUSE) {
  await page.selectOption(selector, value);
  await sleep(ms);
}

async function tapWindButton(page, id, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.click(`#${id}`);
    await sleep(200);
  }
  await sleep(400);
}

async function selectDirection(page, angle) {
  await page.click(`.dir-btn[data-angle="${angle}"]:not([style*="hidden"])`);
  await sleep(PAUSE);
}

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ["--window-size=430,932"],
  });

  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();

  // Clear saved prefs for a clean start
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  // ─── Let the viewer see the clean UI ───
  await sleep(3000);

  // ════════════════════════════════════════
  // SCENE 1: The Sniper — 8 mph headwind
  // Classic scenario, watch the sticky bar
  // ════════════════════════════════════════

  await selectAndWait(page, "#club-name", "The Sniper");
  await selectAndWait(page, "#club-level", "8");
  await selectAndWait(page, "#ball", "Basic");

  // Scroll to show the wind section
  await page.evaluate(() => {
    document.getElementById("step-wind").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  await sleep(800);

  // Wind from 5.0 → 8.0 (sticky bar updates each tap)
  await tapWindButton(page, "wind-plus", 6);

  // Headwind
  await selectDirection(page, "0");
  await sleep(2000);

  // Pause to show sticky bar result
  await sleep(SCENE_GAP);

  // ════════════════════════════════════════
  // SCENE 2: Apocalypse + Titan — crosswind
  // Ball wind resistance in action
  // ════════════════════════════════════════

  // Scroll back to club selection
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(800);

  await selectAndWait(page, "#club-name", "The Apocalypse");
  await selectAndWait(page, "#club-level", "5");
  await selectAndWait(page, "#ball", "Titan");

  // Scroll to wind
  await page.evaluate(() => {
    document.getElementById("step-wind").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  await sleep(800);

  // Wind up to 12
  await tapWindButton(page, "wind-plus", 8);

  // Crosswind from right — watch sticky bar change direction
  await selectDirection(page, "90");
  await sleep(2000);

  // Quick: switch directions — sticky bar updates instantly
  await selectDirection(page, "270");
  await sleep(1200);
  await selectDirection(page, "45");
  await sleep(2000);

  await sleep(SCENE_GAP);

  // ════════════════════════════════════════
  // SCENE 3: Endbringer — downhill tailwind
  // Elevation adjustments
  // ════════════════════════════════════════

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(800);

  await selectAndWait(page, "#club-name", "The Endbringer");
  await selectAndWait(page, "#club-level", "4");
  await selectAndWait(page, "#ball", "Kingmaker");

  await page.evaluate(() => {
    document.getElementById("step-wind").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  await sleep(800);

  // Drop wind to 6
  await tapWindButton(page, "wind-minus", 12);

  // Tailwind
  await selectDirection(page, "180");

  // Open elevation section
  await page.click(".advanced-section summary");
  await sleep(800);

  // Downhill
  await page.click('.adv-btn[data-elev="20"]');
  await sleep(1200);

  // Mid distance
  await page.click('.adv-btn[data-dist="50"]');
  await sleep(2000);

  await sleep(SCENE_GAP);

  // ════════════════════════════════════════
  // SCENE 4: Quick-fire club switching
  // Shows instant recalculation speed
  // ════════════════════════════════════════

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(1000);

  // Close advanced
  await page.click(".advanced-section summary");
  await sleep(400);

  const quickClubs = ["The Hornet", "The Backbone", "The Cataclysm", "The Sniper"];
  for (const club of quickClubs) {
    await selectAndWait(page, "#club-name", club, 900);
  }

  // Final hold on the result
  await sleep(4000);

  await browser.close();
})();
