console.log("webxr.js LOADED");

const sceneEl = document.querySelector("a-scene");
const cameraEl = document.getElementById("camera") || document.querySelector("[camera]");
const statusEl = document.getElementById("gps-status");

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

async function supportsWebXR() {
  if (!navigator.xr || !navigator.xr.isSessionSupported) return false;
  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

function enableWebXR() {
  if (!sceneEl) return;
  sceneEl.setAttribute("webxr", "optionalFeatures: local-floor");
  sceneEl.setAttribute("xr-mode-ui", "enabled: true");
  sceneEl.removeAttribute("arjs");
  if (cameraEl) {
    cameraEl.removeAttribute("gps-camera");
    cameraEl.removeAttribute("rotation-reader");
  }
}

function enableArjsFallback() {
  if (!sceneEl) return;
  sceneEl.setAttribute("arjs", "sourceType: webcam; debugUIEnabled: false;");
  sceneEl.setAttribute("xr-mode-ui", "enabled: false");
  sceneEl.removeAttribute("webxr");
  if (cameraEl) {
    cameraEl.setAttribute("gps-camera", "");
    cameraEl.setAttribute("rotation-reader", "");
  }
}

async function initXRMode() {
  const canWebXR = await supportsWebXR();
  if (canWebXR) {
    console.log("WebXR supported, enabling immersive AR.");
    enableWebXR();
    setStatus("webxr ready");
  } else {
    console.warn("WebXR not supported, falling back to AR.js.");
    enableArjsFallback();
    setStatus("webxr unsupported, using ar.js");
  }
}

if (sceneEl) {
  if (sceneEl.hasLoaded) {
    initXRMode();
  } else {
    sceneEl.addEventListener("loaded", () => initXRMode(), { once: true });
  }
  sceneEl.addEventListener("enter-vr", () => {
    window.webarWebXRActive = true;
    setStatus("webxr active");
  });
  sceneEl.addEventListener("exit-vr", () => {
    window.webarWebXRActive = false;
    setStatus("webxr exited");
  });
}
