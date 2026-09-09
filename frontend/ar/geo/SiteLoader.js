import { resolveAppUrl } from "../urlUtils.js";

const SITE_ID_ALIASES = Object.freeze({
  klimawochefhe: "klimawocheFHE"
});

function sanitizeSiteId(siteId) {
  if (typeof siteId !== "string") {
    return null;
  }

  const trimmed = siteId.trim();
  if (!trimmed || !/^[a-z0-9_-]+$/i.test(trimmed)) {
    return null;
  }

  return SITE_ID_ALIASES[trimmed.toLowerCase()] || trimmed;
}

function ensureFiniteNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`Site-Konfiguration ungueltig: ${label} fehlt oder ist keine Zahl.`);
  }

  return value;
}

function normalizeOrigin(origin) {
  if (origin == null) {
    return null;
  }

  if (typeof origin !== "object") {
    throw new Error("Site-Konfiguration ungueltig: origin muss ein Objekt sein.");
  }

  const latitude = Number.isFinite(origin.lat) ? origin.lat : origin.latitude;
  const longitude = Number.isFinite(origin.lon) ? origin.lon : origin.longitude;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    lat: ensureFiniteNumber(latitude, "origin.lat"),
    lon: ensureFiniteNumber(longitude, "origin.lon"),
    h: Number.isFinite(origin.h) ? origin.h : 0
  };
}

function normalizeOrientation(orientation) {
  return {
    yawDeg: Number.isFinite(orientation && orientation.yawDeg) ? orientation.yawDeg : 0
  };
}

function normalizeScene(scene) {
  if (scene == null) {
    return null;
  }

  if (typeof scene !== "object") {
    throw new Error("Site-Konfiguration ungueltig: scene muss ein Objekt sein.");
  }

  if (typeof scene.asset !== "string" || !scene.asset.trim()) {
    return null;
  }

  return {
    asset: resolveAppUrl(scene.asset.trim())
  };
}

function normalizeObjects(objects) {
  if (!Array.isArray(objects)) {
    return [];
  }

  return objects.map((objectConfig, index) => {
    const enu = objectConfig && objectConfig.enu ? objectConfig.enu : null;
    const offset = objectConfig && objectConfig.offset ? objectConfig.offset : null;
    const anchor =
      objectConfig && typeof objectConfig.anchor === "string" && objectConfig.anchor.trim()
        ? objectConfig.anchor.trim()
        : null;
    const normalizedOffset = {
      x: Number.isFinite(offset && offset.x) ? offset.x : Number.isFinite(enu && enu.e) ? enu.e : 0,
      y: Number.isFinite(offset && offset.y) ? offset.y : Number.isFinite(enu && enu.u) ? enu.u : 0,
      z: Number.isFinite(offset && offset.z) ? offset.z : Number.isFinite(enu && enu.n) ? enu.n : 0
    };

    return {
      id: typeof objectConfig.id === "string" && objectConfig.id.trim() ? objectConfig.id.trim() : `object-${index + 1}`,
      asset: typeof objectConfig.asset === "string" && objectConfig.asset.trim() ? resolveAppUrl(objectConfig.asset.trim()) : null,
      anchor,
      offset: normalizedOffset,
      enu: {
        e: normalizedOffset.x,
        n: normalizedOffset.z,
        u: normalizedOffset.y
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

function normalizePlacementTransform(transform) {
  if (transform == null) {
    return null;
  }

  if (typeof transform !== "object") {
    throw new Error("Site-Konfiguration ungueltig: placement.transform muss ein Objekt sein.");
  }

  const scaleSource = Number.isFinite(transform.scaleFactor) ? transform.scaleFactor : transform.scale;
  const rotationSource = Number.isFinite(transform.rotationDeg) ? transform.rotationDeg : transform.rotation;
  const position = transform.position && typeof transform.position === "object" ? transform.position : {};

  return {
    position: {
      x: Number.isFinite(position.x) ? position.x : 0,
      y: Number.isFinite(position.y) ? position.y : 0,
      z: Number.isFinite(position.z) ? position.z : 0
    },
    scaleFactor: Number.isFinite(scaleSource) ? scaleSource : 1,
    rotationDeg: Number.isFinite(rotationSource) ? rotationSource : 0,
    preserveSourceScale: transform.preserveSourceScale === true
  };
}

const INFO_BOARD_STYLE_FIELDS = Object.freeze([
  "backgroundColor",
  "textColor",
  "borderColor",
  "shadowColor",
  "fontFamily",
  "fontWeight",
  "fontSizePx",
  "minFontSizePx",
  "lineHeight",
  "paddingX",
  "paddingY",
  "borderWidth",
  "cornerRadius",
  "shadowBlur",
  "shadowOffsetY",
  "shadowPadding",
  "textureWidth",
  "maxTextureHeight"
]);

function normalizeInfoBoardStyle(style, index) {
  if (style == null) {
    return null;
  }
  if (typeof style !== "object" || Array.isArray(style)) {
    throw new Error(`Site-Konfiguration ungültig: infoBoards[${index}].style muss ein Objekt sein.`);
  }

  const normalized = {};
  for (const field of INFO_BOARD_STYLE_FIELDS) {
    const value = style[field];
    if (value === undefined) {
      continue;
    }
    if (field.endsWith("Color") || field === "fontFamily") {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(`Site-Konfiguration ungültig: infoBoards[${index}].style.${field} muss Text enthalten.`);
      }
      normalized[field] = value.trim();
    } else if (field === "fontWeight") {
      if (typeof value !== "string" && !Number.isFinite(value)) {
        throw new Error(`Site-Konfiguration ungültig: infoBoards[${index}].style.fontWeight ist ungültig.`);
      }
      normalized[field] = value;
    } else {
      normalized[field] = ensureFiniteNumber(
        value,
        `infoBoards[${index}].style.${field}`
      );
    }
  }
  return normalized;
}

function normalizeInfoBoards(infoBoards, expectedSceneId = null) {
  if (infoBoards == null) {
    return [];
  }
  if (!Array.isArray(infoBoards)) {
    throw new Error("Site-Konfiguration ungültig: infoBoards muss eine Liste sein.");
  }

  const ids = new Set();
  return infoBoards.map((board, index) => {
    if (!board || typeof board !== "object" || Array.isArray(board)) {
      throw new Error(`Site-Konfiguration ungültig: infoBoards[${index}] muss ein Objekt sein.`);
    }

    const id = typeof board.id === "string" ? board.id.trim() : "";
    if (!id || ids.has(id)) {
      throw new Error(`Site-Konfiguration ungültig: infoBoards[${index}] benötigt eine eindeutige ID.`);
    }
    ids.add(id);

    const text = typeof board.text === "string" ? board.text.trim() : "";
    if (!text) {
      throw new Error(`Site-Konfiguration ungültig: infoBoards[${index}].text darf nicht leer sein.`);
    }

    const configuredSceneId = typeof board.sceneId === "string" ? board.sceneId.trim() : "";
    const sceneId = configuredSceneId || expectedSceneId;
    if (!sceneId || (expectedSceneId && sceneId !== expectedSceneId)) {
      throw new Error(`Site-Konfiguration ungültig: infoBoards[${index}].sceneId passt nicht zum Szenario.`);
    }

    const offset = board.offset;
    if (!offset || typeof offset !== "object" || Array.isArray(offset)) {
      throw new Error(`Site-Konfiguration ungültig: infoBoards[${index}].offset muss ein Objekt sein.`);
    }

    const scaleFactor = Number.isFinite(board.scaleFactor) ? board.scaleFactor : 1;
    const widthMeters = Number.isFinite(board.widthMeters) ? board.widthMeters : 1.2;
    if (scaleFactor <= 0 || widthMeters <= 0) {
      throw new Error(`Site-Konfiguration ungültig: infoBoards[${index}] benötigt eine positive Skalierung und Breite.`);
    }

    return {
      id,
      text,
      sceneId,
      active: board.active !== false,
      offset: {
        x: ensureFiniteNumber(offset.x, `infoBoards[${index}].offset.x`),
        y: ensureFiniteNumber(offset.y, `infoBoards[${index}].offset.y`),
        z: ensureFiniteNumber(offset.z, `infoBoards[${index}].offset.z`)
      },
      rotationDeg: Number.isFinite(board.rotationDeg) ? board.rotationDeg : 0,
      scaleFactor,
      widthMeters,
      billboard: board.billboard !== false,
      referenceNode: typeof board.referenceNode === "string" && board.referenceNode.trim()
        ? board.referenceNode.trim()
        : null,
      provisional: board.provisional === true,
      style: normalizeInfoBoardStyle(board.style, index)
    };
  });
}

function normalizeObjectTransforms(transforms) {
  if (transforms == null) {
    return [];
  }

  if (!Array.isArray(transforms)) {
    throw new Error("Site-Konfiguration ungueltig: placement.objectTransforms muss eine Liste sein.");
  }

  const nodePaths = new Set();
  return transforms.map((transform, index) => {
    if (!transform || typeof transform !== "object") {
      throw new Error(`Site-Konfiguration ungueltig: placement.objectTransforms[${index}] muss ein Objekt sein.`);
    }

    const nodePath = typeof transform.nodePath === "string" ? transform.nodePath.trim() : "";
    if (!nodePath || nodePaths.has(nodePath)) {
      throw new Error("Site-Konfiguration ungueltig: Jeder Objekt-Transform benoetigt einen eindeutigen nodePath.");
    }
    nodePaths.add(nodePath);

    const position = transform.position && typeof transform.position === "object" ? transform.position : {};
    const scaleSource = Number.isFinite(transform.scaleFactor) ? transform.scaleFactor : transform.scale;
    const rotationSource = Number.isFinite(transform.rotationDeg) ? transform.rotationDeg : transform.rotation;
    return {
      nodePath,
      node: typeof transform.node === "string" && transform.node.trim() ? transform.node.trim() : null,
      position: {
        x: Number.isFinite(position.x) ? position.x : 0,
        y: Number.isFinite(position.y) ? position.y : 0,
        z: Number.isFinite(position.z) ? position.z : 0
      },
      scaleFactor: Number.isFinite(scaleSource) && scaleSource > 0 ? scaleSource : 1,
      rotationDeg: Number.isFinite(rotationSource) ? rotationSource : 0
    };
  });
}

function normalizeEditableNodes(nodes) {
  if (nodes == null) {
    return null;
  }

  if (!Array.isArray(nodes)) {
    throw new Error("Site-Konfiguration ungueltig: placement.editableNodes muss eine Liste sein.");
  }

  const nodeNames = new Set();
  return nodes.map((entry, index) => {
    const entryNodes = Array.isArray(entry && entry.nodes)
      ? entry.nodes
      : [entry && entry.node];
    const normalizedNodes = entryNodes.map((node) => typeof node === "string" ? node.trim() : "");
    if (
      normalizedNodes.length === 0 ||
      normalizedNodes.some((node) => !node || nodeNames.has(node)) ||
      new Set(normalizedNodes).size !== normalizedNodes.length
    ) {
      throw new Error(`Site-Konfiguration ungültig: placement.editableNodes[${index}] benötigt eindeutige node-/nodes-Werte.`);
    }
    normalizedNodes.forEach((node) => nodeNames.add(node));

    return {
      ...(normalizedNodes.length === 1 ? { node: normalizedNodes[0] } : { nodes: normalizedNodes }),
      label:
        entry && typeof entry.label === "string" && entry.label.trim()
          ? entry.label.trim()
          : normalizedNodes.join(" + ")
    };
  });
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
  const transform = normalizePlacementTransform(placement.transform);
  const objectTransforms = normalizeObjectTransforms(placement.objectTransforms);
  const editableNodes = normalizeEditableNodes(placement.editableNodes);
  const maxDistanceMeters = Number.isFinite(placement.maxDistanceMeters)
    ? placement.maxDistanceMeters
    : null;

  if (!asset && !target && !calibration && !transform && objectTransforms.length === 0 && maxDistanceMeters === null) {
    return null;
  }

  return {
    asset: resolveAppUrl(asset),
    target,
    calibration,
    transform,
    objectTransforms,
    editableNodes,
    maxDistanceMeters
  };
}

function normalizeScenarios(scenarios) {
  if (!Array.isArray(scenarios)) {
    return [];
  }

  const ids = new Set();
  const normalized = [];

  for (let index = 0; index < scenarios.length; index += 1) {
    const scenario = scenarios[index];
    if (!scenario || typeof scenario !== "object") {
      continue;
    }

    const id =
      typeof scenario.id === "string" && scenario.id.trim()
        ? sanitizeSiteId(scenario.id)
        : `scenario-${index + 1}`;
    if (!id || ids.has(id)) {
      throw new Error("Site-Konfiguration ungültig: Szenario-ID fehlt oder ist doppelt.");
    }

    ids.add(id);
    normalized.push({
      id,
      label:
        typeof scenario.label === "string" && scenario.label.trim()
          ? scenario.label.trim()
          : `Szenario ${index + 1}`,
      origin: normalizeOrigin(scenario.origin),
      orientation: scenario.orientation == null ? null : normalizeOrientation(scenario.orientation),
      scene: normalizeScene(scenario.scene),
      objects: normalizeObjects(scenario.objects),
      infoBoards: normalizeInfoBoards(scenario.infoBoards, id),
      placement: normalizePlacement(scenario.placement)
    });
  }

  return normalized;
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
    return resolveAppUrl(`public/sites/${encodeURIComponent(siteId)}.json`, this.location);
  }

  normalizeSite(siteId, rawConfig, sourceUrl) {
    return {
      id: siteId,
      sourceUrl,
      origin: normalizeOrigin(rawConfig.origin),
      orientation: normalizeOrientation(rawConfig.orientation),
      scene: normalizeScene(rawConfig.scene),
      objects: normalizeObjects(rawConfig.objects),
      infoBoards: normalizeInfoBoards(rawConfig.infoBoards),
      placement: normalizePlacement(rawConfig.placement),
      scenarios: normalizeScenarios(rawConfig.scenarios)
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
