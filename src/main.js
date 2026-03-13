import { CLUBS, BALLS, CLUB_CATEGORIES } from "./clubs.js";
import { calculateShot, generateWindChart } from "./calculator.js";
import { processScreenshot } from "./ocr.js";

// ── DOM refs ──
const categorySelect = document.getElementById("club-category");
const clubSelect = document.getElementById("club-name");
const levelSelect = document.getElementById("club-level");
const ballSelect = document.getElementById("ball");
const windValueEl = document.getElementById("wind-value");
const windMinusBtn = document.getElementById("wind-minus");
const windPlusBtn = document.getElementById("wind-plus");
const ringCanvas = document.getElementById("ring-canvas");
const ringNumber = document.getElementById("ring-number");
const ringDesc = document.getElementById("ring-description");
const answerInstruction = document.getElementById("answer-instruction");
const directionText = document.getElementById("direction-text");
const ringsText = document.getElementById("rings-text");
const answerCurl = document.getElementById("answer-curl");
const curlText = document.getElementById("curl-text");
const windChartEl = document.getElementById("wind-chart");
const stickyRings = document.getElementById("sticky-rings");
const stickyDirection = document.getElementById("sticky-direction");

// Hidden compatibility elements
const windSpeedHidden = document.getElementById("wind-speed");
const windSpeedNumHidden = document.getElementById("wind-speed-num");
const distanceHidden = document.getElementById("distance");
const elevationHidden = document.getElementById("elevation");

// ── State ──
let windSpeed = 5.0;
let windAngle = 0;
let distancePercent = 100;
let elevationPercent = 0;

// ── Init ──
function init() {
  // Populate all clubs (flat list, grouped by category)
  CLUB_CATEGORIES.forEach((cat) => {
    const group = document.createElement("optgroup");
    group.label = cat;
    Object.entries(CLUBS)
      .filter(([, c]) => c.category === cat)
      .forEach(([name]) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        group.appendChild(opt);
      });
    clubSelect.appendChild(group);
  });

  // Category select (hidden by default, for filtering)
  CLUB_CATEGORIES.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });

  // Balls - show friendly names, most common first
  const commonBalls = ["Basic", "Marlin", "Navigator", "Quasar", "Titan", "Katana", "Kingmaker", "Berserker", "Luminaire"];
  commonBalls.forEach((name) => {
    if (!BALLS[name]) return;
    const b = BALLS[name];
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = `${name} (Wind ${b.windResist}, Power ${b.power})`;
    ballSelect.appendChild(opt);
  });
  ballSelect.value = "Basic";

  // Default to a popular club
  clubSelect.value = "The Sniper";
  updateLevelList();

  // Load saved preferences
  loadPreferences();
}

function updateLevelList() {
  const club = CLUBS[clubSelect.value];
  if (!club) return;

  levelSelect.innerHTML = "";
  for (let i = club.accuracy.length; i >= 1; i--) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `Level ${i}`;
    levelSelect.appendChild(opt);
  }
  // Default to max
  levelSelect.value = club.accuracy.length;

  recalculate();
}

function updateClubListByCategory() {
  const cat = categorySelect.value;
  clubSelect.innerHTML = "";

  CLUB_CATEGORIES.forEach((c) => {
    const group = document.createElement("optgroup");
    group.label = c;
    Object.entries(CLUBS)
      .filter(([, club]) => club.category === c)
      .forEach(([name]) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        group.appendChild(opt);
      });
    clubSelect.appendChild(group);
  });

  // Select first club in the chosen category
  const firstInCat = Object.entries(CLUBS).find(([, c]) => c.category === cat);
  if (firstInCat) clubSelect.value = firstInCat[0];

  updateLevelList();
}

// ── Wind controls ──
function updateWindDisplay() {
  windValueEl.textContent = windSpeed.toFixed(1);
  windSpeedHidden.value = windSpeed;
  windSpeedNumHidden.value = windSpeed;
  recalculate();
}

windMinusBtn.addEventListener("click", () => {
  windSpeed = Math.max(0, windSpeed - 0.5);
  updateWindDisplay();
});

windPlusBtn.addEventListener("click", () => {
  windSpeed = Math.min(15, windSpeed + 0.5);
  updateWindDisplay();
});

// Long press for continuous increment
let holdTimer = null;
let holdSpeed = 0;

function startHold(direction) {
  holdSpeed = 0;
  holdTimer = setInterval(() => {
    holdSpeed++;
    const step = holdSpeed > 10 ? 1.0 : 0.5;
    windSpeed = direction === "plus"
      ? Math.min(15, windSpeed + step)
      : Math.max(0, windSpeed - step);
    updateWindDisplay();
  }, 150);
}

function stopHold() {
  if (holdTimer) { clearInterval(holdTimer); holdTimer = null; }
}

windMinusBtn.addEventListener("mousedown", () => startHold("minus"));
windMinusBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startHold("minus"); });
windPlusBtn.addEventListener("mousedown", () => startHold("plus"));
windPlusBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startHold("plus"); });
window.addEventListener("mouseup", stopHold);
window.addEventListener("touchend", stopHold);

// ── Wind direction buttons ──
const dirButtons = document.querySelectorAll(".dir-btn[data-angle]");
dirButtons.forEach((btn) => {
  if (btn.style.visibility === "hidden") return;
  btn.addEventListener("click", () => {
    dirButtons.forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    windAngle = parseInt(btn.dataset.angle);
    recalculate();
  });
});
// Default select headwind
document.querySelector('.dir-btn[data-angle="0"]:not([style])')?.classList.add("selected");

// ── Elevation & Distance buttons ──
document.querySelectorAll(".adv-btn[data-elev]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".adv-btn[data-elev]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    elevationPercent = parseInt(btn.dataset.elev);
    elevationHidden.value = elevationPercent;
    recalculate();
  });
});

document.querySelectorAll(".adv-btn[data-dist]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".adv-btn[data-dist]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    distancePercent = parseInt(btn.dataset.dist);
    distanceHidden.value = distancePercent;
    recalculate();
  });
});

// ── Ring target visualization ──
function drawRingTarget(rings, adjustAngle) {
  const ctx = ringCanvas.getContext("2d");
  const cx = 100, cy = 100;
  ctx.clearRect(0, 0, 200, 200);

  const ringDefs = [
    { radius: 90, color: "#44cc44" },
    { radius: 72, color: "#ffffff" },
    { radius: 54, color: "#4488ff" },
    { radius: 36, color: "#ff8c00" },
    { radius: 18, color: "#ffd700" },
  ];

  ringDefs.forEach((ring) => {
    ctx.beginPath();
    ctx.arc(cx, cy, ring.radius, 0, Math.PI * 2);
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // Bullseye
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#ff4444";
  ctx.fill();

  if (rings > 0.1) {
    const angleRad = ((adjustAngle - 90) * Math.PI) / 180;
    const pixelsPerRing = 18;
    const dist = Math.min(rings * pixelsPerRing, 90);
    const tx = cx + Math.cos(angleRad) * dist;
    const ty = cy + Math.sin(angleRad) * dist;

    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(cx, cy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = "#00d4aa";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(tx, ty, 7, 0, Math.PI * 2);
    ctx.strokeStyle = "#00d4aa";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tx - 10, ty);
    ctx.lineTo(tx + 10, ty);
    ctx.moveTo(tx, ty - 10);
    ctx.lineTo(tx, ty + 10);
    ctx.strokeStyle = "#00d4aa";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// ── Friendly direction names ──
function getDirectionName(angle) {
  const dirs = [
    [0, "opposite the wind (away from you)"],
    [45, "down and to the left"],
    [90, "to the left"],
    [135, "up and to the left"],
    [180, "toward the wind (toward you)"],
    [225, "up and to the right"],
    [270, "to the right"],
    [315, "down and to the right"],
  ];
  const adjusted = (angle + 180) % 360;
  let best = dirs[0];
  let bestDiff = 999;
  for (const [a, name] of dirs) {
    const diff = Math.abs(((adjusted - a + 180) % 360) - 180);
    if (diff < bestDiff) { bestDiff = diff; best = [a, name]; }
  }
  return best[1];
}

// ── Main recalculation ──
function recalculate() {
  const clubName = clubSelect.value;
  const clubLevel = parseInt(levelSelect.value);
  const ballName = ballSelect.value;

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

  // Big ring number
  ringNumber.textContent = result.ringsToAdjust.toFixed(1);
  ringDesc.textContent = result.ringBreakdown.description;

  const colorMap = {
    yellow: "#ffd700", orange: "#ff8c00", blue: "#4488ff",
    white: "#ffffff", green: "#44cc44", beyond: "#ff4444", center: "#00d4aa",
  };
  ringNumber.style.color = colorMap[result.ringBreakdown.color] || "#00d4aa";

  // Ring visualization
  drawRingTarget(result.ringsToAdjust, result.adjustmentAngle);

  // Plain English instruction
  const dirName = getDirectionName(result.adjustmentAngle);
  directionText.textContent = dirName;
  ringsText.textContent = `${result.ringsToAdjust.toFixed(1)} rings`;

  // Sticky bar
  stickyRings.textContent = result.ringsToAdjust.toFixed(1);
  stickyRings.style.color = colorMap[result.ringBreakdown.color] || "#00d4aa";
  stickyDirection.textContent = dirName;

  if (result.ringsToAdjust < 0.3) {
    answerInstruction.innerHTML = "Wind is very light — <strong>aim right at your target!</strong>";
  }

  // Curl recommendation
  if (result.recommendedCurl > 0) {
    answerCurl.hidden = false;
    const curlDir = result.curlDirection === "left" ? "left" : "right";
    curlText.textContent = `Add a little curl to the ${curlDir} to fight the crosswind`;
  } else {
    answerCurl.hidden = true;
  }

  // Wind chart
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
    div.innerHTML = `<div class="wc-wind">${entry.wind} mph</div><div class="wc-rings">${entry.rings.toFixed(1)}</div>`;
    windChartEl.appendChild(div);
  });

  // Save preferences
  savePreferences();
}

// ── Persistence (remember his selections) ──
function savePreferences() {
  try {
    localStorage.setItem("gc-prefs", JSON.stringify({
      club: clubSelect.value,
      level: levelSelect.value,
      ball: ballSelect.value,
      wind: windSpeed,
    }));
  } catch (e) { /* ignore */ }
}

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem("gc-prefs"));
    if (!saved) return;
    if (saved.club && CLUBS[saved.club]) {
      clubSelect.value = saved.club;
      updateLevelList();
      if (saved.level) levelSelect.value = saved.level;
    }
    if (saved.ball) ballSelect.value = saved.ball;
    if (saved.wind !== undefined) {
      windSpeed = saved.wind;
      updateWindDisplay();
    }
  } catch (e) { /* ignore */ }
}

// ── Event listeners ──
categorySelect.addEventListener("change", updateClubListByCategory);
clubSelect.addEventListener("change", updateLevelList);
levelSelect.addEventListener("change", recalculate);
ballSelect.addEventListener("change", recalculate);

// ── Screenshot OCR ──
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const previewImg = document.getElementById("preview-img");
const ocrStatus = document.getElementById("ocr-status");
const ocrDetections = document.getElementById("ocr-detections");
const applyOcrBtn = document.getElementById("apply-ocr-btn");

let lastOcrResult = null;

dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (e.target.files.length) handleImage(e.target.files[0]);
});

dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", () => { dropZone.classList.remove("dragover"); });
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files.length) handleImage(e.dataTransfer.files[0]);
});

document.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) { handleImage(item.getAsFile()); break; }
  }
});

async function handleImage(file) {
  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewImg.hidden = false;
  dropZone.querySelector(".drop-zone-content").hidden = true;

  ocrStatus.textContent = "Reading your screenshot...";
  ocrStatus.className = "ocr-status processing";
  ocrDetections.hidden = true;

  try {
    const result = await processScreenshot(file);
    lastOcrResult = result;

    document.getElementById("ocr-wind-speed").textContent =
      result.windSpeed !== null ? `${result.windSpeed} mph` : "Couldn't read";
    document.getElementById("ocr-club").textContent =
      result.clubName || "Couldn't read";

    ocrStatus.textContent = "Here's what we found:";
    ocrStatus.className = "ocr-status";
    ocrDetections.hidden = false;
  } catch (err) {
    ocrStatus.textContent = "Sorry, couldn't read that screenshot. Try entering the values manually.";
    ocrStatus.className = "ocr-status error";
  }
}

applyOcrBtn.addEventListener("click", () => {
  if (!lastOcrResult) return;
  const { windSpeed: ws, windDirection, clubName, clubLevel } = lastOcrResult;

  if (ws !== null) {
    windSpeed = ws;
    updateWindDisplay();
  }
  if (windDirection !== null) {
    windAngle = windDirection;
    // Find closest direction button
    let bestBtn = null, bestDiff = 999;
    dirButtons.forEach((btn) => {
      if (btn.style.visibility === "hidden") return;
      const diff = Math.abs(parseInt(btn.dataset.angle) - windAngle);
      if (diff < bestDiff) { bestDiff = diff; bestBtn = btn; }
    });
    if (bestBtn) {
      dirButtons.forEach((b) => b.classList.remove("selected"));
      bestBtn.classList.add("selected");
    }
  }
  if (clubName && CLUBS[clubName]) {
    clubSelect.value = clubName;
    updateLevelList();
    if (clubLevel !== null) levelSelect.value = clubLevel;
  }

  recalculate();
  applyOcrBtn.textContent = "Done!";
  setTimeout(() => { applyOcrBtn.textContent = "Use These Values"; }, 1500);
});

// ── Boot ──
init();
recalculate();
