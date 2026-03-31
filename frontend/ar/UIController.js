export class UIController {
  constructor(documentRef = document) {
    this.document = documentRef;
    this.messageEl = this.document.getElementById("status-message");
    this.hintEl = this.document.getElementById("interaction-hint");
    this.assetNameEl = this.document.getElementById("asset-name");

    this.startButton = this.document.getElementById("start-ar-button");
    this.placeButton = this.document.getElementById("place-button");
    this.resetButton = this.document.getElementById("reset-button");
    this.stopButton = this.document.getElementById("stop-ar-button");

    this.stateRefs = {
      support: this.getStateRef("support"),
      session: this.getStateRef("session"),
      tracking: this.getStateRef("tracking"),
      surface: this.getStateRef("surface"),
      stability: this.getStateRef("stability"),
      placement: this.getStateRef("placement")
    };

    this.uiState = {
      supportAvailable: false,
      sessionActive: false,
      stableSurface: false,
      placed: false
    };

    this.cleanupCallbacks = [];
  }

  getStateRef(key) {
    return {
      item: this.document.querySelector(`[data-state="${key}"]`),
      value: this.document.getElementById(`state-${key}`)
    };
  }

  bindActions({ onStartAR, onPlace, onResetPlacement, onStopAR }) {
    this.bindButton(this.startButton, onStartAR);
    this.bindButton(this.placeButton, onPlace);
    this.bindButton(this.resetButton, onResetPlacement);
    this.bindButton(this.stopButton, onStopAR);
    this.refreshButtons();
  }

  bindButton(button, handler) {
    if (!button || typeof handler !== "function") {
      return;
    }

    button.addEventListener("click", handler);
    this.cleanupCallbacks.push(() => button.removeEventListener("click", handler));
  }

  setAssetLabel(label) {
    if (this.assetNameEl) {
      this.assetNameEl.textContent = label;
    }
  }

  setMessage(message) {
    if (this.messageEl) {
      this.messageEl.textContent = message;
    }
  }

  setHint(message) {
    if (this.hintEl) {
      this.hintEl.textContent = message;
    }
  }

  setSupportState(available, detail) {
    this.uiState.supportAvailable = available;
    this.setState("support", available ? "Verfuegbar" : "Nicht verfuegbar", available ? "ok" : "error");
    if (detail) {
      this.setMessage(detail);
    }
    this.refreshButtons();
  }

  setSessionState(active, detail) {
    this.uiState.sessionActive = active;
    this.setState("session", active ? "Ja" : "Nein", active ? "active" : "idle");
    this.document.body.classList.toggle("ar-active", active);
    if (detail) {
      this.setMessage(detail);
    }
    this.refreshButtons();
  }

  setTrackingState(active) {
    this.setState("tracking", active ? "Laeuft" : "Wartet", active ? "ok" : "idle");
  }

  setSurfaceState(detected, stable) {
    this.uiState.stableSurface = detected && stable;
    this.setState("surface", detected ? "Erkannt" : "Suche", detected ? "warning" : "idle");
    this.setState(
      "stability",
      stable ? "Stabil" : detected ? "Pruefung" : "Wartet",
      stable ? "ok" : detected ? "warning" : "idle"
    );
    this.refreshButtons();
  }

  setPlacementState(placed) {
    this.uiState.placed = placed;
    this.setState("placement", placed ? "Platziert" : "Nicht platziert", placed ? "done" : "idle");
    this.refreshButtons();
  }

  setState(key, text, status) {
    const ref = this.stateRefs[key];
    if (!ref) {
      return;
    }

    if (ref.value) {
      ref.value.textContent = text;
    }

    if (ref.item) {
      ref.item.dataset.status = status;
    }
  }

  refreshButtons() {
    if (this.startButton) {
      this.startButton.disabled = !this.uiState.supportAvailable || this.uiState.sessionActive;
    }

    if (this.placeButton) {
      this.placeButton.disabled =
        !this.uiState.sessionActive || !this.uiState.stableSurface || this.uiState.placed;
    }

    if (this.resetButton) {
      this.resetButton.disabled = !this.uiState.sessionActive && !this.uiState.placed;
    }

    if (this.stopButton) {
      this.stopButton.disabled = !this.uiState.sessionActive;
    }
  }

  dispose() {
    for (const cleanup of this.cleanupCallbacks) {
      cleanup();
    }
    this.cleanupCallbacks.length = 0;
  }
}
