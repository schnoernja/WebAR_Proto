const HUD_COLLAPSE_STORAGE_KEY = "webar-hud-collapsed";

function toEditableValue(value, fractionDigits = 6) {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : "";
}

function toBadgeStatus(status) {
  switch (status) {
    case "ready":
      return "ok";
    case "waiting":
      return "warning";
    case "blocked":
    case "unsupported":
    case "error":
      return "error";
    default:
      return "idle";
  }
}

function toGeoBadgeLabel(status) {
  switch (status) {
    case "ready":
      return "Live";
    case "waiting":
      return "Wartet";
    case "blocked":
      return "Blockiert";
    case "unsupported":
      return "Kein GPS";
    case "error":
      return "Fehler";
    default:
      return "Pruefung";
  }
}

function toModeLabel(mode) {
  return mode === "geo" ? "Koordinaten" : "Freie Platzierung";
}

export class UIController {
  constructor(documentRef = document) {
    this.document = documentRef;
    this.hudRoot = this.document.getElementById("hud");
    this.hudBody = this.document.getElementById("hud-body");
    this.toggleButton = this.document.getElementById("hud-toggle-button");
    this.toggleIconEl = this.document.getElementById("hud-toggle-icon");

    this.messageEl = this.document.getElementById("status-message");
    this.hintEl = this.document.getElementById("interaction-hint");
    this.assetNameEl = this.document.getElementById("asset-name");
    this.geoTargetFeedbackEl = this.document.getElementById("geo-target-feedback");
    this.modeBadgeEl = this.document.getElementById("mode-badge");

    this.startButton = this.document.getElementById("start-ar-button");
    this.placeButton = this.document.getElementById("place-button");
    this.resetButton = this.document.getElementById("reset-button");
    this.stopButton = this.document.getElementById("stop-ar-button");
    this.applyGeoTargetButton = this.document.getElementById("apply-geo-target-button");

    this.modeSelect = this.document.getElementById("placement-mode-select");
    this.geoTargetInputs = {
      latitude: this.document.getElementById("geo-target-latitude"),
      longitude: this.document.getElementById("geo-target-longitude")
    };

    this.geoRefs = {
      statusBadge: this.document.getElementById("geo-status-badge"),
      latitude: this.document.getElementById("geo-latitude"),
      longitude: this.document.getElementById("geo-longitude"),
      accuracy: this.document.getElementById("geo-accuracy"),
      message: this.document.getElementById("geo-message")
    };

    this.miniRefs = {
      session: this.document.getElementById("mini-session"),
      surface: this.document.getElementById("mini-surface"),
      placement: this.document.getElementById("mini-placement")
    };

    this.stateRefs = {
      support: this.getStateRef("support"),
      session: this.getStateRef("session"),
      tracking: this.getStateRef("tracking"),
      surface: this.getStateRef("surface"),
      stability: this.getStateRef("stability"),
      placement: this.getStateRef("placement")
    };

    this.uiState = {
      supportAvailable: null,
      sessionActive: false,
      surfaceDetected: false,
      stableSurface: false,
      placed: false,
      placementMode: "free",
      hudCollapsed: this.readStoredCollapsedState()
    };

    this.geoTargetDraft = {
      latitude: "",
      longitude: ""
    };

    this.cleanupCallbacks = [];

    this.applyHudCollapsedState();
    this.setPlacementMode(this.uiState.placementMode);
    this.refreshMiniSummary();
    this.renderGeoSnapshot({
      status: "idle",
      message: "Geolocation wird initialisiert.",
      position: null
    });
  }

  getStateRef(key) {
    return {
      item: this.document.querySelector(`[data-state="${key}"]`),
      value: this.document.getElementById(`state-${key}`)
    };
  }

  bindActions({ onStartAR, onPlace, onResetPlacement, onStopAR, onApplyGeoTarget, onModeChange }) {
    this.bindButton(this.startButton, onStartAR);
    this.bindButton(this.placeButton, onPlace);
    this.bindButton(this.resetButton, onResetPlacement);
    this.bindButton(this.stopButton, onStopAR);
    this.bindButton(this.toggleButton, () => this.toggleCollapsed());
    this.bindButton(this.applyGeoTargetButton, () => this.handleApplyGeoTarget(onApplyGeoTarget));

    this.bindInput(this.geoTargetInputs.latitude, () => this.updateGeoTargetDraftFromInputs());
    this.bindInput(this.geoTargetInputs.longitude, () => this.updateGeoTargetDraftFromInputs());
    this.bindSelect(this.modeSelect, () => this.handleModeChange(onModeChange));

    this.refreshButtons();
  }

  bindGeoLocationService(service) {
    if (!service || typeof service.subscribe !== "function") {
      this.renderGeoSnapshot({
        status: "unsupported",
        message: "Geolocation nicht verfuegbar.",
        position: null
      });
      return;
    }

    const unsubscribe = service.subscribe((snapshot) => {
      this.renderGeoSnapshot(snapshot);
    });

    this.cleanupCallbacks.push(() => {
      unsubscribe();
    });
  }

  bindButton(button, handler) {
    if (!button || typeof handler !== "function") {
      return;
    }

    button.addEventListener("click", handler);
    this.cleanupCallbacks.push(() => button.removeEventListener("click", handler));
  }

  bindInput(input, handler) {
    if (!input || typeof handler !== "function") {
      return;
    }

    input.addEventListener("input", handler);
    this.cleanupCallbacks.push(() => input.removeEventListener("input", handler));
  }

  bindSelect(select, handler) {
    if (!select || typeof handler !== "function") {
      return;
    }

    select.addEventListener("change", handler);
    this.cleanupCallbacks.push(() => select.removeEventListener("change", handler));
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

  setPlacementMode(mode) {
    this.uiState.placementMode = mode === "geo" ? "geo" : "free";

    if (this.modeSelect) {
      this.modeSelect.value = this.uiState.placementMode;
    }

    if (this.modeBadgeEl) {
      this.modeBadgeEl.textContent = toModeLabel(this.uiState.placementMode);
    }

    this.refreshButtons();
  }

  setGeoTargetInputs(coord) {
    if (!coord) {
      return;
    }

    this.geoTargetDraft = {
      latitude: toEditableValue(coord.latitude),
      longitude: toEditableValue(coord.longitude)
    };

    if (this.geoTargetInputs.latitude) {
      this.geoTargetInputs.latitude.value = this.geoTargetDraft.latitude;
    }

    if (this.geoTargetInputs.longitude) {
      this.geoTargetInputs.longitude.value = this.geoTargetDraft.longitude;
    }
  }

  setGeoTargetFeedback(message) {
    if (this.geoTargetFeedbackEl) {
      this.geoTargetFeedbackEl.textContent = message;
    }
  }

  updateGeoTargetDraftFromInputs() {
    this.geoTargetDraft = {
      latitude: this.geoTargetInputs.latitude ? this.geoTargetInputs.latitude.value : "",
      longitude: this.geoTargetInputs.longitude ? this.geoTargetInputs.longitude.value : ""
    };
  }

  handleApplyGeoTarget(handler) {
    this.updateGeoTargetDraftFromInputs();

    const parsedCoord = {
      latitude: Number.parseFloat(this.geoTargetDraft.latitude),
      longitude: Number.parseFloat(this.geoTargetDraft.longitude)
    };

    if (
      !Number.isFinite(parsedCoord.latitude) ||
      !Number.isFinite(parsedCoord.longitude) ||
      parsedCoord.latitude < -90 ||
      parsedCoord.latitude > 90 ||
      parsedCoord.longitude < -180 ||
      parsedCoord.longitude > 180
    ) {
      this.setGeoTargetFeedback("Bitte gueltige Latitude- und Longitude-Werte eingeben.");
      return;
    }

    const result = typeof handler === "function" ? handler(parsedCoord) : false;
    if (result === false) {
      this.setGeoTargetFeedback("Koordinaten konnten nicht uebernommen werden.");
      return;
    }

    this.setGeoTargetInputs(parsedCoord);
    this.setGeoTargetFeedback("Koordinaten uebernommen. Sie greifen bei der naechsten Platzierung.");
  }

  handleModeChange(handler) {
    const nextMode = this.modeSelect ? this.modeSelect.value : "free";
    const accepted = typeof handler === "function" ? handler(nextMode) : false;

    if (accepted === false) {
      this.setPlacementMode(this.uiState.placementMode);
      return;
    }

    this.setPlacementMode(nextMode);
  }

  setSupportState(available, detail) {
    this.uiState.supportAvailable = available;
    this.setState("support", available ? "Verfuegbar" : "Nicht verfuegbar", available ? "ok" : "error");
    if (detail) {
      this.setMessage(detail);
    }
    this.refreshMiniSummary();
    this.refreshButtons();
  }

  setSessionState(active, detail) {
    this.uiState.sessionActive = active;
    this.setState("session", active ? "Ja" : "Nein", active ? "active" : "idle");
    this.document.body.classList.toggle("ar-active", active);
    if (detail) {
      this.setMessage(detail);
    }
    this.refreshMiniSummary();
    this.refreshButtons();
  }

  setTrackingState(active) {
    this.setState("tracking", active ? "Laeuft" : "Wartet", active ? "ok" : "idle");
  }

  setSurfaceState(detected, stable) {
    this.uiState.surfaceDetected = detected;
    this.uiState.stableSurface = detected && stable;

    this.setState("surface", detected ? "Erkannt" : "Suche", detected ? "warning" : "idle");
    this.setState(
      "stability",
      stable ? "Stabil" : detected ? "Pruefung" : "Wartet",
      stable ? "ok" : detected ? "warning" : "idle"
    );

    this.refreshMiniSummary();
    this.refreshButtons();
  }

  setPlacementState(placed) {
    this.uiState.placed = placed;
    this.setState("placement", placed ? "Platziert" : "Nicht platziert", placed ? "done" : "idle");
    this.refreshMiniSummary();
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
        this.uiState.placementMode !== "free" ||
        !this.uiState.sessionActive ||
        !this.uiState.stableSurface ||
        this.uiState.placed;
    }

    if (this.resetButton) {
      this.resetButton.disabled = !this.uiState.sessionActive && !this.uiState.placed;
    }

    if (this.stopButton) {
      this.stopButton.disabled = !this.uiState.sessionActive;
    }
  }

  refreshMiniSummary() {
    const sessionText = this.uiState.sessionActive
      ? "AR: Aktiv"
      : this.uiState.supportAvailable === null
        ? "AR: Pruefung"
        : this.uiState.supportAvailable
          ? "AR: Bereit"
          : "AR: Inaktiv";
    const sessionStatus = this.uiState.sessionActive
      ? "active"
      : this.uiState.supportAvailable === null
        ? "idle"
        : this.uiState.supportAvailable
          ? "ok"
          : "error";

    const surfaceText = this.uiState.stableSurface
      ? "Flaeche: Stabil"
      : this.uiState.surfaceDetected
        ? "Flaeche: Pruefung"
        : "Flaeche: Suche";
    const surfaceStatus = this.uiState.stableSurface
      ? "ok"
      : this.uiState.surfaceDetected
        ? "warning"
        : "idle";

    const placementText = this.uiState.placed ? "Objekt: Platziert" : "Objekt: Wartet";
    const placementStatus = this.uiState.placed ? "done" : "idle";

    this.setMiniState("session", sessionText, sessionStatus);
    this.setMiniState("surface", surfaceText, surfaceStatus);
    this.setMiniState("placement", placementText, placementStatus);
  }

  setMiniState(key, text, status) {
    const el = this.miniRefs[key];
    if (!el) {
      return;
    }

    el.textContent = text;
    el.dataset.status = status;
  }

  renderGeoSnapshot(snapshot) {
    const position = snapshot && snapshot.position ? snapshot.position : null;
    const status = snapshot && snapshot.status ? snapshot.status : "idle";
    const message = snapshot && snapshot.message ? snapshot.message : "Geolocation wird initialisiert.";

    if (this.geoRefs.statusBadge) {
      this.geoRefs.statusBadge.textContent = toGeoBadgeLabel(status);
      this.geoRefs.statusBadge.dataset.status = toBadgeStatus(status);
    }

    if (this.geoRefs.latitude) {
      this.geoRefs.latitude.textContent = position ? position.latitude.toFixed(6) : "-";
    }

    if (this.geoRefs.longitude) {
      this.geoRefs.longitude.textContent = position ? position.longitude.toFixed(6) : "-";
    }

    if (this.geoRefs.accuracy) {
      this.geoRefs.accuracy.textContent = position ? `+/- ${Math.round(position.accuracyMeters)} m` : "-";
    }

    if (this.geoRefs.message) {
      this.geoRefs.message.textContent = message;
    }
  }

  toggleCollapsed() {
    this.uiState.hudCollapsed = !this.uiState.hudCollapsed;
    this.persistCollapsedState();
    this.applyHudCollapsedState();
  }

  applyHudCollapsedState() {
    if (this.hudRoot) {
      this.hudRoot.classList.toggle("is-collapsed", this.uiState.hudCollapsed);
    }

    if (this.toggleButton) {
      this.toggleButton.setAttribute("aria-expanded", String(!this.uiState.hudCollapsed));
      this.toggleButton.setAttribute(
        "aria-label",
        this.uiState.hudCollapsed ? "Bedienfeld aufklappen" : "Bedienfeld minimieren"
      );
      this.toggleButton.title = this.uiState.hudCollapsed
        ? "Bedienfeld aufklappen"
        : "Bedienfeld minimieren";
    }

    if (this.toggleIconEl) {
      this.toggleIconEl.textContent = this.uiState.hudCollapsed ? "+" : "-";
    }

    if (this.hudBody) {
      this.hudBody.setAttribute("aria-hidden", String(this.uiState.hudCollapsed));
    }
  }

  readStoredCollapsedState() {
    try {
      return window.localStorage.getItem(HUD_COLLAPSE_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  }

  persistCollapsedState() {
    try {
      window.localStorage.setItem(HUD_COLLAPSE_STORAGE_KEY, String(this.uiState.hudCollapsed));
    } catch {
      // Ignore storage failures.
    }
  }

  dispose() {
    for (const cleanup of this.cleanupCallbacks) {
      cleanup();
    }
    this.cleanupCallbacks.length = 0;
  }
}
