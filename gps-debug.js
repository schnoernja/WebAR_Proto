// -----------------------------
// Debug Elemente
// -----------------------------
const devLatEl = document.getElementById("dev-lat");
const devLonEl = document.getElementById("dev-lon");

const objLatEl = document.getElementById("obj-lat");
const objLonEl = document.getElementById("obj-lon");

const debugBox = document.getElementById("gps-debug");
const toggleBtn = document.getElementById("gps-toggle");

let minimized = false;
toggleBtn.addEventListener("click", () => {
  minimized = !minimized;
  debugBox.classList.toggle("minimized");
  toggleBtn.textContent = minimized ? "+" : "−";
});

// -----------------------------
// DEVICE POSITION (AR.js)
// -----------------------------
const camera = document.querySelector("[gps-camera]");

if (camera) {
  camera.addEventListener("gps-camera-update-position", (e) => {
    const { latitude, longitude } = e.detail.position;
    devLatEl.textContent = latitude.toFixed(6);
    devLonEl.textContent = longitude.toFixed(6);
  });

  camera.addEventListener("gps-camera-error", (e) => {
    console.error("GPS Camera Error:", e.detail);
  });
}

// -----------------------------
// OBJECT POSITION (STATIC)
// -----------------------------
const worldObject = document.getElementById("world-object");

if (worldObject) {
  const gpsAttr = worldObject.getAttribute("gps-entity-place");

  if (gpsAttr) {
    objLatEl.textContent = Number(gpsAttr.latitude).toFixed(6);
    objLonEl.textContent = Number(gpsAttr.longitude).toFixed(6);
  }
}
