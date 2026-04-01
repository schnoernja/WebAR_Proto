const DEFAULT_CARD_VISIBILITY = Object.freeze({
  placement: true,
  coord: false,
  state: false,
  note: false,
  geo: true,
  debug: false,
  help: true
});

const DEFAULT_CARD_COLLAPSED = Object.freeze({
  placement: false,
  coord: true,
  state: true,
  note: true,
  geo: true,
  debug: true,
  help: false
});

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

export class UIController {
  constructor(documentRef = document) {
    this.document = documentRef;
    this.uiContainer = this.document.getElementById("ui-container");
    this.hudRoot = this.document.getElementById("hud");
    this.hudBody = this.document.getElementById("hud-body");

    this.menuButton = this.document.getElementById("menu-button");
    this.menuOverlay = this.document.getElementById("menu-overlay");
    this.menuCloseButton = this.document.getElementById("menu-close-button");
    this.openHelpCardButton = this.document.getElementById("open-help-card-button");
    this.menuTabButtons = Array.from(this.document.querySelectorAll("[data-menu-tab]"));
    this.menuTabPanels = Array.from(this.document.querySelectorAll("[data-menu-panel]"));
    this.cardVisibilityToggles = Array.from(this.document.querySelectorAll("[data-card-visibility-toggle]"));

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
    this.activateGeoButton = this.document.getElementById("activate-geolocation-button");
    this.closeHelpButton = this.document.getElementById("close-help-button");

    this.modeSelect = this.document.getElementById("placement-mode-select");
    this.geoTargetInputs = {
      latitude: this.document.getElementById("geo-target-latitude"),
      longitude: this.document.getElementById("geo-target-longitude")
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
    this.geoCopyTriggers = Array.from(this.document.querySelectorAll("[data-copy-device-coords='true']"));

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

    this.cardRefs = {
      placement: this.getCardRefs("placement"),
      coord: this.getCardRefs("coord"),
      state: this.getCardRefs("state"),
      note: this.getCardRefs("note"),
      geo: this.getCardRefs("geo"),
      debug: this.getCardRefs("debug"),
      help: this.getCardRefs("help")
    };

    this.uiState = {
      supportAvailable: null,
      sessionActive: false,
      surfaceDetected: false,
      stableSurface: false,
      placed: false,
      placementMode: "free",
      geoStatus: "not-requested",
      geoWatchActive: false,
      menuOpen: false,
      activeMenuTab: "placement",
      cardVisibility: { ...DEFAULT_CARD_VISIBILITY },
      cardCollapsed: { ...DEFAULT_CARD_COLLAPSED }
    };

    this.geoTargetDraft = {
      latitude: "",
      longitude: ""
    };
    this.latestGeoPosition = null;
    this.uiInteracting = false;
    this.uiInteractionChangeHandler = null;
    this.uiInteractionReleaseTimeoutId = null;
    this.cleanupCallbacks = [];

    this.configureTextInputs();
    this.applyMenuState();
    this.applyMenuTabState();
    this.applyAllCardStates();
    this.setPlacementMode(this.uiState.placementMode);
    this.refreshMiniSummary();
    this.renderGeoSnapshot({
      status: "not-requested",
      issue: null,
      message: "Standort noch nicht angefordert.",
      helpText: "Tippe auf 'Standort aktivieren', damit der Browser die Freigabe anfragt.",
      position: null
    });
    this.setGeoDebug({});
    this.setPlacementDebug({});
    this.syncCanvasPointerEvents();
  }

  getStateRef(key) {
    return {
      item: this.document.querySelector(`[data-state="${key}"]`),
      value: this.document.getElementById(`state-${key}`)
    };
  }

  getCardRefs(key) {
    return {
      root: this.document.querySelector(`[data-card="${key}"]`),
      content: this.document.querySelector(`[data-card-content="${key}"]`),
      toggleButton: this.document.querySelector(`[data-card-toggle="${key}"]`),
      toggleIcon: this.document.querySelector(`[data-card-toggle-icon="${key}"]`)
    };
  }

  configureTextInputs() {
    const textInputs = [this.geoTargetInputs.latitude, this.geoTargetInputs.longitude].filter(Boolean);

    for (const input of textInputs) {
      input.setAttribute("autocomplete", "off");
      input.setAttribute("autocorrect", "off");
      input.setAttribute("spellcheck", "false");
      input.setAttribute("inputmode", "decimal");
    }
  }

  bindActions({
    onStartAR,
    onPlace,
    onResetPlacement,
    onStopAR,
    onApplyGeoTarget,
    onModeChange,
    onRequestGeolocation,
    onUIInteractionChange
  }) {
    this.uiInteractionChangeHandler = typeof onUIInteractionChange === "function" ? onUIInteractionChange : null;

    this.bindButton(this.startButton, onStartAR);
    this.bindButton(this.placeButton, onPlace);
    this.bindButton(this.resetButton, onResetPlacement);
    this.bindButton(this.stopButton, onStopAR);
    this.bindButton(this.applyGeoTargetButton, () => this.handleApplyGeoTarget(onApplyGeoTarget));
    this.bindButton(this.activateGeoButton, onRequestGeolocation);
    this.bindButton(this.closeHelpButton, () => this.closeHelpCard());

    this.bindInput(this.geoTargetInputs.latitude, () => this.updateGeoTargetDraftFromInputs());
    this.bindInput(this.geoTargetInputs.longitude, () => this.updateGeoTargetDraftFromInputs());
    this.bindSelect(this.modeSelect, () => this.handleModeChange(onModeChange));

    this.bindCardToggleButtons();
    this.bindMenuControls();
    this.bindInteractionSurface(this.uiContainer);
    this.bindInteractionSurface(this.hudRoot);
    this.bindDeviceCoordinateCopy();

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

  bindCardToggleButtons() {
    for (const [cardKey, refs] of Object.entries(this.cardRefs)) {
      if (!refs.toggleButton) {
        continue;
      }

      const handler = () => {
        this.toggleCardCollapsed(cardKey);
      };

      refs.toggleButton.addEventListener("click", handler);
      this.cleanupCallbacks.push(() => refs.toggleButton.removeEventListener("click", handler));
    }
  }

  bindMenuControls() {
    this.bindButton(this.menuButton, () => this.toggleMenu());
    this.bindButton(this.menuCloseButton, () => this.closeMenu());
    this.bindButton(this.openHelpCardButton, () => {
      this.openHelpCard();
      this.closeMenu();
    });

    for (const tabButton of this.menuTabButtons) {
      const handler = () => {
        this.setActiveMenuTab(tabButton.dataset.menuTab || "placement");
      };

      tabButton.addEventListener("click", handler);
      this.cleanupCallbacks.push(() => tabButton.removeEventListener("click", handler));
    }

    for (const toggle of this.cardVisibilityToggles) {
      const handler = () => {
        this.setCardVisibility(toggle.dataset.cardVisibilityToggle, toggle.checked);
      };

      toggle.addEventListener("change", handler);
      this.cleanupCallbacks.push(() => toggle.removeEventListener("change", handler));
    }

    if (this.menuOverlay) {
      const handler = (event) => {
        if (event.target === this.menuOverlay) {
          this.closeMenu();
        }
      };

      this.menuOverlay.addEventListener("click", handler);
      this.cleanupCallbacks.push(() => this.menuOverlay.removeEventListener("click", handler));
    }
  }

  bindInteractionSurface(surface) {
    if (!surface) {
      return;
    }

    const handleTouchStart = (event) => {
      event.stopPropagation();
      this.beginUIInteraction();
    };
    const handleTouchEnd = (event) => {
      event.stopPropagation();
      this.scheduleUIInteractionRelease();
    };
    const handleTouchCancel = (event) => {
      event.stopPropagation();
      this.scheduleUIInteractionRelease();
    };
    const handlePointerDown = (event) => {
      event.stopPropagation();
      this.beginUIInteraction();
    };
    const handlePointerUp = (event) => {
      event.stopPropagation();
      this.scheduleUIInteractionRelease();
    };
    const handlePointerCancel = (event) => {
      event.stopPropagation();
      this.scheduleUIInteractionRelease();
    };
    const handleClick = (event) => {
      event.stopPropagation();
    };

    surface.addEventListener("touchstart", handleTouchStart, { passive: false });
    surface.addEventListener("touchend", handleTouchEnd);
    surface.addEventListener("touchcancel", handleTouchCancel);
    surface.addEventListener("pointerdown", handlePointerDown);
    surface.addEventListener("pointerup", handlePointerUp);
    surface.addEventListener("pointercancel", handlePointerCancel);
    surface.addEventListener("click", handleClick);

    this.cleanupCallbacks.push(() => surface.removeEventListener("touchstart", handleTouchStart));
    this.cleanupCallbacks.push(() => surface.removeEventListener("touchend", handleTouchEnd));
    this.cleanupCallbacks.push(() => surface.removeEventListener("touchcancel", handleTouchCancel));
    this.cleanupCallbacks.push(() => surface.removeEventListener("pointerdown", handlePointerDown));
    this.cleanupCallbacks.push(() => surface.removeEventListener("pointerup", handlePointerUp));
    this.cleanupCallbacks.push(() => surface.removeEventListener("pointercancel", handlePointerCancel));
    this.cleanupCallbacks.push(() => surface.removeEventListener("click", handleClick));
  }

  beginUIInteraction() {
    this.clearPendingUIInteractionRelease();
    this.setUIInteracting(true);
  }

  scheduleUIInteractionRelease() {
    this.clearPendingUIInteractionRelease();
    this.uiInteractionReleaseTimeoutId = window.setTimeout(() => {
      this.uiInteractionReleaseTimeoutId = null;
      this.setUIInteracting(false);
    }, 50);
  }

  clearPendingUIInteractionRelease() {
    if (this.uiInteractionReleaseTimeoutId !== null) {
      window.clearTimeout(this.uiInteractionReleaseTimeoutId);
      this.uiInteractionReleaseTimeoutId = null;
    }
  }

  getCanvasElement() {
    return this.document.getElementById("ar-canvas");
  }

  syncCanvasPointerEvents() {
    const canvas = this.getCanvasElement();
    if (!canvas) {
      return;
    }

    canvas.style.pointerEvents = this.uiInteracting ? "none" : "auto";
  }

  bindDeviceCoordinateCopy() {
    if (this.geoCopyTriggers.length === 0) {
      return;
    }

    const handleCopy = () => {
      this.copyDeviceCoordinatesToTargetInputs();
    };

    for (const trigger of this.geoCopyTriggers) {
      trigger.addEventListener("click", handleCopy);
      this.cleanupCallbacks.push(() => trigger.removeEventListener("click", handleCopy));
    }
  }

  setMenuOpen(open) {
    this.uiState.menuOpen = Boolean(open);
    this.applyMenuState();
  }

  toggleMenu() {
    this.setMenuOpen(!this.uiState.menuOpen);
  }

  closeMenu() {
    this.setMenuOpen(false);
  }

  applyMenuState() {
    if (this.menuOverlay) {
      this.menuOverlay.hidden = !this.uiState.menuOpen;
    }

    if (this.menuButton) {
      this.menuButton.setAttribute("aria-expanded", String(this.uiState.menuOpen));
    }
  }

  setActiveMenuTab(tabKey) {
    this.uiState.activeMenuTab = tabKey;
    this.applyMenuTabState();
  }

  applyMenuTabState() {
    for (const tabButton of this.menuTabButtons) {
      const isActive = tabButton.dataset.menuTab === this.uiState.activeMenuTab;
      tabButton.dataset.active = isActive ? "true" : "false";
      tabButton.setAttribute("aria-selected", String(isActive));
    }

    for (const tabPanel of this.menuTabPanels) {
      tabPanel.hidden = tabPanel.dataset.menuPanel !== this.uiState.activeMenuTab;
    }
  }

  applyAllCardStates() {
    for (const cardKey of Object.keys(this.cardRefs)) {
      this.applyCardVisibility(cardKey);
      this.applyCardCollapse(cardKey);
      this.syncCardVisibilityToggle(cardKey);
    }
  }

  setCardVisibility(cardKey, visible) {
    if (!Object.prototype.hasOwnProperty.call(this.uiState.cardVisibility, cardKey)) {
      return;
    }

    this.uiState.cardVisibility[cardKey] = Boolean(visible);
    this.applyCardVisibility(cardKey);
    this.syncCardVisibilityToggle(cardKey);
  }

  applyCardVisibility(cardKey) {
    const refs = this.cardRefs[cardKey];
    if (!refs || !refs.root) {
      return;
    }

    refs.root.hidden = !this.uiState.cardVisibility[cardKey];
  }

  syncCardVisibilityToggle(cardKey) {
    for (const toggle of this.cardVisibilityToggles) {
      if (toggle.dataset.cardVisibilityToggle === cardKey) {
        toggle.checked = Boolean(this.uiState.cardVisibility[cardKey]);
      }
    }
  }

  toggleCardCollapsed(cardKey) {
    if (!Object.prototype.hasOwnProperty.call(this.uiState.cardCollapsed, cardKey)) {
      return;
    }

    this.setCardCollapsed(cardKey, !this.uiState.cardCollapsed[cardKey]);
  }

  setCardCollapsed(cardKey, collapsed) {
    if (!Object.prototype.hasOwnProperty.call(this.uiState.cardCollapsed, cardKey)) {
      return;
    }

    this.uiState.cardCollapsed[cardKey] = Boolean(collapsed);
    this.applyCardCollapse(cardKey);
  }

  applyCardCollapse(cardKey) {
    const refs = this.cardRefs[cardKey];
    if (!refs) {
      return;
    }

    const collapsed = Boolean(this.uiState.cardCollapsed[cardKey]);
    if (refs.root) {
      refs.root.classList.toggle("is-collapsed", collapsed);
    }

    if (refs.content) {
      refs.content.hidden = collapsed;
    }

    if (refs.toggleButton) {
      refs.toggleButton.setAttribute("aria-expanded", String(!collapsed));
    }

    if (refs.toggleIcon) {
      refs.toggleIcon.textContent = collapsed ? "+" : "-";
    }
  }

  openHelpCard() {
    this.setCardVisibility("help", true);
    this.setCardCollapsed("help", false);
  }

  closeHelpCard() {
    this.setCardVisibility("help", false);
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

    if (active) {
      this.closeMenu();
      this.setCardVisibility("placement", true);
      this.setCardVisibility("coord", true);
      this.setCardCollapsed("placement", false);
      this.setCardCollapsed("coord", false);
      this.setCardVisibility("help", false);
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
    const message = snapshot && snapshot.message ? snapshot.message : "Standort noch nicht angefordert.";
    const helpText = snapshot && snapshot.helpText ? snapshot.helpText : "";
    const severity = toGeoSeverity(snapshot);
    const statusText = toGeoStatusText(snapshot);

    this.uiState.geoStatus = snapshot && snapshot.status ? snapshot.status : "not-requested";
    this.uiState.geoWatchActive = Boolean(snapshot && snapshot.watchActive);
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

    if (this.activateGeoButton) {
      this.activateGeoButton.disabled =
        this.uiState.geoStatus === "waiting" ||
        this.uiState.geoWatchActive ||
        (snapshot && (snapshot.issue === "https-required" || snapshot.issue === "unsupported"));
    }
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
    const nextValue = Boolean(interacting);
    if (this.uiInteracting === nextValue) {
      this.syncCanvasPointerEvents();
      return;
    }

    this.uiInteracting = nextValue;
    this.syncCanvasPointerEvents();

    if (this.uiInteractionChangeHandler) {
      this.uiInteractionChangeHandler(nextValue);
    }
  }

  copyDeviceCoordinatesToTargetInputs() {
    if (!this.latestGeoPosition) {
      this.setGeoTargetFeedback("Keine Geraetekoordinaten verfuegbar.");
      return false;
    }

    this.setGeoTargetInputs(this.latestGeoPosition);
    this.setGeoTargetFeedback("Aktuelle Geraetekoordinaten uebernommen.");
    return true;
  }

  dispose() {
    this.clearPendingUIInteractionRelease();
    this.setUIInteracting(false);

    for (const cleanup of this.cleanupCallbacks) {
      cleanup();
    }
    this.cleanupCallbacks.length = 0;
  }
}
