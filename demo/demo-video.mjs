/**
 * Golf Clash Shot Calculator — Side-by-Side Demo Video Script
 *
 * Left: Real Golf Clash gameplay from YouTube (Tommy's wind tutorial)
 * Right: Our calculator matching each shot in real time
 *
 * Run:    npm run demo:video
 * Record: Start Screen Studio or OBS first, then run this.
 */

import { chromium } from "@playwright/test";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEMO_PAGE = `file://${join(__dirname, "demo-video.html")}`;
const CALC_URL = "https://golf-clash-auto-aim.vercel.app";

const PAUSE = 1200;
const SCENE_GAP = 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Scenes: each is a shot scenario synced to visible gameplay ──
// We show the YouTube video of real Golf Clash on the left,
// and drive the calculator on the right to match.
const SCENES = [
  {
    label: "Sniper Lv8 — 8 mph Headwind",
    videoId: "PaLJ8EZ3iY8", // Golf Clash Tommy wind tutorial
    videoStart: 45,
    club: "The Sniper",
    level: "8",
    ball: "Basic",
    wind: 8.0,
    windDir: "0", // headwind
    holdSec: 6,
  },
  {
    label: "Apocalypse Lv5 — 12 mph Crosswind + Titan",
    videoId: "PaLJ8EZ3iY8",
    videoStart: 120,
    club: "The Apocalypse",
    level: "5",
    ball: "Titan",
    wind: 12.0,
    windDir: "90", // right crosswind
    holdSec: 6,
  },
  {
    label: "Endbringer Lv4 — 6 mph Tailwind + Kingmaker",
    videoId: "PaLJ8EZ3iY8",
    videoStart: 200,
    club: "The Endbringer",
    level: "4",
    ball: "Kingmaker",
    wind: 6.0,
    windDir: "180", // tailwind
    holdSec: 6,
  },
  {
    label: "Quick Switch — Watch It Recalculate Instantly",
    videoId: "pOq6i-xoqSs", // Wind Adjustment Only
    videoStart: 10,
    quickFire: true,
    holdSec: 8,
  },
];

async function setCalcValue(calcFrame, selector, value) {
  await calcFrame.locator(selector).selectOption(value);
  await sleep(300);
}

async function tapCalcWind(calcFrame, direction, times) {
  const btnId = direction === "up" ? "#wind-plus" : "#wind-minus";
  for (let i = 0; i < times; i++) {
    await calcFrame.locator(btnId).click();
    await sleep(180);
  }
  await sleep(300);
}

async function setCalcWindTo(calcFrame, targetWind) {
  const currentText = await calcFrame.locator("#wind-value").textContent();
  const current = parseFloat(currentText);
  const diff = targetWind - current;
  const steps = Math.round(Math.abs(diff) / 0.5);
  if (steps > 0) {
    await tapCalcWind(calcFrame, diff > 0 ? "up" : "down", steps);
  }
}

async function selectCalcDirection(calcFrame, angle) {
  await calcFrame.locator(`.dir-btn[data-angle="${angle}"]:not([style*="hidden"])`).click();
  await sleep(400);
}

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--window-size=1280,720",
      "--disable-web-security",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // Load the demo harness
  await page.goto(DEMO_PAGE, { waitUntil: "domcontentloaded" });
  await sleep(500);

  // Load the calculator in the right iframe
  await page.evaluate((url) => window.demoAPI.loadCalculator(url), CALC_URL);
  await sleep(3000); // Let calculator fully load

  const calcFrame = page.frameLocator("#calc-frame");

  // Wait for calculator to be ready, then clear prefs and reload
  await sleep(1000);
  try {
    await calcFrame.locator("#club-name").waitFor({ timeout: 5000 });
    await calcFrame.locator("body").evaluate(() => localStorage.clear());
  } catch (e) { /* first load may fail, that's ok */ }
  await page.evaluate((url) => window.demoAPI.loadCalculator(url), CALC_URL);
  await sleep(3000);

  // ─── OPENING: Let viewer see the layout ───
  await page.evaluate(() => {
    window.demoAPI.showCallout("Real Golf Clash gameplay on the left — our calculator on the right", 4000);
  });
  await sleep(5000);

  // ─── Run each scene ───
  for (const scene of SCENES) {
    // Switch video
    await page.evaluate(
      ({ videoId, videoStart }) => window.demoAPI.setVideo(videoId, videoStart),
      { videoId: scene.videoId, videoStart: scene.videoStart }
    );
    await sleep(1500);

    // Show scene label
    await page.evaluate(
      (label) => window.demoAPI.showCallout(label, 3500),
      scene.label
    );
    await sleep(1000);

    if (scene.quickFire) {
      // Quick-fire: rapidly switch clubs
      const clubs = [
        { club: "The Hornet", level: "7" },
        { club: "The Backbone", level: "6" },
        { club: "The Cataclysm", level: "5" },
        { club: "The Extra Mile", level: "7" },
        { club: "The Sniper", level: "10" },
      ];
      for (const c of clubs) {
        await setCalcValue(calcFrame, "#club-name", c.club);
        await sleep(200);
        await setCalcValue(calcFrame, "#club-level", c.level);
        await sleep(1000);
      }
      await sleep(scene.holdSec * 1000);
    } else {
      // Set calculator to match this shot
      await setCalcValue(calcFrame, "#club-name", scene.club);
      await setCalcValue(calcFrame, "#club-level", scene.level);
      await setCalcValue(calcFrame, "#ball", scene.ball);

      // Scroll calc to wind section
      await calcFrame.locator("#step-wind").evaluate((el) => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      await sleep(600);

      // Set wind speed
      await setCalcWindTo(calcFrame, scene.wind);

      // Set direction
      await selectCalcDirection(calcFrame, scene.windDir);

      // Hold on this scene so viewer can see the result
      await sleep(scene.holdSec * 1000);
    }

    await sleep(SCENE_GAP);
  }

  // ─── CLOSING ───
  await page.evaluate(() => {
    window.demoAPI.showCallout("No more manual math. Instant ring adjustments.", 5000);
  });
  await sleep(6000);

  await browser.close();
})();
