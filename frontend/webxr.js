import { ARApp } from "./ar/App.js?v=surface-dwell-20260905";

const app = new ARApp();

app.init().catch((error) => {
  const statusMessage = document.getElementById("status-message");
  if (statusMessage) {
    const message = error instanceof Error ? error.message : "Unbekannter Initialisierungsfehler";
    statusMessage.textContent = `Initialisierung fehlgeschlagen: ${message}`;
  }
  console.error("AR app init failed:", error);
});

window.addEventListener("beforeunload", () => {
  app.dispose();
});
