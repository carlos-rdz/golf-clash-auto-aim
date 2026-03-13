// Golf Clash Wind & Shot Calculator Engine
// Based on the publicly known Ring Method formula

import { CLUBS, BALLS } from "./clubs.js";

/**
 * Wind per ring base values by accuracy.
 * Formula: base WPR at accuracy 0 is 3.0, and every 10 accuracy reduces it by 0.2
 * So WPR = 3.0 - (accuracy / 10) * 0.2
 *
 * Known reference points:
 *   accuracy 0   → WPR 3.0
 *   accuracy 20  → WPR 2.6
 *   accuracy 50  → WPR 2.0
 *   accuracy 100 → WPR 1.0
 */
export function getWindPerRing(accuracy) {
  return 3.0 - (accuracy / 10) * 0.2;
}

/**
 * Distance adjustment multiplier.
 * At max distance the multiplier is 1.0.
 * At mid distance it's ~0.75.
 * At min distance it's ~0.5.
 * This accounts for less air time on shorter shots.
 */
export function getDistanceMultiplier(distancePercent) {
  // distancePercent: 0 = min, 50 = mid, 100 = max
  return 0.5 + (distancePercent / 100) * 0.5;
}

/**
 * Ball wind resistance reduces effective wind.
 * Each level of wind resistance reduces wind by ~10%.
 */
export function getEffectiveWind(windSpeed, ballWindResist) {
  const reduction = 1 - ballWindResist * 0.1;
  return windSpeed * Math.max(reduction, 0.5);
}

/**
 * Elevation adjustment.
 * Uphill: ball is in air less time → reduce adjustment (negative %)
 * Downhill: ball is in air more time → increase adjustment (positive %)
 * Typical range: -30% to +30%
 */
export function getElevationMultiplier(elevationPercent) {
  // elevationPercent: -30 (uphill) to +30 (downhill)
  return 1 + elevationPercent / 100;
}

/**
 * Calculate the recommended curl to counteract high crosswind.
 * When wind > 7 mph with a significant crosswind component,
 * curl in the opposite direction helps keep the ball on line.
 */
export function getRecommendedCurl(windSpeed, windAngle, maxCurl) {
  // windAngle: 0 = headwind, 90 = pure crosswind, 180 = tailwind
  const crosswindComponent = Math.abs(Math.sin((windAngle * Math.PI) / 180));
  const crosswind = windSpeed * crosswindComponent;

  if (crosswind <= 7) return 0;

  // Scale curl recommendation: more crosswind = more curl needed
  // Cap at available curl for the club
  const curlNeeded = Math.min(((crosswind - 7) / 10) * 50, maxCurl);
  return Math.round(curlNeeded);
}

/**
 * Main calculation: compute the full shot adjustment.
 *
 * Returns an object with:
 *   - ringsToAdjust: how many rings to move the target
 *   - adjustmentDirection: which way to move (opposite of wind)
 *   - effectiveWind: wind after ball resistance
 *   - windPerRing: the WPR for this club's accuracy
 *   - recommendedCurl: curl to apply for high crosswind
 *   - ringBreakdown: which colored ring to target
 */
export function calculateShot({
  clubName,
  clubLevel,
  ballName = "Basic",
  windSpeed,
  windAngle = 0, // 0-360 degrees, 0 = from north
  distancePercent = 100, // 0-100, where 100 = max range
  elevationPercent = 0, // -30 to +30
}) {
  const club = CLUBS[clubName];
  if (!club) throw new Error(`Unknown club: ${clubName}`);

  const ball = BALLS[ballName];
  if (!ball) throw new Error(`Unknown ball: ${ballName}`);

  const levelIndex = clubLevel - 1;
  if (levelIndex < 0 || levelIndex >= club.accuracy.length) {
    throw new Error(
      `Invalid level ${clubLevel} for ${clubName} (max: ${club.accuracy.length})`
    );
  }

  const accuracy = club.accuracy[levelIndex];
  const maxCurl = club.curl[levelIndex];
  const power = club.power[levelIndex];

  // Step 1: Get base wind per ring for this club's accuracy
  const windPerRing = getWindPerRing(accuracy);

  // Step 2: Apply ball wind resistance to get effective wind
  const effectiveWind = getEffectiveWind(windSpeed, ball.windResist);

  // Step 3: Apply distance multiplier
  const distMult = getDistanceMultiplier(distancePercent);

  // Step 4: Apply elevation multiplier
  const elevMult = getElevationMultiplier(elevationPercent);

  // Step 5: Calculate rings to adjust
  const ringsRaw = (effectiveWind / windPerRing) * distMult * elevMult;
  const ringsToAdjust = Math.round(ringsRaw * 10) / 10; // round to 0.1

  // Step 6: Determine which ring color that corresponds to
  const ringBreakdown = getRingBreakdown(ringsToAdjust);

  // Step 7: Calculate recommended curl for crosswind
  const recommendedCurl = getRecommendedCurl(
    effectiveWind,
    windAngle,
    maxCurl
  );

  // Step 8: Wind direction — adjustment is opposite the wind
  const adjustmentAngle = (windAngle + 180) % 360;

  return {
    // Core result
    ringsToAdjust,
    adjustmentAngle,
    ringBreakdown,

    // Curl recommendation
    recommendedCurl,
    curlDirection:
      recommendedCurl > 0
        ? windAngle > 0 && windAngle < 180
          ? "left"
          : "right"
        : "none",

    // Details
    effectiveWind: Math.round(effectiveWind * 10) / 10,
    windPerRing: Math.round(windPerRing * 100) / 100,
    distanceMultiplier: distMult,
    elevationMultiplier: elevMult,

    // Club info
    clubAccuracy: accuracy,
    clubPower: power,
    clubMaxCurl: maxCurl,
    clubCategory: club.category,
  };
}

/**
 * Convert ring count to a human-readable ring color target.
 * Yellow = 1, Orange = 2, Blue = 3, White = 4, Green = 5
 */
function getRingBreakdown(rings) {
  const ringColors = [
    { name: "Yellow", max: 1 },
    { name: "Orange", max: 2 },
    { name: "Blue", max: 3 },
    { name: "White", max: 4 },
    { name: "Green", max: 5 },
  ];

  const absRings = Math.abs(rings);

  if (absRings <= 0.25) return { description: "Barely move — center of bullseye", color: "center" };

  for (const ring of ringColors) {
    if (absRings <= ring.max) {
      const fraction = absRings - (ring.max - 1);
      let position;
      if (fraction <= 0.25) position = "inner edge";
      else if (fraction <= 0.5) position = "inner half";
      else if (fraction <= 0.75) position = "outer half";
      else position = "outer edge";

      return {
        description: `${position} of ${ring.name} ring`,
        color: ring.name.toLowerCase(),
        fraction: Math.round(fraction * 10) / 10,
      };
    }
  }

  return {
    description: `${absRings.toFixed(1)} rings — beyond Green (max out!)`,
    color: "beyond",
    fraction: absRings,
  };
}

/**
 * Get all clubs in a category, sorted by a stat.
 */
export function getClubsByCategory(category) {
  return Object.entries(CLUBS)
    .filter(([, club]) => club.category === category)
    .map(([name, club]) => ({ name, ...club }));
}

/**
 * Quick reference: generate a wind chart for a specific club at a specific level.
 * Returns ring adjustments for wind speeds 1-15 at max distance.
 */
export function generateWindChart(clubName, clubLevel, ballName = "Basic") {
  const chart = [];
  for (let wind = 1; wind <= 15; wind++) {
    const result = calculateShot({
      clubName,
      clubLevel,
      ballName,
      windSpeed: wind,
      windAngle: 90, // pure crosswind (worst case)
      distancePercent: 100,
      elevationPercent: 0,
    });
    chart.push({
      wind,
      rings: result.ringsToAdjust,
      ringTarget: result.ringBreakdown.description,
    });
  }
  return chart;
}
