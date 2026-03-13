// Golf Clash Screenshot OCR Engine
// Reads wind speed, wind direction, and club from game screenshots

import { createWorker } from "tesseract.js";

let worker = null;

async function getWorker() {
  if (!worker) {
    worker = await createWorker("eng");
  }
  return worker;
}

/**
 * Golf Clash HUD layout (typical positions as % of screen):
 * - Wind speed + arrow: top-center area (~40-60% x, ~2-12% y)
 * - Club name: bottom-left area (~5-40% x, ~85-95% y)
 * - Club distance: near club name
 *
 * These are approximate and may vary slightly by device/resolution.
 */
const REGIONS = {
  wind: { x: 0.3, y: 0.0, w: 0.4, h: 0.14 },
  club: { x: 0.0, y: 0.82, w: 0.45, h: 0.18 },
};

/**
 * Crop a region from the screenshot canvas.
 */
function cropRegion(canvas, region) {
  const { x, y, w, h } = region;
  const sx = Math.floor(canvas.width * x);
  const sy = Math.floor(canvas.height * y);
  const sw = Math.floor(canvas.width * w);
  const sh = Math.floor(canvas.height * h);

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = sw;
  cropCanvas.height = sh;
  const ctx = cropCanvas.getContext("2d");
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

  // Enhance contrast for better OCR
  enhanceContrast(ctx, sw, sh);

  return cropCanvas;
}

/**
 * Enhance image contrast for better OCR accuracy.
 * Golf Clash text is typically white/light on dark background.
 */
function enhanceContrast(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const brightness = (r + g + b) / 3;

    // Threshold: make light text white, dark background black
    if (brightness > 120) {
      data[i] = data[i + 1] = data[i + 2] = 255;
    } else {
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Extract wind speed from OCR text.
 * Looks for patterns like "5.0", "12.3", "W 5.0", etc.
 */
function parseWindSpeed(text) {
  // Look for decimal numbers that could be wind speed (0-15 range)
  const matches = text.match(/(\d{1,2}\.?\d?)\s*(mph|MPH)?/g);
  if (!matches) return null;

  for (const match of matches) {
    const num = parseFloat(match);
    if (num >= 0 && num <= 15) return num;
  }
  return null;
}

/**
 * Extract wind direction from the screenshot by analyzing
 * the wind arrow's pixel colors in the wind region.
 * The arrow is typically a bright color pointing in the wind direction.
 */
function parseWindDirection(canvas) {
  const region = REGIONS.wind;
  const sx = Math.floor(canvas.width * region.x);
  const sy = Math.floor(canvas.height * region.y);
  const sw = Math.floor(canvas.width * region.w);
  const sh = Math.floor(canvas.height * region.h);

  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(sx, sy, sw, sh);
  const data = imageData.data;

  // Find the arrow by looking for bright/colored pixels
  // The wind arrow is usually a distinct color (blue/white)
  let sumX = 0, sumY = 0, count = 0;
  const centerX = sw / 2, centerY = sh / 2;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];

      // Look for bright blue/white arrow pixels
      const brightness = (r + g + b) / 3;
      const isArrow = brightness > 200 || (b > 150 && b > r && b > g);

      if (isArrow) {
        sumX += x - centerX;
        sumY += y - centerY;
        count++;
      }
    }
  }

  if (count < 10) return null;

  // Calculate angle from center of mass of arrow pixels
  const avgX = sumX / count;
  const avgY = sumY / count;
  let angle = (Math.atan2(avgY, avgX) * 180) / Math.PI + 90;
  if (angle < 0) angle += 360;

  return Math.round(angle);
}

/**
 * Parse club name from OCR text.
 * Matches against known club names.
 */
const KNOWN_CLUBS = [
  "The Rocket", "The Extra Mile", "Big Topper", "The Quarterback",
  "The Rock", "Thor's Hammer", "The Apocalypse",
  "The Horizon", "The Sniper", "The Guardian", "The Cataclysm",
  "The Hammerhead", "The Big Dawg",
  "The Backbone", "The Goliath", "The B52", "The Grizzly", "The Tsunami",
  "The Hornet", "The Thorn", "The Kingfisher", "The Falcon",
  "The Dart", "The Firefly", "The Boomerang", "The Endbringer",
  "The Rapier", "The Skewer",
  "The Razor", "Nirvana", "The Off Roader",
  "The Castaway", "The Malibu", "Spitfire", "Houdini",
];

function parseClubName(text) {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, "");

  let bestMatch = null;
  let bestScore = 0;

  for (const club of KNOWN_CLUBS) {
    const clubNorm = club.toLowerCase().replace(/[^a-z0-9\s]/g, "");
    const words = clubNorm.split(" ");

    // Count how many words from the club name appear in the OCR text
    let matchedWords = 0;
    for (const word of words) {
      if (word.length > 2 && normalized.includes(word)) {
        matchedWords++;
      }
    }

    const score = matchedWords / words.length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = club;
    }
  }

  return bestScore >= 0.5 ? bestMatch : null;
}

/**
 * Parse club level from OCR text near the club name.
 * Looks for patterns like "Lv5", "Level 5", "5", etc.
 */
function parseClubLevel(text) {
  const match = text.match(/(?:lv|level|lvl)\s*(\d{1,2})/i);
  if (match) return parseInt(match[1]);

  // Look for standalone small numbers near club context
  const nums = text.match(/\b(\d{1,2})\b/g);
  if (nums) {
    for (const n of nums) {
      const val = parseInt(n);
      if (val >= 1 && val <= 10) return val;
    }
  }
  return null;
}

/**
 * Main OCR function: process a screenshot and extract game state.
 */
export async function processScreenshot(imageSource) {
  const w = await getWorker();

  // Load image into canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const img = await loadImage(imageSource);
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  // Process regions in parallel
  const windCrop = cropRegion(canvas, REGIONS.wind);
  const clubCrop = cropRegion(canvas, REGIONS.club);

  const [windResult, clubResult] = await Promise.all([
    w.recognize(windCrop),
    w.recognize(clubCrop),
  ]);

  const windText = windResult.data.text;
  const clubText = clubResult.data.text;

  // Parse results
  const windSpeed = parseWindSpeed(windText);
  const windDirection = parseWindDirection(canvas);
  const clubName = parseClubName(clubText);
  const clubLevel = parseClubLevel(clubText);

  return {
    windSpeed,
    windDirection,
    clubName,
    clubLevel,
    // Raw OCR text for debugging
    debug: {
      windText: windText.trim(),
      clubText: clubText.trim(),
      windCropUrl: windCrop.toDataURL(),
      clubCropUrl: clubCrop.toDataURL(),
    },
  };
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;

    if (source instanceof File || source instanceof Blob) {
      img.src = URL.createObjectURL(source);
    } else if (typeof source === "string") {
      img.src = source;
    } else if (source instanceof HTMLCanvasElement) {
      img.src = source.toDataURL();
    } else {
      reject(new Error("Unsupported image source"));
    }
  });
}
