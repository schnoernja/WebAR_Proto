console.log("gps-debug.js LOADED");

const devLatEl = document.getElementById("dev-lat");
const devLonEl = document.getElementById("dev-lon");
const objLatEl = document.getElementById("obj-lat");
const objLonEl = document.getElementById("obj-lon");
const statusEl = document.getElementById("gps-status");
const distanceEl = document.getElementById("obj-distance");
const testLatInput = document.getElementById("test-lat");
const testLonInput = document.getElementById("test-lon");
const applyTestBtn = document.getElementById("apply-test-coords");
const heightEl = document.getElementById("obj-height");
const testHeightInput = document.getElementById("test-height");
const applyHeightBtn = document.getElementById("apply-height");
const resetAheadBtn = document.getElementById("reset-ahead");
const lockGroundInput = document.getElementById("lock-ground");

const toggleBtn = document.getElementById("gps-toggle");
const debugBox = document.getElementById("gps-debug");

let minimized = false;
if (toggleBtn && debugBox) {
  toggleBtn.addEventListener("click", () => {
    minimized = !minimized;
    debugBox.classList.toggle("minimized");
    toggleBtn.textContent = minimized ? "+" : "-";
  });
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function setDistance(text) {
  if (distanceEl) distanceEl.textContent = text;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseGpsAttribute(gps) {
  if (!gps) return null;
  if (typeof gps === "string") {
    const latMatch = gps.match(/latitude:\s*([-0-9.]+)/i);
    const lonMatch = gps.match(/longitude:\s*([-0-9.]+)/i);
    const lat = latMatch ? toNumber(latMatch[1]) : null;
    const lon = lonMatch ? toNumber(lonMatch[1]) : null;
    if (lat !== null && lon !== null) return { latitude: lat, longitude: lon };
    return null;
  }
  const lat = toNumber(gps.latitude);
  const lon = toNumber(gps.longitude);
  if (lat !== null && lon !== null) return { latitude: lat, longitude: lon };
  return null;
}

function haversineMeters(aLat, aLon, bLat, bLon) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// =============================
// DEVICE GEOLOCATION (BROWSER)
// =============================
let geoWatchId = null;
let lastDeviceCoords = null;

function startDeviceWatch() {
  if (!navigator.geolocation) {
    console.error("Geolocation not supported");
    setStatus("geolocation not supported");
    return;
  }

  if (geoWatchId !== null) return;

  setStatus("requesting permission");

  geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;

      if (devLatEl) devLatEl.textContent = latitude.toFixed(6);
      if (devLonEl) devLonEl.textContent = longitude.toFixed(6);
      lastDeviceCoords = { latitude, longitude };
      updateObjectVisibility();
      setStatus("ok");
    },
    (err) => {
      console.error("Geolocation error:", err);
      setStatus(`error: ${err.message}`);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 8000
    }
  );
}

// =============================
// OBJECT COORDS (AR.js ENTITY)
// =============================
const worldObject = document.getElementById("world-object");
const cameraEl = document.querySelector("[gps-camera]");
let objectCoords = null;
if (worldObject) {
  const gps = parseGpsAttribute(worldObject.getAttribute("gps-entity-place"));
  if (gps) {
    objectCoords = gps;
    if (objLatEl) objLatEl.textContent = gps.latitude.toFixed(6);
    if (objLonEl) objLonEl.textContent = gps.longitude.toFixed(6);
  }
  const pos = worldObject.getAttribute("position");
  if (pos && typeof pos.y === "number") {
    if (heightEl) heightEl.textContent = pos.y.toFixed(2);
  }
}

function setObjectHeight(heightMeters) {
  if (!worldObject) return;
  worldObject.setAttribute("position", `0 ${heightMeters} 0`);
  if (heightEl) heightEl.textContent = heightMeters.toFixed(2);
}

function updateObjectCoords(lat, lon) {
  if (!worldObject) return;
  objectCoords = { latitude: lat, longitude: lon };
  worldObject.setAttribute("gps-entity-place", `latitude: ${lat}; longitude: ${lon};`);
  if (objLatEl) objLatEl.textContent = lat.toFixed(6);
  if (objLonEl) objLonEl.textContent = lon.toFixed(6);
  updateObjectVisibility();
}

function updateObjectVisibility() {
  if (!worldObject || !lastDeviceCoords || !objectCoords) return;
  const dist = haversineMeters(
    lastDeviceCoords.latitude,
    lastDeviceCoords.longitude,
    objectCoords.latitude,
    objectCoords.longitude
  );
  setDistance(`Dist: ${dist.toFixed(1)} m`);
  worldObject.setAttribute("visible", dist <= 10);
}

if (applyTestBtn && testLatInput && testLonInput) {
  applyTestBtn.addEventListener("click", () => {
    const lat = toNumber(testLatInput.value);
    const lon = toNumber(testLonInput.value);
    if (lat === null || lon === null) {
      setStatus("invalid test coords");
      return;
    }
    updateObjectCoords(lat, lon);
  });
}

if (applyHeightBtn && testHeightInput) {
  applyHeightBtn.addEventListener("click", () => {
    if (lockGroundInput && lockGroundInput.checked) {
      setObjectHeight(0);
      return;
    }
    const h = toNumber(testHeightInput.value);
    if (h === null) {
      setStatus("invalid height");
      return;
    }
    setObjectHeight(h);
  });
}

if (lockGroundInput) {
  lockGroundInput.addEventListener("change", () => {
    if (lockGroundInput.checked) setObjectHeight(0);
  });
}

function metersToLatLonOffset(meters, bearingDeg, baseLat) {
  const R = 6371000;
  const bearing = (bearingDeg * Math.PI) / 180;
  const dLat = (meters * Math.cos(bearing)) / R;
  const dLon = (meters * Math.sin(bearing)) / (R * Math.cos((baseLat * Math.PI) / 180));
  return { dLat: (dLat * 180) / Math.PI, dLon: (dLon * 180) / Math.PI };
}

function resetObjectAhead() {
  if (!lastDeviceCoords) {
    setStatus("no device coords yet");
    return;
  }
  let bearing = 0;
  if (cameraEl) {
    const rot = cameraEl.getAttribute("rotation");
    if (rot && typeof rot.y === "number") bearing = rot.y;
  }
  const { dLat, dLon } = metersToLatLonOffset(2, bearing, lastDeviceCoords.latitude);
  updateObjectCoords(lastDeviceCoords.latitude + dLat, lastDeviceCoords.longitude + dLon);
}

if (resetAheadBtn) {
  resetAheadBtn.addEventListener("click", resetObjectAhead);
}

// =============================
// START AFTER USER GESTURE (iOS!)
// =============================
const startOnGesture = () => startDeviceWatch();
document.addEventListener("pointerdown", startOnGesture, { once: true, passive: true });
document.addEventListener("touchstart", startOnGesture, { once: true, passive: true });
document.addEventListener("click", startOnGesture, { once: true });
