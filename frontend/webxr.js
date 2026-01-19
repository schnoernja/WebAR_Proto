console.log("webxr.js LOADED");

const sceneEl = document.querySelector("a-scene");
if (sceneEl) {
  sceneEl.addEventListener("enter-vr", () => {
    window.webarWebXRActive = true;
  });
  sceneEl.addEventListener("exit-vr", () => {
    window.webarWebXRActive = false;
  });
}
