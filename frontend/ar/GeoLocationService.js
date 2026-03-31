const DEFAULT_THROTTLE_MS = 1000;

function buildGeoPosition(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: position.coords.accuracy,
    timestamp: position.timestamp
  };
}

function mapGeoError(error) {
  if (!error || typeof error.code !== "number") {
    return "Geolocation konnte nicht gelesen werden.";
  }

  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Standortfreigabe wurde verweigert.";
    case error.POSITION_UNAVAILABLE:
      return "Geraetestandort ist aktuell nicht verfuegbar.";
    case error.TIMEOUT:
      return "Standortabfrage hat zu lange gedauert.";
    default:
      return "Geolocation konnte nicht gelesen werden.";
  }
}

export class GeoLocationService {
  constructor({ throttleMs = DEFAULT_THROTTLE_MS } = {}) {
    this.throttleMs = throttleMs;
    this.watchId = null;
    this.currentPosition = null;
    this.status = "idle";
    this.message = "Geolocation wird initialisiert.";
    this.lastNotifyAt = 0;
    this.subscribers = new Set();

    this.handleSuccess = this.handleSuccess.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  start() {
    if (!navigator.geolocation) {
      this.status = "unsupported";
      this.message = "Geolocation nicht verfuegbar.";
      this.notify();
      return false;
    }

    if (this.watchId !== null) {
      this.notify();
      return true;
    }

    this.status = "waiting";
    this.message = "Warte auf Geraetestandort.";
    this.notify();

    try {
      this.watchId = navigator.geolocation.watchPosition(this.handleSuccess, this.handleError, {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000
      });
      return true;
    } catch {
      this.status = "error";
      this.message = "Geolocation konnte nicht gestartet werden.";
      this.notify();
      return false;
    }
  }

  stop() {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
    }

    this.watchId = null;
  }

  getCurrentPosition() {
    return this.currentPosition ? { ...this.currentPosition } : null;
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

  handleSuccess(position) {
    this.currentPosition = buildGeoPosition(position);
    this.status = "ready";
    this.message = "Geraetestandort verfuegbar.";

    const now = Date.now();
    if (this.lastNotifyAt !== 0 && now - this.lastNotifyAt < this.throttleMs) {
      return;
    }

    this.lastNotifyAt = now;
    this.notify();
  }

  handleError(error) {
    this.status = error && error.code === error.PERMISSION_DENIED ? "blocked" : "error";
    this.message = mapGeoError(error);
    this.notify();
  }

  getSnapshot() {
    return {
      status: this.status,
      message: this.message,
      position: this.getCurrentPosition()
    };
  }

  notify() {
    const snapshot = this.getSnapshot();
    for (const callback of this.subscribers) {
      callback(snapshot);
    }
  }
}
