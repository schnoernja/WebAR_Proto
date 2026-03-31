const DEFAULT_THROTTLE_MS = 1000;
const INITIAL_REQUEST_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15000
};
const WATCH_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 15000
};

function buildGeoPosition(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: position.coords.accuracy,
    timestamp: position.timestamp
  };
}

function isLocalGeoHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function hasSecureGeoContext() {
  return window.location.protocol === "https:" || isLocalGeoHost(window.location.hostname);
}

function mapGeoError(error) {
  if (!error || typeof error.code !== "number") {
    return {
      message: "Geolocation konnte nicht gelesen werden.",
      helpText: "",
      status: "not-requested",
      issue: "error"
    };
  }

  switch (error.code) {
    case error.PERMISSION_DENIED:
      return {
        message: "Standort verweigert - bitte im Browser aktivieren.",
        helpText: "Bitte aktiviere Standort in: Browser Einstellungen -> Standort -> Erlauben.",
        status: "denied",
        issue: "permission-denied"
      };
    case error.POSITION_UNAVAILABLE:
      return {
        message: "Standort aktuell nicht verfuegbar.",
        helpText: "Pruefe GPS, Netzverbindung und freie Sicht zum Himmel.",
        status: "granted",
        issue: "position-unavailable"
      };
    case error.TIMEOUT:
      return {
        message: "Standortabfrage Timeout.",
        helpText: "Versuche es erneut oder bewege dich an einen Ort mit besserem Empfang.",
        status: "granted",
        issue: "timeout"
      };
    default:
      return {
        message: "Geolocation konnte nicht gelesen werden.",
        helpText: "",
        status: "not-requested",
        issue: "error"
      };
  }
}

export class GeoLocationService {
  constructor({ throttleMs = DEFAULT_THROTTLE_MS } = {}) {
    this.throttleMs = throttleMs;
    this.watchId = null;
    this.currentPosition = null;
    this.status = "not-requested";
    this.permissionState = "prompt";
    this.issue = null;
    this.message = "Standort noch nicht angefordert.";
    this.helpText = "Tippe auf 'Standort aktivieren', damit der Browser die Freigabe anfragt.";
    this.lastNotifyAt = 0;
    this.initialRequestPending = false;
    this.permissionStatus = null;
    this.subscribers = new Set();

    this.handlePermissionChange = this.handlePermissionChange.bind(this);
    this.handleWatchSuccess = this.handleWatchSuccess.bind(this);
    this.handleWatchError = this.handleWatchError.bind(this);

    this.initializePermissionStatus();
  }

  requestPermissionAndStart() {
    if (!hasSecureGeoContext()) {
      this.issue = "https-required";
      this.message = "Geolocation benoetigt HTTPS oder localhost.";
      this.helpText = "Oeffne die Seite ueber https:// oder localhost, damit der Browser Standortzugriff erlaubt.";
      this.notify();
      return false;
    }

    if (!navigator.geolocation) {
      this.issue = "unsupported";
      this.message = "Geolocation ist in diesem Browser nicht verfuegbar.";
      this.helpText = "";
      this.notify();
      return false;
    }

    if (this.watchId !== null) {
      this.status = "granted";
      this.issue = null;
      this.message = this.currentPosition
        ? "Geraetestandort verfuegbar."
        : "Standortfreigabe vorhanden. Position wird aktualisiert.";
      this.helpText = "";
      this.notify();
      return true;
    }

    if (this.initialRequestPending) {
      this.notify();
      return false;
    }

    if (this.permissionState === "denied") {
      this.status = "denied";
      this.issue = "permission-denied";
      this.message = "Standort verweigert - bitte im Browser aktivieren.";
      this.helpText = "Bitte aktiviere Standort in: Browser Einstellungen -> Standort -> Erlauben.";
      this.notify();
      return false;
    }

    this.initialRequestPending = true;
    this.status = "waiting";
    this.issue = null;
    this.message = "Warte auf Standortfreigabe.";
    this.helpText = "Bestaetige die Standortabfrage im Browser, damit Latitude und Longitude geladen werden.";
    this.notify();

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.handleInitialSuccess(position);
        },
        (error) => {
          this.handleRequestError(error);
        },
        INITIAL_REQUEST_OPTIONS
      );
      return true;
    } catch {
      this.initialRequestPending = false;
      this.issue = "error";
      this.message = "Geolocation konnte nicht gestartet werden.";
      this.helpText = "";
      if (this.permissionState !== "denied") {
        this.status = "not-requested";
      }
      this.notify();
      return false;
    }
  }

  stop() {
    this.stopWatch();
    this.initialRequestPending = false;
  }

  subscribe(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    this.subscribers.add(callback);
    callback(this.getSnapshot());
    return () => {
      this.subscribers.delete(callback);
    };
  }

  getStatus() {
    return this.status;
  }

  getCurrentPosition() {
    return this.currentPosition ? { ...this.currentPosition } : null;
  }

  getSnapshot() {
    return {
      status: this.status,
      permissionState: this.permissionState,
      issue: this.issue,
      message: this.message,
      helpText: this.helpText,
      position: this.getCurrentPosition(),
      watchActive: this.watchId !== null,
      requestPending: this.initialRequestPending
    };
  }

  async initializePermissionStatus() {
    if (!hasSecureGeoContext()) {
      this.issue = "https-required";
      this.message = "Geolocation benoetigt HTTPS oder localhost.";
      this.helpText = "Oeffne die Seite ueber https:// oder localhost, damit der Browser Standortzugriff erlaubt.";
      this.notify();
      return;
    }

    if (!navigator.geolocation) {
      this.issue = "unsupported";
      this.message = "Geolocation ist in diesem Browser nicht verfuegbar.";
      this.helpText = "";
      this.notify();
      return;
    }

    if (!navigator.permissions || typeof navigator.permissions.query !== "function") {
      this.notify();
      return;
    }

    try {
      this.permissionStatus = await navigator.permissions.query({ name: "geolocation" });
      this.permissionState = this.permissionStatus.state;

      if (typeof this.permissionStatus.addEventListener === "function") {
        this.permissionStatus.addEventListener("change", this.handlePermissionChange);
      } else {
        this.permissionStatus.onchange = this.handlePermissionChange;
      }

      this.applyPermissionState(this.permissionState);
    } catch {
      this.notify();
    }
  }

  handlePermissionChange() {
    if (!this.permissionStatus) {
      return;
    }

    this.permissionState = this.permissionStatus.state;
    this.applyPermissionState(this.permissionState);
  }

  applyPermissionState(nextState) {
    this.permissionState = nextState;

    if (this.issue === "https-required" || this.issue === "unsupported") {
      this.notify();
      return;
    }

    if (nextState === "denied") {
      this.stopWatch();
      this.initialRequestPending = false;
      this.status = "denied";
      this.issue = "permission-denied";
      this.message = "Standort verweigert - bitte im Browser aktivieren.";
      this.helpText = "Bitte aktiviere Standort in: Browser Einstellungen -> Standort -> Erlauben.";
      this.notify();
      return;
    }

    if (nextState === "granted") {
      this.status = "granted";
      this.issue = null;
      this.message = this.currentPosition
        ? "Geraetestandort verfuegbar."
        : "Standortfreigabe vorhanden. Tippe auf 'Standort aktivieren', um die Position zu laden.";
      this.helpText = "";
      this.notify();
      return;
    }

    if (this.initialRequestPending) {
      this.status = "waiting";
      this.issue = null;
      this.message = "Warte auf Standortfreigabe.";
      this.helpText = "Bestaetige die Standortabfrage im Browser, damit Latitude und Longitude geladen werden.";
    } else {
      this.status = "not-requested";
      this.issue = null;
      this.message = "Standort noch nicht angefordert.";
      this.helpText = "Tippe auf 'Standort aktivieren', damit der Browser die Freigabe anfragt.";
    }

    this.notify();
  }

  handleInitialSuccess(position) {
    this.initialRequestPending = false;
    this.handleSuccess(position, { forceNotify: true });
    this.startWatch();
  }

  handleWatchSuccess(position) {
    this.handleSuccess(position);
  }

  handleSuccess(position, { forceNotify = false } = {}) {
    this.currentPosition = buildGeoPosition(position);
    this.status = "granted";
    this.issue = null;
    this.message = "Geraetestandort verfuegbar.";
    this.helpText = "";

    const now = Date.now();
    if (!forceNotify && this.lastNotifyAt !== 0 && now - this.lastNotifyAt < this.throttleMs) {
      return;
    }

    this.lastNotifyAt = now;
    this.notify();
  }

  handleRequestError(error) {
    this.initialRequestPending = false;
    this.handleError(error);
  }

  handleWatchError(error) {
    this.handleError(error);
  }

  handleError(error) {
    const mapped = mapGeoError(error);

    if (mapped.status === "denied") {
      this.stopWatch();
      this.permissionState = "denied";
      this.status = "denied";
    } else if (this.permissionState === "granted" || this.currentPosition) {
      this.status = "granted";
    } else {
      this.status = mapped.status;
    }

    this.issue = mapped.issue;
    this.message = mapped.message;
    this.helpText = mapped.helpText;
    this.notify();
  }

  startWatch() {
    if (this.watchId !== null) {
      return true;
    }

    try {
      this.watchId = navigator.geolocation.watchPosition(
        this.handleWatchSuccess,
        this.handleWatchError,
        WATCH_OPTIONS
      );
      return true;
    } catch {
      this.issue = "error";
      this.message = "Live-Standort konnte nicht gestartet werden.";
      this.helpText = "";
      this.notify();
      return false;
    }
  }

  stopWatch() {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
    }

    this.watchId = null;
  }

  notify() {
    const snapshot = this.getSnapshot();
    for (const callback of this.subscribers) {
      callback(snapshot);
    }
  }
}
