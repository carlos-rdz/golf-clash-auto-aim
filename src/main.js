import { CLUBS, BALLS, CLUB_CATEGORIES } from "./clubs.js";
import { calculateShot, generateWindChart } from "./calculator.js";
import { processScreenshot } from "./ocr.js";

// ── DOM refs ──
const categorySelect = document.getElementById("club-category");
const clubSelect = document.getElementById("club-name");
const levelSelect = document.getElementById("club-level");
const ballSelect = document.getElementById("ball");
const windSlider = document.getElementById("wind-speed");
const windNum = document.getElementById("wind-speed-num");
const distSlider = document.getElementById("distance");
const distLabel = document.getElementById("distance-label");
const elevSlider = document.getElementById("elevation");
const elevLabel = document.getElementById("elevation-label");
const compassCanvas = document.getElementById("compass-canvas");
const windAngleLabel = document.getElementById("wind-angle-label");

// Result elements
const ringNumber = document.getElementById("ring-number");
const ringDesc = document.getElementById("ring-description");
const ringCanvas = document.getElementById("ring-canvas");
const effectiveWindEl = document.getElementById("effective-wind");
const windPerRingEl = document.getElementById("wind-per-ring");
const clubAccuracyEl = document.getElementById("club-accuracy");
const curlRecEl = document.getElementById("curl-rec");
const adjustDirEl = document.getElementById("adjust-direction");
const distMultEl = document.getElementById("dist-mult");
const chartClubName = document.getElementById("chart-club-name");
const windChartEl = document.getElementById("wind-chart");

// ── State ──
let windAngle = 0; // degrees, 0 = headwind
let isDraggingCompass = false;

// ── Init dropdowns ──
function initDropdowns() {
  // Categories
  CLUB_CATEGORIES.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });
  categorySelect.value = "Driver";

  // Balls
  Object.keys(BALLS).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    ballSelect.appendChild(opt);
  });
  ballSelect.value = "Basic";

  updateClubList();
}

function updateClubList() {
  const cat = categorySelect.value;
  clubSelect.innerHTML = "";

  Object.entries(CLUBS)
    .filter(([, c]) => c.category === cat)
    .forEach(([name]) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      clubSelect.appendChild(opt);
    });

  updateLevelList();
}

function updateLevelList() {
  const club = CLUBS[clubSelect.value];
  if (!club) return;

  levelSelect.innerHTML = "";
  for (let i = 1; i <= club.accuracy.length; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `Level ${i}`;
    levelSelect.appendChild(opt);
  }
  // Default to max level
  levelSelect.value = club.accuracy.length;

  recalculate();
}

// ── Compass drawing & interaction ──
function drawCompass() {
  const ctx = compassCanvas.getContext("2d");
  const cx = 70, cy = 70, r = 55;

  ctx.clearRect(0, 0, 140, 140);

  // Outer circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "#2a3a4a";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cardinal labels
  ctx.fillStyle = "#8899aa";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("HEAD", cx, 16);
  ctx.fillText("TAIL", cx, 134);
  ctx.textBaseline = "middle";
  ctx.fillText("L", 10, cy);
  ctx.fillText("R", 130, cy);

  // Wind arrow
  const angleRad = ((windAngle - 90) * Math.PI) / 180;
  const ax = cx + Math.cos(angleRad) * (r - 10);
  const ay = cy + Math.sin(angleRad) * (r - 10);

  // Arrow line
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ax, ay);
  ctx.strokeStyle = "#00d4aa";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Arrow head
  const headLen = 10;
  const ha1 = angleRad - 0.4;
  const ha2 = angleRad + 0.4;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - Math.cos(ha1) * headLen, ay - Math.sin(ha1) * headLen);
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - Math.cos(ha2) * headLen, ay - Math.sin(ha2) * headLen);
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#00d4aa";
  ctx.fill();
}

function getWindAngleFromMouse(e) {
  const rect = compassCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left - 70;
  const y = e.clientY - rect.top - 70;
  let angle = (Math.atan2(y, x) * 180) / Math.PI + 90;
  if (angle < 0) angle += 360;
  return Math.round(angle);
}

function getWindLabel(angle) {
  if (angle <= 10 || angle >= 350) return "Headwind";
  if (angle >= 170 && angle <= 190) return "Tailwind";
  if (angle > 10 && angle < 80) return "Head-Right";
  if (angle >= 80 && angle <= 100) return "Right Crosswind";
  if (angle > 100 && angle < 170) return "Tail-Right";
  if (angle > 190 && angle < 260) return "Tail-Left";
  if (angle >= 260 && angle <= 280) return "Left Crosswind";
  return "Head-Left";
}

compassCanvas.addEventListener("mousedown", (e) => {
  isDraggingCompass = true;
  windAngle = getWindAngleFromMouse(e);
  drawCompass();
  windAngleLabel.textContent = `${windAngle}° (${getWindLabel(windAngle)})`;
  recalculate();
});

window.addEventListener("mousemove", (e) => {
  if (!isDraggingCompass) return;
  windAngle = getWindAngleFromMouse(e);
  drawCompass();
  windAngleLabel.textContent = `${windAngle}° (${getWindLabel(windAngle)})`;
  recalculate();
});

window.addEventListener("mouseup", () => { isDraggingCompass = false; });

// ── Ring target visualization ──
function drawRingTarget(rings, adjustAngle) {
  const ctx = ringCanvas.getContext("2d");
  const cx = 140, cy = 140;
  ctx.clearRect(0, 0, 280, 280);

  const ringDefs = [
    { radius: 120, color: "#44cc44", name: "green" },
    { radius: 96, color: "#ffffff", name: "white" },
    { radius: 72, color: "#4488ff", name: "blue" },
    { radius: 48, color: "#ff8c00", name: "orange" },
    { radius: 24, color: "#ffd700", name: "yellow" },
  ];

  // Draw rings
  ringDefs.forEach((ring) => {
    ctx.beginPath();
    ctx.arc(cx, cy, ring.radius, 0, Math.PI * 2);
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // Bullseye dot
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#ff4444";
  ctx.fill();

  // Adjustment indicator
  if (rings > 0.1) {
    const angleRad = ((adjustAngle - 90) * Math.PI) / 180;
    const pixelsPerRing = 24;
    const dist = Math.min(rings * pixelsPerRing, 120);
    const tx = cx + Math.cos(angleRad) * dist;
    const ty = cy + Math.sin(angleRad) * dist;

    // Line from center to target
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(cx, cy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = "#00d4aa";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);

    // Target crosshair
    ctx.beginPath();
    ctx.arc(tx, ty, 8, 0, Math.PI * 2);
    ctx.strokeStyle = "#00d4aa";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tx - 12, ty);
    ctx.lineTo(tx + 12, ty);
    ctx.moveTo(tx, ty - 12);
    ctx.lineTo(tx, ty + 12);
    ctx.strokeStyle = "#00d4aa";
    ctx.lineWidth = 1;
    ctx.stroke();

    // "AIM HERE" label
    ctx.fillStyle = "#00d4aa";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("AIM HERE", tx, ty - 16);
  }
}

// ── Main recalculation ──
function recalculate() {
  const clubName = clubSelect.value;
  const clubLevel = parseInt(levelSelect.value);
  const ballName = ballSelect.value;
  const windSpeed = parseFloat(windSlider.value);
  const distancePercent = parseInt(distSlider.value);
  const elevationPercent = parseInt(elevSlider.value);

  if (!clubName || !CLUBS[clubName]) return;

  const result = calculateShot({
    clubName,
    clubLevel,
    ballName,
    windSpeed,
    windAngle,
    distancePercent,
    elevationPercent,
  });

  // Update ring display
  ringNumber.textContent = result.ringsToAdjust.toFixed(1);
  ringDesc.textContent = result.ringBreakdown.description;

  // Color the ring number
  const colorMap = {
    yellow: "#ffd700",
    orange: "#ff8c00",
    blue: "#4488ff",
    white: "#ffffff",
    green: "#44cc44",
    beyond: "#ff4444",
    center: "#00d4aa",
  };
  ringNumber.style.color = colorMap[result.ringBreakdown.color] || "#00d4aa";

  // Draw ring target
  drawRingTarget(result.ringsToAdjust, result.adjustmentAngle);

  // Update details
  effectiveWindEl.textContent = `${result.effectiveWind} mph`;
  windPerRingEl.textContent = result.windPerRing.toFixed(2);
  clubAccuracyEl.textContent = result.clubAccuracy;
  distMultEl.textContent = `${result.distanceMultiplier.toFixed(2)}x`;

  if (result.recommendedCurl > 0) {
    curlRecEl.textContent = `${result.recommendedCurl}% ${result.curlDirection}`;
    curlRecEl.style.color = "#ffd700";
  } else {
    curlRecEl.textContent = "None needed";
    curlRecEl.style.color = "";
  }

  const dirLabels = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  const dirIdx = Math.round(result.adjustmentAngle / 22.5) % 16;
  adjustDirEl.textContent = `${dirLabels[dirIdx]} (${result.adjustmentAngle}°)`;

  // Update wind chart
  chartClubName.textContent = `— ${clubName} Lv${clubLevel}`;
  const chart = generateWindChart(clubName, clubLevel, ballName);
  windChartEl.innerHTML = "";

  chart.forEach((entry) => {
    const div = document.createElement("div");
    const ringColor =
      entry.rings <= 0.25 ? "center" :
      entry.rings <= 1 ? "yellow" :
      entry.rings <= 2 ? "orange" :
      entry.rings <= 3 ? "blue" :
      entry.rings <= 4 ? "white" :
      entry.rings <= 5 ? "green" : "beyond";

    div.className = `wind-chart-item ring-${ringColor}`;
    div.innerHTML = `
      <div class="wc-wind">${entry.wind} mph</div>
      <div class="wc-rings">${entry.rings.toFixed(1)}</div>
    `;
    windChartEl.appendChild(div);
  });
}

// ── Event listeners ──
categorySelect.addEventListener("change", updateClubList);
clubSelect.addEventListener("change", updateLevelList);
levelSelect.addEventListener("change", recalculate);
ballSelect.addEventListener("change", recalculate);

windSlider.addEventListener("input", () => {
  windNum.value = windSlider.value;
  recalculate();
});
windNum.addEventListener("input", () => {
  windSlider.value = windNum.value;
  recalculate();
});

distSlider.addEventListener("input", () => {
  const v = distSlider.value;
  distLabel.textContent =
    v <= 25 ? `${v}% (Min)` :
    v <= 75 ? `${v}% (Mid)` : `${v}% (Max)`;
  recalculate();
});

elevSlider.addEventListener("input", () => {
  const v = parseInt(elevSlider.value);
  elevLabel.textContent =
    v < 0 ? `${v}% (Uphill)` :
    v > 0 ? `+${v}% (Downhill)` : "0% (Level)";
  recalculate();
});

// ── Screenshot OCR ──
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const previewImg = document.getElementById("preview-img");
const ocrStatus = document.getElementById("ocr-status");
const ocrDetections = document.getElementById("ocr-detections");
const ocrDebug = document.getElementById("ocr-debug");
const applyOcrBtn = document.getElementById("apply-ocr-btn");

let lastOcrResult = null;

// Click to upload
dropZone.addEventListener("click", () => fileInput.click());

// File input change
fileInput.addEventListener("change", (e) => {
  if (e.target.files.length) handleImage(e.target.files[0]);
});

// Drag and drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files.length) handleImage(e.dataTransfer.files[0]);
});

// Paste from clipboard
document.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      handleImage(item.getAsFile());
      break;
    }
  }
});

async function handleImage(file) {
  // Show preview
  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewImg.hidden = false;
  dropZone.querySelector(".drop-zone-content").hidden = true;

  // Run OCR
  ocrStatus.textContent = "Analyzing screenshot...";
  ocrStatus.className = "ocr-status processing";
  ocrDetections.hidden = true;
  ocrDebug.hidden = true;

  try {
    const result = await processScreenshot(file);
    lastOcrResult = result;

    // Show detections
    const windSpeedEl = document.getElementById("ocr-wind-speed");
    const windDirEl = document.getElementById("ocr-wind-dir");
    const clubEl = document.getElementById("ocr-club");
    const levelEl = document.getElementById("ocr-level");

    windSpeedEl.textContent = result.windSpeed !== null ? `${result.windSpeed} mph` : "Not detected";
    windSpeedEl.className = `ocr-value ${result.windSpeed !== null ? "detected" : "missed"}`;

    windDirEl.textContent = result.windDirection !== null ? `${result.windDirection}°` : "Not detected";
    windDirEl.className = `ocr-value ${result.windDirection !== null ? "detected" : "missed"}`;

    clubEl.textContent = result.clubName || "Not detected";
    clubEl.className = `ocr-value ${result.clubName ? "detected" : "missed"}`;

    levelEl.textContent = result.clubLevel !== null ? `Level ${result.clubLevel}` : "Not detected";
    levelEl.className = `ocr-value ${result.clubLevel !== null ? "detected" : "missed"}`;

    ocrStatus.textContent = "Screenshot analyzed — review and apply";
    ocrStatus.className = "ocr-status";
    ocrDetections.hidden = false;

    // Debug info
    const debugText = document.getElementById("ocr-debug-text");
    debugText.textContent = `Wind region: "${result.debug.windText}"\nClub region: "${result.debug.clubText}"`;
    document.getElementById("ocr-crop-wind").src = result.debug.windCropUrl;
    document.getElementById("ocr-crop-club").src = result.debug.clubCropUrl;
    ocrDebug.hidden = false;

  } catch (err) {
    ocrStatus.textContent = `OCR error: ${err.message}`;
    ocrStatus.className = "ocr-status error";
  }
}

// Apply OCR results to calculator
applyOcrBtn.addEventListener("click", () => {
  if (!lastOcrResult) return;

  const { windSpeed, windDirection, clubName, clubLevel } = lastOcrResult;

  // Apply wind speed
  if (windSpeed !== null) {
    windSlider.value = windSpeed;
    windNum.value = windSpeed;
  }

  // Apply wind direction
  if (windDirection !== null) {
    windAngle = windDirection;
    drawCompass();
    windAngleLabel.textContent = `${windAngle}° (${getWindLabel(windAngle)})`;
  }

  // Apply club
  if (clubName && CLUBS[clubName]) {
    const club = CLUBS[clubName];
    categorySelect.value = club.category;
    updateClubList();
    clubSelect.value = clubName;
    updateLevelList();

    // Apply level
    if (clubLevel !== null && clubLevel >= 1 && clubLevel <= club.accuracy.length) {
      levelSelect.value = clubLevel;
    }
  }

  recalculate();

  // Visual feedback
  applyOcrBtn.textContent = "Applied!";
  setTimeout(() => { applyOcrBtn.textContent = "Apply to Calculator"; }, 1500);
});

// ── Boot ──
initDropdowns();
drawCompass();
