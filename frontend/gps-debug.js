console.log("gps-debug.js LOADED");

const devLatEl = document.getElementById("dev-lat");
const devLonEl = document.getElementById("dev-lon");
const devAltEl = document.getElementById("dev-alt");
const devAltAccEl = document.getElementById("dev-alt-acc");
const objLatEl = document.getElementById("obj-lat");
const objLonEl = document.getElementById("obj-lon");
const statusEl = document.getElementById("gps-status");
const distanceEl = document.getElementById("obj-distance");
const groundHeightEl = document.getElementById("ground-height");
const groundTileEl = document.getElementById("ground-tile");
const testLatInput = document.getElementById("test-lat");
const testLonInput = document.getElementById("test-lon");
const applyTestBtn = document.getElementById("apply-test-coords");
const heightEl = document.getElementById("obj-height");
const testHeightInput = document.getElementById("test-height");
const applyHeightBtn = document.getElementById("apply-height");
const resetAheadBtn = document.getElementById("reset-ahead");
const lockGroundInput = document.getElementById("lock-ground");
const useDeviceAltInput = document.getElementById("use-device-alt");
const altOffsetInput = document.getElementById("alt-offset");
const toggleModelBtn = document.getElementById("toggle-model");
const toggleScaleBtn = document.getElementById("toggle-scale");

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

function setGroundHeight(value) {
  if (groundHeightEl) {
    groundHeightEl.textContent = (value === null) ? "-" : value.toFixed(2);
  }
}

function setGroundTile(value) {
  if (groundTileEl) {
    groundTileEl.textContent = value || "-";
  }
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
let currentGroundHeightM = null;
let currentGroundTileKey = null;
let lastHeightFetchCoords = null;
const heightCache = new Map();
const HEIGHT_FETCH_DISTANCE_M = 30;
let modelHeightM = 0;
let loggedHeightPlacement = false;
let deviceAltitudeM = null;

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
      const { latitude, longitude, altitude, altitudeAccuracy } = pos.coords;

      if (devLatEl) devLatEl.textContent = latitude.toFixed(6);
      if (devLonEl) devLonEl.textContent = longitude.toFixed(6);
      if (Number.isFinite(altitude)) {
        deviceAltitudeM = altitude;
        if (devAltEl) devAltEl.textContent = altitude.toFixed(2);
      } else {
        deviceAltitudeM = null;
        if (devAltEl) devAltEl.textContent = "-";
      }
      if (Number.isFinite(altitudeAccuracy)) {
        if (devAltAccEl) devAltAccEl.textContent = altitudeAccuracy.toFixed(1);
      } else if (devAltAccEl) {
        devAltAccEl.textContent = "-";
      }
      lastDeviceCoords = { latitude, longitude };
      maybeUpdateGroundHeight(latitude, longitude);
      applyGroundHeight();
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

function applyGroundHeight() {
  const ground = (currentGroundHeightM !== null) ? currentGroundHeightM : 0;
  const base = (lockGroundInput && lockGroundInput.checked) ? 0 : modelHeightM;
  const useDeviceAlt = useDeviceAltInput && useDeviceAltInput.checked && deviceAltitudeM !== null;
  const offset = altOffsetInput ? (toNumber(altOffsetInput.value) ?? 0) : 0;
  const device = useDeviceAlt ? deviceAltitudeM : 0;
  const finalY = (ground - device) + base + offset;
  setObjectHeight(finalY);
  if (!loggedHeightPlacement) {
    console.log("Height placement:", {
      ground,
      device,
      offset,
      modelHeightM: base,
      finalY
    });
    loggedHeightPlacement = true;
  }
}

function updateObjectCoords(lat, lon) {
  if (!worldObject) return;
  objectCoords = { latitude: lat, longitude: lon };
  worldObject.setAttribute("gps-entity-place", `latitude: ${lat}; longitude: ${lon};`);
  if (objLatEl) objLatEl.textContent = lat.toFixed(6);
  if (objLonEl) objLonEl.textContent = lon.toFixed(6);
  updateObjectVisibility();
}

function applyModelData(model) {
  if (!model || !worldObject) return;
  const lat = toNumber(model.lat);
  const lon = toNumber(model.lon);
  const height = toNumber(model.height_m);

  if (typeof model.url === "string" && model.url.length > 0) {
    worldObject.setAttribute("gltf-model", model.url);
  }
  if (lat !== null && lon !== null) {
    updateObjectCoords(lat, lon);
    if (testLatInput) testLatInput.value = lat;
    if (testLonInput) testLonInput.value = lon;
  }
  modelHeightM = (height !== null) ? height : 0;
  if (testHeightInput) testHeightInput.value = modelHeightM;
  applyGroundHeight();
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

async function fetchGroundHeight(lat, lon) {
  const res = await fetch(`/api/height.php?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, { cache: "no-store" });
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  if (data && typeof data.height_m === "number" && data.tile_key) {
    return data;
  }
  return null;
}

async function maybeUpdateGroundHeight(lat, lon) {
  if (lastHeightFetchCoords) {
    const moved = haversineMeters(
      lastHeightFetchCoords.latitude,
      lastHeightFetchCoords.longitude,
      lat,
      lon
    );
    if (moved < HEIGHT_FETCH_DISTANCE_M && currentGroundTileKey) {
      return;
    }
  }

  const data = await fetchGroundHeight(lat, lon);
  if (!data) {
    setGroundHeight(null);
    setGroundTile(null);
    return;
  }

  const cached = heightCache.get(data.tile_key);
  if (!cached) {
    heightCache.set(data.tile_key, data.height_m);
  }

  currentGroundHeightM = data.height_m;
  currentGroundTileKey = data.tile_key;
  lastHeightFetchCoords = { latitude: lat, longitude: lon };

  setGroundHeight(currentGroundHeightM);
  setGroundTile(currentGroundTileKey);
  applyGroundHeight();
}

let scaleToggleState = false;
function applyScale() {
  if (!worldObject) return;
  const scale = scaleToggleState ? 2 : 1;
  worldObject.setAttribute("scale", `${scale} ${scale} ${scale}`);
}

if (toggleScaleBtn) {
  toggleScaleBtn.addEventListener("click", () => {
    scaleToggleState = !scaleToggleState;
    applyScale();
  });
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
      applyGroundHeight();
      return;
    }
    const h = toNumber(testHeightInput.value);
    if (h === null) {
      setStatus("invalid height");
      return;
    }
    modelHeightM = h;
    applyGroundHeight();
  });
}

if (lockGroundInput) {
  lockGroundInput.addEventListener("change", () => {
    applyGroundHeight();
  });
}

if (useDeviceAltInput) {
  useDeviceAltInput.addEventListener("change", () => {
    applyGroundHeight();
  });
}

if (altOffsetInput) {
  altOffsetInput.addEventListener("input", () => {
    applyGroundHeight();
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

let loadedModels = [];
let activeModelIndex = 0;

function applyActiveModel() {
  if (!loadedModels.length) return;
  activeModelIndex = ((activeModelIndex % loadedModels.length) + loadedModels.length) % loadedModels.length;
  applyModelData(loadedModels[activeModelIndex]);
}

if (toggleModelBtn) {
  toggleModelBtn.addEventListener("click", () => {
    if (!loadedModels.length) return;
    activeModelIndex = (activeModelIndex + 1) % loadedModels.length;
    applyActiveModel();
  });
}

async function loadModels() {
  try {
    setStatus("loading models");
    const res = await fetch("/api/models.php", { cache: "no-store" });
    if (!res.ok) {
      setStatus(`models error: ${res.status}`);
      return;
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      setStatus("no models in db");
      return;
    }
    loadedModels = data;
    activeModelIndex = 0;
    applyActiveModel();
    setStatus("model loaded");
  } catch (err) {
    console.error("Model load error:", err);
    setStatus("model load failed");
  }
}

loadModels();

// =============================
// START AFTER USER GESTURE (iOS!)
// =============================
const startOnGesture = () => startDeviceWatch();
document.addEventListener("pointerdown", startOnGesture, { once: true, passive: true });
document.addEventListener("touchstart", startOnGesture, { once: true, passive: true });
document.addEventListener("click", startOnGesture, { once: true });
