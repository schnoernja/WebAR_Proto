
const latEl = document.getElementById("lat");
  const lonEl = document.getElementById("lon");
  const accEl = document.getElementById("acc");

  const debugBox = document.getElementById("gps-debug");
  const toggleBtn = document.getElementById("gps-toggle");

  let minimized = false;

  toggleBtn.addEventListener("click", () => {
    minimized = !minimized;
    debugBox.classList.toggle("minimized");
    toggleBtn.textContent = minimized ? "+" : "−";
  });

  if ("geolocation" in navigator) {
    navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;

        latEl.textContent = latitude.toFixed(6);
        lonEl.textContent = longitude.toFixed(6);
        accEl.textContent = accuracy.toFixed(1);
      },
      (error) => {
        console.error("GPS error:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    );
  } else {
    alert("Geolocation wird von diesem Browser nicht unterstützt.");
  }