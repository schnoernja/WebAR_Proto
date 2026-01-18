const devLatEl = document.getElementById("dev-lat");
const devLonEl = document.getElementById("dev-lon");
const objLatEl = document.getElementById("obj-lat");
const objLonEl = document.getElementById("obj-lon");

const toggleBtn = document.getElementById("gps-toggle");
const debugBox = document.getElementById("gps-debug");

let minimized = false;
toggleBtn.addEventListener("click", () => {
  minimized = !minimized;
  debugBox.classList.toggle("minimized");
  toggleBtn.textContent = minimized ? "+" : "−";
});

// =============================
// DEVICE GEOLOCATION (BROWSER)
// =============================
function startDeviceWatch() {
  if (!navigator.geolocation) {
    console.error("Geolocation not supported");
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;

      devLatEl.textContent = latitude.toFixed(6);
      devLonEl.textContent = longitude.toFixed(6);
    },
    (err) => {
      console.error("Geolocation error:", err);
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
if (worldObject) {
  const gps = worldObject.getAttribute("gps-entity-place");
  if (gps) {
    objLatEl.textContent = Number(gps.latitude).toFixed(6);
    objLonEl.textContent = Number(gps.longitude).toFixed(6);
  }
}

// =============================
// START AFTER USER GESTURE (iOS!)
// =============================
window.addEventListener("click", () => {
  startDeviceWatch();
}, { once: true });