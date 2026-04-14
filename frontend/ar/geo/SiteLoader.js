function sanitizeSiteId(siteId) {
  if (typeof siteId !== "string") {
    return null;
  }

  const trimmed = siteId.trim();
  if (!trimmed || !/^[a-z0-9_-]+$/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function ensureFiniteNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`Site-Konfiguration ungueltig: ${label} fehlt oder ist keine Zahl.`);
  }

  return value;
}

function normalizeOrigin(origin) {
  if (!origin || typeof origin !== "object") {
    throw new Error("Site-Konfiguration ungueltig: origin fehlt.");
  }

  return {
    lat: ensureFiniteNumber(origin.lat, "origin.lat"),
    lon: ensureFiniteNumber(origin.lon, "origin.lon"),
    h: Number.isFinite(origin.h) ? origin.h : 0
  };
}

function normalizeOrientation(orientation) {
  return {
    yawDeg: Number.isFinite(orientation && orientation.yawDeg) ? orientation.yawDeg : 0
  };
}

function normalizeScene(scene) {
  if (!scene || typeof scene.asset !== "string" || !scene.asset.trim()) {
    throw new Error("Site-Konfiguration ungueltig: scene.asset fehlt.");
  }

  return {
    asset: scene.asset.trim()
  };
}

function normalizeObjects(objects) {
  if (!Array.isArray(objects)) {
    return [];
  }

  return objects.map((objectConfig, index) => {
    const enu = objectConfig && objectConfig.enu ? objectConfig.enu : {};
    return {
      id: typeof objectConfig.id === "string" && objectConfig.id.trim() ? objectConfig.id.trim() : `object-${index + 1}`,
      enu: {
        e: Number.isFinite(enu.e) ? enu.e : 0,
        n: Number.isFinite(enu.n) ? enu.n : 0,
        u: Number.isFinite(enu.u) ? enu.u : 0
      }
    };
  });
}

function normalizePlacementTarget(target) {
  if (!target || typeof target !== "object") {
    return null;
  }

  const latitude = Number.isFinite(target.lat) ? target.lat : target.latitude;
  const longitude = Number.isFinite(target.lon) ? target.lon : target.longitude;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Site-Konfiguration ungueltig: placement.target.lat/lon fehlt oder ist keine Zahl.");
  }

  return {
    lat: latitude,
    lon: longitude
  };
}

function normalizePlacementCalibration(calibration) {
  if (calibration == null) {
    return null;
  }

  if (typeof calibration !== "object") {
    throw new Error("Site-Konfiguration ungueltig: placement.calibration muss ein Objekt sein.");
  }

  const eastMeters = Number.isFinite(calibration.eastMeters) ? calibration.eastMeters : 0;
  const northMeters = Number.isFinite(calibration.northMeters) ? calibration.northMeters : 0;
  const yawDeg = Number.isFinite(calibration.yawDeg) ? calibration.yawDeg : 0;

  return {
    eastMeters,
    northMeters,
    yawDeg
  };
}

function normalizePlacement(placement) {
  if (placement == null) {
    return null;
  }

  if (typeof placement !== "object") {
    throw new Error("Site-Konfiguration ungueltig: placement muss ein Objekt sein.");
  }

  const asset =
    typeof placement.asset === "string" && placement.asset.trim()
      ? placement.asset.trim()
      : null;
  const target = normalizePlacementTarget(placement.target);
  const calibration = normalizePlacementCalibration(placement.calibration);
  const maxDistanceMeters = Number.isFinite(placement.maxDistanceMeters)
    ? placement.maxDistanceMeters
    : null;

  if (!asset && !target && !calibration && maxDistanceMeters === null) {
    return null;
  }

  return {
    asset,
    target,
    calibration,
    maxDistanceMeters
  };
}

export class SiteLoader {
  constructor({ locationRef = window.location, fetchImpl = window.fetch.bind(window) } = {}) {
    this.location = locationRef;
    this.fetchImpl = fetchImpl;
  }

  getRequestedSiteId() {
    const params = new URLSearchParams(this.location.search);
    return sanitizeSiteId(params.get("site"));
  }

  buildSiteUrl(siteId) {
    return `/public/sites/${encodeURIComponent(siteId)}.json`;
  }

  normalizeSite(siteId, rawConfig, sourceUrl) {
    return {
      id: siteId,
      sourceUrl,
      origin: normalizeOrigin(rawConfig.origin),
      orientation: normalizeOrientation(rawConfig.orientation),
      scene: normalizeScene(rawConfig.scene),
      objects: normalizeObjects(rawConfig.objects),
      placement: normalizePlacement(rawConfig.placement)
    };
  }

  async loadSite(siteId) {
    const normalizedSiteId = sanitizeSiteId(siteId);
    if (!normalizedSiteId) {
      throw new Error("Ungueltiger Site-Parameter.");
    }

    const sourceUrl = this.buildSiteUrl(normalizedSiteId);
    const response = await this.fetchImpl(sourceUrl, {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(`Site-Konfiguration konnte nicht geladen werden (${response.status}).`);
    }

    const rawConfig = await response.json();
    return this.normalizeSite(normalizedSiteId, rawConfig, sourceUrl);
  }

  async loadFromQuery() {
    const siteId = this.getRequestedSiteId();
    if (!siteId) {
      return null;
    }

    return this.loadSite(siteId);
  }
}
