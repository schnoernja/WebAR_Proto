import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { ARButton } from "https://unpkg.com/three@0.160.0/examples/jsm/webxr/ARButton.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const devLatEl = document.getElementById("dev-lat");
const devLonEl = document.getElementById("dev-lon");
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
    groundHeightEl.textContent = value === null ? "-" : value.toFixed(2);
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

function metersToLatLonOffset(meters, bearingDeg, baseLat) {
  const R = 6371000;
  const bearing = (bearingDeg * Math.PI) / 180;
  const dLat = (meters * Math.cos(bearing)) / R;
  const dLon = (meters * Math.sin(bearing)) / (R * Math.cos((baseLat * Math.PI) / 180));
  return { dLat: (dLat * 180) / Math.PI, dLon: (dLon * 180) / Math.PI };
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.01,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
scene.add(light);

const modelGroup = new THREE.Group();
scene.add(modelGroup);

const loader = new GLTFLoader();
let currentModel = null;
let currentModelUrl = null;

let geoWatchId = null;
let lastDeviceCoords = null;
let currentGroundHeightM = null;
let currentGroundTileKey = null;
let lastHeightFetchCoords = null;
const heightCache = new Map();
const HEIGHT_FETCH_DISTANCE_M = 30;
let modelHeightM = 0;
let loggedHeightPlacement = false;

const defaultObjectCoords = { latitude: 50.989135, longitude: 11.022858 };
let objectCoords = { ...defaultObjectCoords };

if (objLatEl && objLonEl) {
  const lat = toNumber(objLatEl.textContent);
  const lon = toNumber(objLonEl.textContent);
  if (lat !== null && lon !== null) {
    objectCoords = { latitude: lat, longitude: lon };
  }
}

function updateObjectCoords(lat, lon) {
  objectCoords = { latitude: lat, longitude: lon };
  if (objLatEl) objLatEl.textContent = lat.toFixed(6);
  if (objLonEl) objLonEl.textContent = lon.toFixed(6);
  updateObjectVisibility();
  updateObjectPlacement();
}

function updateObjectPlacement() {
  if (!lastDeviceCoords || !objectCoords) return;
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(objectCoords.latitude - lastDeviceCoords.latitude);
  const dLon = toRad(objectCoords.longitude - lastDeviceCoords.longitude);
  const latRad = toRad(lastDeviceCoords.latitude);
  const north = dLat * R;
  const east = dLon * R * Math.cos(latRad);
  const ground = currentGroundHeightM !== null ? currentGroundHeightM : 0;
  const base = lockGroundInput && lockGroundInput.checked ? 0 : modelHeightM;
  const finalY = ground + base;
  modelGroup.position.set(east, finalY, -north);
  if (heightEl) heightEl.textContent = finalY.toFixed(2);
}

function updateObjectVisibility() {
  if (!lastDeviceCoords || !objectCoords) return;
  const dist = haversineMeters(
    lastDeviceCoords.latitude,
    lastDeviceCoords.longitude,
    objectCoords.latitude,
    objectCoords.longitude
  );
  setDistance(`Dist: ${dist.toFixed(1)} m`);
  modelGroup.visible = dist <= 10;
}

function applyGroundHeight() {
  const ground = currentGroundHeightM !== null ? currentGroundHeightM : 0;
  const base = lockGroundInput && lockGroundInput.checked ? 0 : modelHeightM;
  const finalY = ground + base;
  modelGroup.position.y = finalY;
  if (heightEl) heightEl.textContent = finalY.toFixed(2);
  if (!loggedHeightPlacement) {
    console.log("Height placement:", {
      ground,
      modelHeightM: base,
      finalY
    });
    loggedHeightPlacement = true;
  }
  updateObjectPlacement();
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
      maybeUpdateGroundHeight(latitude, longitude);
      updateObjectVisibility();
      updateObjectPlacement();
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

async function loadModel(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

function clearModel() {
  if (currentModel) {
    modelGroup.remove(currentModel);
    currentModel = null;
  }
}

async function applyModelData(model) {
  if (!model) return;
  const lat = toNumber(model.lat);
  const lon = toNumber(model.lon);
  const height = toNumber(model.height_m);

  if (typeof model.url === "string" && model.url.length > 0 && model.url !== currentModelUrl) {
    try {
      setStatus("loading model");
      clearModel();
      currentModel = await loadModel(model.url);
      modelGroup.add(currentModel);
      currentModelUrl = model.url;
    } catch (err) {
      console.error("Model load error:", err);
      setStatus("model load failed");
    }
  }

  if (lat !== null && lon !== null) {
    updateObjectCoords(lat, lon);
    if (testLatInput) testLatInput.value = lat;
    if (testLonInput) testLonInput.value = lon;
  }

  modelHeightM = height !== null ? height : 0;
  if (testHeightInput) testHeightInput.value = modelHeightM;
  applyGroundHeight();
  setStatus("model loaded");
}

let scaleToggleState = false;
function applyScale() {
  const scale = scaleToggleState ? 2 : 1;
  modelGroup.scale.set(scale, scale, scale);
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

function resetObjectAhead() {
  if (!lastDeviceCoords) {
    setStatus("no device coords yet");
    return;
  }
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  if (dir.lengthSq() < 1e-6) {
    setStatus("no heading yet");
    return;
  }
  dir.normalize();
  const east = dir.x;
  const north = -dir.z;
  const bearingRad = Math.atan2(east, north);
  const bearingDeg = ((bearingRad * 180) / Math.PI + 360) % 360;
  const { dLat, dLon } = metersToLatLonOffset(2, bearingDeg, lastDeviceCoords.latitude);
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
  } catch (err) {
    console.error("Model load error:", err);
    setStatus("model load failed");
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", onWindowResize);

const arButton = ARButton.createButton(renderer, {
  optionalFeatures: ["dom-overlay"],
  domOverlay: { root: document.body }
});

document.body.appendChild(arButton);

renderer.setAnimationLoop(() => {
  modelGroup.lookAt(camera.position.x, modelGroup.position.y, camera.position.z);
  renderer.render(scene, camera);
});

loadModels();

const startOnGesture = () => startDeviceWatch();
document.addEventListener("pointerdown", startOnGesture, { once: true, passive: true });
document.addEventListener("touchstart", startOnGesture, { once: true, passive: true });
document.addEventListener("click", startOnGesture, { once: true });
