function toEditableValue(value, fractionDigits = 6) {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : "";
}

function toBadgeStatus(status) {
  switch (status) {
    case "granted":
      return "ok";
    case "waiting":
      return "warning";
    case "denied":
      return "error";
    default:
      return "idle";
  }
}

function toGeoSeverity(snapshot) {
  if (!snapshot) {
    return "idle";
  }

  if (snapshot.issue === "https-required" || snapshot.issue === "unsupported") {
    return "error";
  }

  if (snapshot.status === "denied") {
    return "error";
  }

  return toBadgeStatus(snapshot.status);
}

function toGeoBadgeLabel(snapshot) {
  if (!snapshot) {
    return "Pruefung";
  }

  if (snapshot.issue === "https-required") {
    return "HTTPS";
  }

  if (snapshot.issue === "unsupported") {
    return "Kein GPS";
  }

  switch (snapshot.status) {
    case "granted":
      return "Granted";
    case "waiting":
      return "Wartet";
    case "denied":
      return "Denied";
    case "not-requested":
      return "Bereit";
    default:
      return "Pruefung";
  }
}

function toGeoStatusText(snapshot) {
  if (!snapshot) {
    return "Not requested";
  }

  switch (snapshot.status) {
    case "granted":
      return "Granted";
    case "waiting":
      return "Waiting for permission";
    case "denied":
      return "Denied";
    case "not-requested":
    default:
      return "Not requested";
  }
}

function toModeLabel(mode) {
  return mode === "geo" ? "Koordinaten" : "Freie Platzierung";
}

function formatDebugNumber(value, fractionDigits = 2) {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : "-";
}

function formatDebugBoolean(value) {
  return value ? "true" : "false";
}

function isValidGeoCoord(coord) {
  return (
    coord &&
    Number.isFinite(coord.latitude) &&
    Number.isFinite(coord.longitude) &&
    coord.latitude >= -90 &&
    coord.latitude <= 90 &&
    coord.longitude >= -180 &&
    coord.longitude <= 180
  );
}

export class UIController {
  constructor(documentRef = document) {
    this.document = documentRef;
    this.body = this.document.body;
    this.hudRoot = this.document.getElementById("hud");

    this.modeSections = {
      config: Array.from(this.document.querySelectorAll("[data-app-mode='config']")),
      ar: Array.from(this.document.querySelectorAll("[data-app-mode='ar']"))
    };

    this.messageEl = this.document.getElementById("status-message");
    this.hintEl = this.document.getElementById("interaction-hint");
    this.assetNameEl = this.document.getElementById("asset-name");
    this.geoTargetFeedbackEl = this.document.getElementById("geo-target-feedback");
    this.modeBadgeEl = this.document.getElementById("mode-badge");

    this.startButton = this.document.getElementById("start-ar-button");
    this.placeButton = this.document.getElementById("place-button");
    this.resetButton = this.document.getElementById("reset-button");
    this.openSettingsButton = this.document.getElementById("open-settings-button");
    this.activateGeoButton = this.document.getElementById("activate-geolocation-button");
    this.useDeviceLocationButton = this.document.getElementById("use-device-location-button");

    this.modeSelect = this.document.getElementById("placement-mode-select");
    this.geoTargetInputs = {
      latitude: this.document.getElementById("geo-target-latitude"),
      longitude: this.document.getElementById("geo-target-longitude")
    };
    this.geoTargetReadoutRefs = {
      latitude: this.document.getElementById("target-latitude-display"),
      longitude: this.document.getElementById("target-longitude-display")
    };

    this.geoRefs = {
      statusBadge: this.document.getElementById("geo-status-badge"),
      statusText: this.document.getElementById("geo-status-text"),
      latitude: this.document.getElementById("geo-latitude"),
      longitude: this.document.getElementById("geo-longitude"),
      accuracy: this.document.getElementById("geo-accuracy"),
      message: this.document.getElementById("geo-message"),
      help: this.document.getElementById("geo-help")
    };

    this.geoDebugRefs = {
      originLatitude: this.document.getElementById("debug-origin-latitude"),
      originLongitude: this.document.getElementById("debug-origin-longitude"),
      targetLatitude: this.document.getElementById("debug-target-latitude"),
      targetLongitude: this.document.getElementById("debug-target-longitude"),
      deltaLatitude: this.document.getElementById("debug-delta-latitude"),
      deltaLongitude: this.document.getElementById("debug-delta-longitude"),
      xMeters: this.document.getElementById("debug-x-meters"),
      zMeters: this.document.getElementById("debug-z-meters"),
      distanceMeters: this.document.getElementById("debug-distance-meters")
    };

    this.placementDebugRefs = {
      objectPlaced: this.document.getElementById("debug-object-placed"),
      distanceTooFar: this.document.getElementById("debug-distance-too-far"),
      hasStableSurface: this.document.getElementById("debug-has-stable-surface"),
      objectBehindCamera: this.document.getElementById("debug-object-behind-camera")
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
      appMode: "config",
      supportAvailable: null,
      sessionActive: false,
      surfaceDetected: false,
      stableSurface: false,
      placed: false,
      placementMode: "free",
      geoStatus: "not-requested",
      geoWatchActive: false,
      geoIssue: null
    };

    this.geoTargetDraft = {
      latitude: "",
      longitude: ""
    };
    this.latestGeoPosition = null;
    this.uiInteracting = false;
    this.uiInteractionChangeHandler = null;

    this.cleanupCallbacks = [];

    this.setAppMode("config");
    this.setPlacementMode(this.uiState.placementMode);
    this.renderGeoSnapshot({
      status: "not-requested",
      issue: null,
      message: "Standort noch nicht angefordert.",
      helpText: "Tippe auf 'Standort aktivieren', damit der Browser die Freigabe anfragt.",
      position: null
    });
    this.setGeoDebug({});
    this.setPlacementDebug({});
  }

  getStateRef(key) {
    return {
      item: this.document.querySelector(`[data-state="${key}"]`),
      value: this.document.getElementById(`state-${key}`)
    };
  }

  bindActions({
    onStartAR,
    onPlace,
    onResetPlacement,
    onOpenSettings,
    onModeChange,
    onRequestGeolocation,
    onUIInteractionChange
  }) {
    this.uiInteractionChangeHandler = typeof onUIInteractionChange === "function" ? onUIInteractionChange : null;

    this.bindButton(this.startButton, () => this.handleStartAR(onStartAR));
    this.bindButton(this.placeButton, onPlace);
    this.bindButton(this.resetButton, onResetPlacement);
    this.bindButton(this.openSettingsButton, onOpenSettings);
    this.bindButton(this.activateGeoButton, onRequestGeolocation);
    this.bindButton(this.useDeviceLocationButton, () => this.copyDeviceCoordinatesToTargetInputs());

    this.bindInput(this.geoTargetInputs.latitude, () => this.updateGeoTargetDraftFromInputs());
    this.bindInput(this.geoTargetInputs.longitude, () => this.updateGeoTargetDraftFromInputs());
    this.bindSelect(this.modeSelect, () => this.handleModeChange(onModeChange));
    this.bindHudInteraction();

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

  bindHudInteraction() {
    if (!this.hudRoot) {
      return;
    }

    const handlePointerDown = (event) => {
      event.stopPropagation();
      this.setUIInteracting(true);
    };
    const handlePointerUp = (event) => {
      event.stopPropagation();
      this.setUIInteracting(false);
    };
    const handleClick = (event) => {
      event.stopPropagation();
    };
    const handleTouchStart = (event) => {
      event.stopPropagation();
    };
    const handleWindowPointerEnd = () => {
      this.setUIInteracting(false);
    };

    this.hudRoot.addEventListener("pointerdown", handlePointerDown);
    this.hudRoot.addEventListener("pointerup", handlePointerUp);
    this.hudRoot.addEventListener("pointercancel", handlePointerUp);
    this.hudRoot.addEventListener("click", handleClick);
    this.hudRoot.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("pointerup", handleWindowPointerEnd);
    window.addEventListener("pointercancel", handleWindowPointerEnd);

    this.cleanupCallbacks.push(() => this.hudRoot.removeEventListener("pointerdown", handlePointerDown));
    this.cleanupCallbacks.push(() => this.hudRoot.removeEventListener("pointerup", handlePointerUp));
    this.cleanupCallbacks.push(() => this.hudRoot.removeEventListener("pointercancel", handlePointerUp));
    this.cleanupCallbacks.push(() => this.hudRoot.removeEventListener("click", handleClick));
    this.cleanupCallbacks.push(() => this.hudRoot.removeEventListener("touchstart", handleTouchStart));
    this.cleanupCallbacks.push(() => window.removeEventListener("pointerup", handleWindowPointerEnd));
    this.cleanupCallbacks.push(() => window.removeEventListener("pointercancel", handleWindowPointerEnd));
  }

  setAppMode(mode) {
    this.uiState.appMode = mode === "ar" ? "ar" : "config";
    this.body.dataset.appMode = this.uiState.appMode;
    this.body.classList.toggle("app-mode-ar", this.uiState.appMode === "ar");
    this.body.classList.toggle("app-mode-config", this.uiState.appMode === "config");

    for (const element of this.modeSections.config) {
      element.hidden = this.uiState.appMode !== "config";
    }

    for (const element of this.modeSections.ar) {
      element.hidden = this.uiState.appMode !== "ar";
    }

    this.refreshButtons();
  }

  getAppMode() {
    return this.uiState.appMode;
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

  getPlacementMode() {
    return this.uiState.placementMode;
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

    this.setGeoTargetReadout(coord);
  }

  setGeoTargetReadout(coord) {
    if (this.geoTargetReadoutRefs.latitude) {
      this.geoTargetReadoutRefs.latitude.textContent =
        coord && Number.isFinite(coord.latitude) ? coord.latitude.toFixed(6) : "-";
    }

    if (this.geoTargetReadoutRefs.longitude) {
      this.geoTargetReadoutRefs.longitude.textContent =
        coord && Number.isFinite(coord.longitude) ? coord.longitude.toFixed(6) : "-";
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

  parseGeoTargetDraft() {
    this.updateGeoTargetDraftFromInputs();

    const parsedCoord = {
      latitude: Number.parseFloat(this.geoTargetDraft.latitude),
      longitude: Number.parseFloat(this.geoTargetDraft.longitude)
    };

    return isValidGeoCoord(parsedCoord) ? parsedCoord : null;
  }

  handleStartAR(handler) {
    const mode = this.getPlacementMode();
    const parsedCoord = this.parseGeoTargetDraft();

    if (mode === "geo" && !parsedCoord) {
      this.setGeoTargetFeedback("Bitte gueltige Latitude- und Longitude-Werte eingeben, bevor du AR startest.");
      return;
    }

    const result = typeof handler === "function" ? handler(parsedCoord) : false;
    if (result === false) {
      this.setGeoTargetFeedback("AR konnte nicht gestartet werden.");
      return;
    }

    if (parsedCoord) {
      this.setGeoTargetInputs(parsedCoord);
    }
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
    this.uiState.surfaceDetected = detected;
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
      this.startButton.disabled = this.uiState.appMode !== "config" || !this.uiState.supportAvailable;
    }

    if (this.placeButton) {
      this.placeButton.disabled =
        this.uiState.appMode !== "ar" ||
        this.uiState.placementMode !== "free" ||
        !this.uiState.sessionActive ||
        !this.uiState.stableSurface ||
        this.uiState.placed;
    }

    if (this.resetButton) {
      this.resetButton.disabled = this.uiState.appMode !== "ar" || !this.uiState.sessionActive;
    }

    if (this.openSettingsButton) {
      this.openSettingsButton.disabled = this.uiState.appMode !== "ar" || !this.uiState.sessionActive;
    }

    if (this.useDeviceLocationButton) {
      this.useDeviceLocationButton.disabled =
        this.uiState.appMode !== "config" || !this.latestGeoPosition;
    }

    if (this.activateGeoButton) {
      this.activateGeoButton.disabled =
        this.uiState.appMode !== "config" ||
        this.uiState.geoStatus === "waiting" ||
        this.uiState.geoWatchActive ||
        this.uiState.geoIssue === "https-required" ||
        this.uiState.geoIssue === "unsupported";
    }
  }

  renderGeoSnapshot(snapshot) {
    const position = snapshot && snapshot.position ? snapshot.position : null;
    const message = snapshot && snapshot.message ? snapshot.message : "Standort noch nicht angefordert.";
    const helpText = snapshot && snapshot.helpText ? snapshot.helpText : "";
    const severity = toGeoSeverity(snapshot);
    const statusText = toGeoStatusText(snapshot);

    this.uiState.geoStatus = snapshot && snapshot.status ? snapshot.status : "not-requested";
    this.uiState.geoWatchActive = Boolean(snapshot && snapshot.watchActive);
    this.uiState.geoIssue = snapshot && snapshot.issue ? snapshot.issue : null;
    this.latestGeoPosition = position
      ? {
          latitude: position.latitude,
          longitude: position.longitude
        }
      : null;

    if (this.geoRefs.statusBadge) {
      this.geoRefs.statusBadge.textContent = toGeoBadgeLabel(snapshot);
      this.geoRefs.statusBadge.dataset.status = severity;
    }

    if (this.geoRefs.statusText) {
      this.geoRefs.statusText.textContent = statusText;
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

    if (this.geoRefs.help) {
      this.geoRefs.help.textContent = helpText;
      this.geoRefs.help.hidden = !helpText;
    }

    this.refreshButtons();
  }

  copyDeviceCoordinatesToTargetInputs() {
    if (!this.latestGeoPosition) {
      this.setGeoTargetFeedback("Keine Geraetekoordinaten verfuegbar. Aktiviere zuerst den Standort.");
      return false;
    }

    this.setGeoTargetInputs(this.latestGeoPosition);
    this.setGeoTargetFeedback("Aktuelle Geraetekoordinaten uebernommen. AR kann jetzt gestartet werden.");
    return true;
  }

  setGeoDebug(debug) {
    const debugState = debug || {};

    if (this.geoDebugRefs.originLatitude) {
      this.geoDebugRefs.originLatitude.textContent = formatDebugNumber(debugState.originLatitude, 6);
    }

    if (this.geoDebugRefs.originLongitude) {
      this.geoDebugRefs.originLongitude.textContent = formatDebugNumber(debugState.originLongitude, 6);
    }

    if (this.geoDebugRefs.targetLatitude) {
      this.geoDebugRefs.targetLatitude.textContent = formatDebugNumber(debugState.targetLatitude, 6);
    }

    if (this.geoDebugRefs.targetLongitude) {
      this.geoDebugRefs.targetLongitude.textContent = formatDebugNumber(debugState.targetLongitude, 6);
    }

    if (this.geoDebugRefs.deltaLatitude) {
      this.geoDebugRefs.deltaLatitude.textContent = formatDebugNumber(debugState.deltaLatitude, 6);
    }

    if (this.geoDebugRefs.deltaLongitude) {
      this.geoDebugRefs.deltaLongitude.textContent = formatDebugNumber(debugState.deltaLongitude, 6);
    }

    if (this.geoDebugRefs.xMeters) {
      this.geoDebugRefs.xMeters.textContent = formatDebugNumber(debugState.xMeters, 2);
    }

    if (this.geoDebugRefs.zMeters) {
      this.geoDebugRefs.zMeters.textContent = formatDebugNumber(debugState.zMeters, 2);
    }

    if (this.geoDebugRefs.distanceMeters) {
      this.geoDebugRefs.distanceMeters.textContent = formatDebugNumber(debugState.distanceMeters, 2);
    }
  }

  setPlacementDebug(debug) {
    const debugState = debug || {};

    if (this.placementDebugRefs.objectPlaced) {
      this.placementDebugRefs.objectPlaced.textContent = formatDebugBoolean(Boolean(debugState.objectPlaced));
    }

    if (this.placementDebugRefs.distanceTooFar) {
      this.placementDebugRefs.distanceTooFar.textContent = formatDebugBoolean(Boolean(debugState.distanceOverLimit));
    }

    if (this.placementDebugRefs.hasStableSurface) {
      this.placementDebugRefs.hasStableSurface.textContent = formatDebugBoolean(Boolean(debugState.hasStableSurface));
    }

    if (this.placementDebugRefs.objectBehindCamera) {
      this.placementDebugRefs.objectBehindCamera.textContent = formatDebugBoolean(Boolean(debugState.objectBehindCamera));
    }
  }

  setUIInteracting(interacting) {
    if (this.uiInteracting === interacting) {
      return;
    }

    this.uiInteracting = interacting;
    if (this.uiInteractionChangeHandler) {
      this.uiInteractionChangeHandler(interacting);
    }
  }

  dispose() {
    for (const cleanup of this.cleanupCallbacks) {
      cleanup();
    }
    this.cleanupCallbacks.length = 0;
  }
}
