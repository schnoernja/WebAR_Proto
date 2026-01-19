console.log("gps-debug.js LOADED");

const devLatEl = document.getElementById("dev-lat");
const devLonEl = document.getElementById("dev-lon");
const devAltEl = document.getElementById("dev-alt");
const devAltAccEl = document.getElementById("dev-alt-acc");
const deviceHeadingEl = document.getElementById("device-heading");
const objLatEl = document.getElementById("obj-lat");
const objLonEl = document.getElementById("obj-lon");
const statusEl = document.getElementById("gps-status");
const distanceEl = document.getElementById("obj-distance");
const webxrDistanceEl = document.getElementById("webxr-distance");
const webxrBearingEl = document.getElementById("webxr-bearing");
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
const scaleXInput = document.getElementById("scale-x");
const scaleYInput = document.getElementById("scale-y");
const scaleZInput = document.getElementById("scale-z");
const applyScaleBtn = document.getElementById("apply-scale");
const resetScaleBtn = document.getElementById("reset-scale");
const rotXInput = document.getElementById("rot-x");
const rotYInput = document.getElementById("rot-y");
const rotZInput = document.getElementById("rot-z");
const offXInput = document.getElementById("off-x");
const offYInput = document.getElementById("off-y");
const offZInput = document.getElementById("off-z");
const applyTransformBtn = document.getElementById("apply-transform");
const resetTransformBtn = document.getElementById("reset-transform");

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

function hasGpsComponent() {
  return window.AFRAME && window.AFRAME.components && window.AFRAME.components["gps-entity-place"];
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

function bearingDeg(aLat, aLon, bLat, bLon) {
  const toRad = (v) => (v * Math.PI) / 180;
  const toDeg = (v) => (v * 180) / Math.PI;
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const dLon = toRad(bLon - aLon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
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
const HEIGHT_FETCH_DISTANCE_M = 5;
let modelHeightM = 0;
let loggedHeightPlacement = false;
let deviceAltitudeM = null;
let smoothedDeviceCoords = null;
let smoothedHeadingDeg = null;
let modelGroundHeightM = null;
const modelGroundCache = new Map();
const COORD_SMOOTHING_ALPHA = 0.2;
const HEADING_SMOOTHING_ALPHA = 0.2;

function isWebXRActive() {
  return sceneEl && sceneEl.is && sceneEl.is("vr-mode");
}

function smoothCoord(prev, next, alpha) {
  if (!prev) return { ...next };
  return {
    latitude: prev.latitude + (next.latitude - prev.latitude) * alpha,
    longitude: prev.longitude + (next.longitude - prev.longitude) * alpha
  };
}

function smoothAngleDeg(prev, next, alpha) {
  if (prev === null || prev === undefined) return next;
  const delta = ((next - prev + 540) % 360) - 180;
  return (prev + delta * alpha + 360) % 360;
}

function handleDeviceOrientation(evt) {
  if (!evt || typeof evt.alpha !== "number") return;
  // Convert alpha (clockwise from north) to compass heading.
  const heading = (360 - evt.alpha) % 360;
  smoothedHeadingDeg = smoothAngleDeg(smoothedHeadingDeg, heading, HEADING_SMOOTHING_ALPHA);
  if (deviceHeadingEl) {
    deviceHeadingEl.textContent = smoothedHeadingDeg.toFixed(1);
  }
  updateWebXRPlacement();
}

function startHeadingWatch() {
  if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") return;
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission().then((permission) => {
      if (permission === "granted") {
        window.addEventListener("deviceorientation", handleDeviceOrientation, true);
      }
    }).catch(() => {
      // Ignore permission errors; heading will rely on geolocation if available.
    });
    return;
  }
  window.addEventListener("deviceorientationabsolute", handleDeviceOrientation, true);
  window.addEventListener("deviceorientation", handleDeviceOrientation, true);
}

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
      const { latitude, longitude, altitude, altitudeAccuracy, heading } = pos.coords;

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
      smoothedDeviceCoords = smoothCoord(smoothedDeviceCoords, lastDeviceCoords, COORD_SMOOTHING_ALPHA);
      if (Number.isFinite(heading)) {
        smoothedHeadingDeg = smoothAngleDeg(smoothedHeadingDeg, heading, HEADING_SMOOTHING_ALPHA);
      }
      if (deviceHeadingEl && Number.isFinite(smoothedHeadingDeg)) {
        deviceHeadingEl.textContent = smoothedHeadingDeg.toFixed(1);
      }
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
const modelEntity = document.getElementById("model-entity");
const cameraEl = document.querySelector("[gps-camera]");
const xrCameraEl = document.getElementById("camera") || document.querySelector("[camera]");
const sceneEl = document.querySelector("a-scene");
let objectCoords = null;
if (modelEntity) {
  modelEntity.addEventListener("model-loaded", () => {
    console.log("Model loaded:", modelEntity.getAttribute("gltf-model"));
  });
  modelEntity.addEventListener("model-error", (evt) => {
    console.error("Model error:", evt);
    setStatus("model load error");
  });
} else if (worldObject) {
  worldObject.addEventListener("model-loaded", () => {
    console.log("Model loaded:", worldObject.getAttribute("gltf-model"));
  });
  worldObject.addEventListener("model-error", (evt) => {
    console.error("Model error:", evt);
    setStatus("model load error");
  });
}
if (sceneEl) {
  sceneEl.addEventListener("enter-vr", () => {
    updateWebXRPlacement();
  });
}
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
  const offset = getOffsetValues();
  worldObject.setAttribute("position", `0 ${heightMeters} 0`);
  if (modelEntity) {
    modelEntity.setAttribute("position", `${offset.x} ${offset.y} ${offset.z}`);
  }
  if (heightEl) heightEl.textContent = heightMeters.toFixed(2);
}

function getDeviceCoordsForPlacement() {
  return smoothedDeviceCoords || lastDeviceCoords;
}

function computeWebXRHeight() {
  const base = (lockGroundInput && lockGroundInput.checked) ? 0 : modelHeightM;
  const offset = altOffsetInput ? (toNumber(altOffsetInput.value) ?? 0) : 0;
  if (currentGroundHeightM !== null && modelGroundHeightM !== null) {
    return (modelGroundHeightM - currentGroundHeightM) + base + offset;
  }
  return base + offset;
}

function updateWebXRPlacement() {
  if (!isWebXRActive() || !xrCameraEl || !worldObject || !objectCoords || !window.THREE) return;
  const deviceCoords = getDeviceCoordsForPlacement();
  if (!deviceCoords) return;

  const dist = haversineMeters(
    deviceCoords.latitude,
    deviceCoords.longitude,
    objectCoords.latitude,
    objectCoords.longitude
  );
  const bearing = bearingDeg(
    deviceCoords.latitude,
    deviceCoords.longitude,
    objectCoords.latitude,
    objectCoords.longitude
  );
  if (webxrDistanceEl) webxrDistanceEl.textContent = dist.toFixed(1);
  if (webxrBearingEl) webxrBearingEl.textContent = bearing.toFixed(1);
  const heading = Number.isFinite(smoothedHeadingDeg) ? smoothedHeadingDeg : 0;
  const relativeBearing = (bearing - heading + 360) % 360;
  const rad = (relativeBearing * Math.PI) / 180;
  const x = Math.sin(rad) * dist;
  const z = -Math.cos(rad) * dist;
  const y = computeWebXRHeight();

  const camObj = xrCameraEl.object3D;
  if (!camObj) return;
  const worldPos = new THREE.Vector3();
  const offset = new THREE.Vector3(x, y, z);
  camObj.getWorldPosition(worldPos);
  offset.applyQuaternion(camObj.quaternion);
  worldObject.object3D.position.copy(worldPos.add(offset));
}

function applyGroundHeight() {
  if (isWebXRActive()) {
    const finalY = computeWebXRHeight();
    if (heightEl) heightEl.textContent = finalY.toFixed(2);
    updateWebXRPlacement();
    return;
  }

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
  if (hasGpsComponent()) {
    worldObject.setAttribute("gps-entity-place", `latitude: ${lat}; longitude: ${lon};`);
  }
  if (objLatEl) objLatEl.textContent = lat.toFixed(6);
  if (objLonEl) objLonEl.textContent = lon.toFixed(6);
  updateObjectVisibility();
  updateWebXRPlacement();
}

function applyModelData(model) {
  if (!model || !worldObject) return;
  const lat = toNumber(model.lat);
  const lon = toNumber(model.lon);
  const height = toNumber(model.height_m);

  if (typeof model.url === "string" && model.url.length > 0) {
    if (modelEntity) {
      modelEntity.setAttribute("gltf-model", model.url);
    } else {
      worldObject.setAttribute("gltf-model", model.url);
    }
  }
  if (lat !== null && lon !== null) {
    updateObjectCoords(lat, lon);
    if (testLatInput) testLatInput.value = lat;
    if (testLonInput) testLonInput.value = lon;
  }
  modelHeightM = (height !== null) ? height : 0;
  if (testHeightInput) testHeightInput.value = modelHeightM;
  applyScaleForModel(model);
  applyGroundHeight();
  updateModelGroundHeight(model).then(() => {
    applyGroundHeight();
    updateWebXRPlacement();
  });
}

function updateObjectVisibility() {
  const deviceCoords = getDeviceCoordsForPlacement();
  if (!worldObject || !deviceCoords || !objectCoords) return;
  const dist = haversineMeters(
    deviceCoords.latitude,
    deviceCoords.longitude,
    objectCoords.latitude,
    objectCoords.longitude
  );
  setDistance(`Dist: ${dist.toFixed(1)} m`);
  worldObject.setAttribute("visible", dist <= 100);
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

async function updateModelGroundHeight(model) {
  const lat = toNumber(model.lat);
  const lon = toNumber(model.lon);
  if (lat === null || lon === null) {
    modelGroundHeightM = null;
    return;
  }
  const key = getModelKey(model);
  const cached = modelGroundCache.get(key);
  if (cached && cached.lat === lat && cached.lon === lon) {
    modelGroundHeightM = cached.height;
    return;
  }
  const data = await fetchGroundHeight(lat, lon);
  if (!data) {
    modelGroundHeightM = null;
    return;
  }
  modelGroundHeightM = data.height_m;
  modelGroundCache.set(key, { lat, lon, height: data.height_m, tile_key: data.tile_key });
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

if (applyScaleBtn) {
  applyScaleBtn.addEventListener("click", () => {
    const model = getActiveModel();
    const key = getModelKey(model);
    const scale = readScaleInputs();
    scaleByModelKey.set(key, scale);
    applyScaleValues(scale);
  });
}

if (resetScaleBtn) {
  resetScaleBtn.addEventListener("click", () => {
    const model = getActiveModel();
    const key = getModelKey(model);
    const scale = { x: 1, y: 1, z: 1 };
    scaleByModelKey.set(key, scale);
    setScaleInputs(scale);
    applyScaleValues(scale);
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

function getOffsetValues() {
  const x = offXInput ? (toNumber(offXInput.value) ?? 0) : 0;
  const y = offYInput ? (toNumber(offYInput.value) ?? 0) : 0;
  const z = offZInput ? (toNumber(offZInput.value) ?? 0) : 0;
  return { x, y, z };
}

function getRotationValues() {
  const x = rotXInput ? (toNumber(rotXInput.value) ?? 0) : 0;
  const y = rotYInput ? (toNumber(rotYInput.value) ?? 0) : 0;
  const z = rotZInput ? (toNumber(rotZInput.value) ?? 0) : 0;
  return { x, y, z };
}

function applyModelTransform() {
  if (!worldObject) return;
  const rot = getRotationValues();
  const offset = getOffsetValues();
  const target = modelEntity || worldObject;
  target.setAttribute("rotation", `${rot.x} ${rot.y} ${rot.z}`);
  if (modelEntity) {
    modelEntity.setAttribute("position", `${offset.x} ${offset.y} ${offset.z}`);
  } else {
    const current = worldObject.getAttribute("position") || { x: 0, y: 0, z: 0 };
    worldObject.setAttribute("position", `${offset.x} ${current.y} ${offset.z}`);
  }
}

function resetModelTransform() {
  if (rotXInput) rotXInput.value = "0";
  if (rotYInput) rotYInput.value = "0";
  if (rotZInput) rotZInput.value = "0";
  if (offXInput) offXInput.value = "0";
  if (offYInput) offYInput.value = "0";
  if (offZInput) offZInput.value = "0";
  applyModelTransform();
}

if (applyTransformBtn) {
  applyTransformBtn.addEventListener("click", () => {
    applyModelTransform();
  });
}

if (resetTransformBtn) {
  resetTransformBtn.addEventListener("click", () => {
    resetModelTransform();
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
const scaleByModelKey = new Map();

function getModelKey(model) {
  if (!model) return "default";
  if (typeof model.url === "string" && model.url.length > 0) return model.url;
  if (typeof model.name === "string" && model.name.length > 0) return model.name;
  return "default";
}

function getActiveModel() {
  if (!loadedModels.length) return null;
  return loadedModels[activeModelIndex] || null;
}

function readScaleInputs() {
  const x = scaleXInput ? (toNumber(scaleXInput.value) ?? 1) : 1;
  const y = scaleYInput ? (toNumber(scaleYInput.value) ?? 1) : 1;
  const z = scaleZInput ? (toNumber(scaleZInput.value) ?? 1) : 1;
  return { x, y, z };
}

function setScaleInputs(scale) {
  if (scaleXInput) scaleXInput.value = String(scale.x);
  if (scaleYInput) scaleYInput.value = String(scale.y);
  if (scaleZInput) scaleZInput.value = String(scale.z);
}

function applyScaleValues(scale) {
  const target = modelEntity || worldObject;
  if (!target) return;
  target.setAttribute("scale", `${scale.x} ${scale.y} ${scale.z}`);
}

function applyScaleForModel(model) {
  const key = getModelKey(model);
  const scale = scaleByModelKey.get(key) || { x: 1, y: 1, z: 1 };
  setScaleInputs(scale);
  applyScaleValues(scale);
}

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
// GPS watch is used for both AR.js and WebXR placement.
const startOnGesture = () => {
  startDeviceWatch();
  startHeadingWatch();
};
document.addEventListener("pointerdown", startOnGesture, { once: true, passive: true });
document.addEventListener("touchstart", startOnGesture, { once: true, passive: true });
document.addEventListener("click", startOnGesture, { once: true });
