import * as THREE from "three";
import { SceneManager } from "./SceneManager.js";
import { ARSessionManager } from "./ARSessionManager.js";
import { HitTestManager } from "./HitTestManager.js";
import { PoseStabilizer } from "./PoseStabilizer.js";
import { PlacementController, PlacementMode } from "./PlacementController.js";
import { UIController } from "./UIController.js";
import { GeoLocationService } from "./GeoLocationService.js";
import { HeadingService } from "./HeadingService.js";
import { SiteLoader } from "./geo/SiteLoader.js";
import { SensorFusion } from "./geo/SensorFusion.js";
import { GeoSceneManager } from "./geo/GeoSceneManager.js";

const ExperienceMode = Object.freeze({
  XR: "xr",
  GEO_SENSOR: "geo-sensor"
});

const PlacementUIModel = Object.freeze({
  FREE: "free",
  GEO_LOCAL: "geo-local",
  GEO_GLOBAL: "geo-global"
});
const GEOLOCATION_PERMISSION_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15000
};
const MAX_GEO_ORIGIN_ACCURACY_METERS = 12;
const MIN_GEO_SITE_TOLERANCE_METERS = 3;
const MAX_GEO_SITE_TOLERANCE_METERS = 100;
const DEFAULT_GEO_SITE_TOLERANCE_METERS = 100;
const GEO_OFFSET_LIMIT_METERS = 20;
const MIN_GEO_SCALE_FACTOR = 1;
const MAX_GEO_SCALE_FACTOR = 3;

function normalizeExperienceMode(mode) {
  return mode === ExperienceMode.GEO_SENSOR ? ExperienceMode.GEO_SENSOR : ExperienceMode.XR;
}

function normalizePlacementUiMode(mode) {
  if (mode === PlacementUIModel.GEO_LOCAL || mode === PlacementUIModel.GEO_GLOBAL) {
    return mode;
  }

  return PlacementUIModel.FREE;
}

function mapPlacementUiModeToControllerMode(mode) {
  return mode === PlacementUIModel.GEO_LOCAL || mode === PlacementUIModel.GEO_GLOBAL
    ? PlacementMode.GEO
    : PlacementMode.FREE;
}

function toMessage(error, fallbackMessage = "unbekannter Fehler") {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

function toCameraStartFeedback(error) {
  const detail = toMessage(error);
  if (error && typeof error === "object" && "name" in error) {
    switch (error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return {
          message: "Kamerazugriff verweigert.",
          hint: "Bitte Kamera-Berechtigung im Browser aktivieren und den Geo-Modus erneut starten."
        };
      case "NotFoundError":
      case "DevicesNotFoundError":
        return {
          message: "Keine Kamera verfuegbar.",
          hint: "Auf diesem Geraet wurde keine geeignete Kamera gefunden."
        };
      case "NotReadableError":
      case "TrackStartError":
        return {
          message: "Kamera kann aktuell nicht verwendet werden.",
          hint: "Pruefe, ob die Kamera bereits von einer anderen App oder Browser-Ansicht genutzt wird."
        };
      case "OverconstrainedError":
      case "ConstraintNotSatisfiedError":
        return {
          message: "Kamera-Start fehlgeschlagen.",
          hint: "Die angeforderte Rueckkamera konnte mit diesem Browser nicht geoeffnet werden."
        };
      default:
        break;
    }
  }

  return {
    message: `Kamerazugriff fehlgeschlagen: ${detail}`,
    hint: "Der Geo-Modus benoetigt eine funktionierende Kamerafreigabe."
  };
}

function toGeolocationStartFeedback(error) {
  if (error && typeof error === "object" && "issue" in error) {
    switch (error.issue) {
      case "https-required":
        return {
          message: "Standortzugriff fehlgeschlagen.",
          hint: "Der Geo-Modus benoetigt HTTPS oder localhost."
        };
      case "geolocation-unsupported":
        return {
          message: "Standortzugriff fehlgeschlagen.",
          hint: "Geolocation ist in diesem Browser nicht verfuegbar."
        };
      default:
        break;
    }
  }

  switch (error ? error.code : null) {
    case 1:
      return {
        message: "Standortzugriff verweigert.",
        hint: "Bitte Standort-Berechtigung im Browser aktivieren und den Geo-Modus erneut starten."
      };
    case 2:
      return {
        message: "Standortzugriff fehlgeschlagen.",
        hint: "Pruefe GPS, Netzverbindung und freie Sicht zum Himmel."
      };
    case 3:
      return {
        message: "Standortzugriff fehlgeschlagen.",
        hint: "Bewege dich an einen Ort mit besserem GPS-Empfang und starte den Geo-Modus erneut."
      };
    default:
      return {
        message: "Standortzugriff fehlgeschlagen.",
        hint: "Der Geo-Modus benoetigt eine verfuegbare Standortfreigabe."
      };
  }
}

function toGeoCoord(position) {
  if (!position) {
    return null;
  }

  return {
    latitude: position.latitude,
    longitude: position.longitude
  };
}

function normalizeSiteAssetUrl(url) {
  if (typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  const hasProtocol = /^([a-z]+:)?\/\//i.test(trimmed);
  if (hasProtocol || trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return trimmed;
  }

  return `/${trimmed}`;
}

function toAssetLabel(url, fallbackLabel = "Site-Modell") {
  const normalized = normalizeSiteAssetUrl(url);
  if (!normalized) {
    return fallbackLabel;
  }

  const parts = normalized.split("/");
  const filename = parts[parts.length - 1];
  return filename || fallbackLabel;
}

function clampSiteToleranceMeters(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_GEO_SITE_TOLERANCE_METERS;
  }

  return Math.min(Math.max(value, MIN_GEO_SITE_TOLERANCE_METERS), MAX_GEO_SITE_TOLERANCE_METERS);
}

function clampGeoOffsetMeters(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, -GEO_OFFSET_LIMIT_METERS), GEO_OFFSET_LIMIT_METERS);
}

function clampGeoScaleFactor(value) {
  if (!Number.isFinite(value)) {
    return MIN_GEO_SCALE_FACTOR;
  }

  return Math.min(Math.max(value, MIN_GEO_SCALE_FACTOR), MAX_GEO_SCALE_FACTOR);
}

function normalizeRotationDeg(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function normalizeGeoCalibration(calibration) {
  if (!calibration || typeof calibration !== "object") {
    return {
      eastMeters: 0,
      northMeters: 0,
      yawDeg: 0
    };
  }

  return {
    eastMeters: Number.isFinite(calibration.eastMeters) ? calibration.eastMeters : 0,
    northMeters: Number.isFinite(calibration.northMeters) ? calibration.northMeters : 0,
    yawDeg: Number.isFinite(calibration.yawDeg) ? calibration.yawDeg : 0
  };
}

function mergeGeoCalibration(baseCalibration, offsetState) {
  const useSiteCalibration = !offsetState || offsetState.useSiteCalibration !== false;
  const effectiveBaseCalibration =
    useSiteCalibration && baseCalibration && typeof baseCalibration === "object"
      ? baseCalibration
      : null;
  const base = normalizeGeoCalibration(effectiveBaseCalibration);
  const hasBaseCalibration = Boolean(effectiveBaseCalibration);
  const hasOffset = Boolean(offsetState && offsetState.enabled);

  if (!hasBaseCalibration && !hasOffset) {
    return null;
  }

  return {
    eastMeters: base.eastMeters + (hasOffset ? clampGeoOffsetMeters(offsetState.eastMeters) : 0),
    northMeters: base.northMeters + (hasOffset ? clampGeoOffsetMeters(offsetState.northMeters) : 0),
    yawDeg: base.yawDeg
  };
}

function normalizePlacementTransform(transform) {
  if (!transform || typeof transform !== "object") {
    return {
      scaleFactor: 1,
      rotationDeg: 0
    };
  }

  const scaleSource =
    Number.isFinite(transform.scaleFactor) ? transform.scaleFactor : transform.scale;
  const rotationSource =
    Number.isFinite(transform.rotationDeg) ? transform.rotationDeg : transform.rotation;

  return {
    scaleFactor: clampGeoScaleFactor(scaleSource),
    rotationDeg: normalizeRotationDeg(rotationSource)
  };
}

function mergePlacementTransform(baseTransform, uiState) {
  const base = normalizePlacementTransform(baseTransform);
  const hasBaseTransform = Boolean(baseTransform && typeof baseTransform === "object");
  const hasScaleOverride = Boolean(uiState && uiState.scaleEnabled);
  const hasRotationOverride = Boolean(uiState && uiState.rotationEnabled);

  if (!hasBaseTransform && !hasScaleOverride && !hasRotationOverride) {
    return null;
  }

  return {
    scaleFactor: hasScaleOverride ? clampGeoScaleFactor(uiState.scaleFactor) : base.scaleFactor,
    rotationDeg: hasRotationOverride ? normalizeRotationDeg(uiState.rotationDeg) : base.rotationDeg
  };
}

function buildCameraState(viewerPose) {
  if (!viewerPose || !viewerPose.transform) {
    return null;
  }

  return buildCameraStateFromPose({
    position: new THREE.Vector3(
      viewerPose.transform.position.x,
      viewerPose.transform.position.y,
      viewerPose.transform.position.z
    ),
    quaternion: new THREE.Quaternion(
      viewerPose.transform.orientation.x,
      viewerPose.transform.orientation.y,
      viewerPose.transform.orientation.z,
      viewerPose.transform.orientation.w
    )
  });
}

function buildCameraStateFromPose(pose) {
  if (!pose || !pose.position || !pose.quaternion) {
    return null;
  }

  const position = pose.position.clone();
  const orientation = pose.quaternion.clone();
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(orientation).normalize();

  return {
    position,
    direction
  };
}

export class ARApp {
  constructor() {
    this.document = document;
    this.container = this.document.getElementById("render-root");
    this.ui = new UIController(this.document);
    this.sceneManager = new SceneManager({
      container: this.container
    });
    this.geoSceneManager = new GeoSceneManager({
      scene: this.sceneManager.getScene()
    });
    this.hitTestManager = new HitTestManager();
    this.poseStabilizer = new PoseStabilizer();
    this.geoLocationService = new GeoLocationService();
    this.headingService = new HeadingService();
    this.siteLoader = new SiteLoader();
    this.sensorFusion = new SensorFusion();
    this.placementController = null;
    this.arSessionManager = null;
    this.lastFrameTimeMs = 0;
    this.activeSurfaceState = null;
    this.lastCameraState = null;
    this.isUIInteracting = false;
    this.isTextInputActive = false;
    this.siteConfig = null;
    this.selectedExperienceMode = ExperienceMode.XR;
    this.selectedPlacementMode = PlacementUIModel.FREE;
    this.lastXRPlacementMode = PlacementUIModel.FREE;
    this.geoHeadingReferenceEnabled = false;
    this.geoSensorActive = false;
    this.activePlacementAssetSource = "default";
    this.geoOffsetUiState = {
      useSiteCalibration: true,
      enabled: false,
      eastMeters: 0,
      northMeters: 0,
      scaleEnabled: false,
      scaleFactor: 1,
      rotationEnabled: false,
      rotationDeg: 0
    };

    this.handleFrame = this.handleFrame.bind(this);
    this.handleSessionEnded = this.handleSessionEnded.bind(this);
    this.handleSelect = this.handleSelect.bind(this);
  }

  async init() {
    await this.sceneManager.initialize();
    await this.loadSiteConfiguration();

    this.placementController = new PlacementController({
      scene: this.sceneManager.getScene()
    });

    const assetInfo = await this.sceneManager.createPlacementAsset();
    this.placementController.setAsset(assetInfo.object);

    this.ui.setAssetLabel(assetInfo.label);
    this.activePlacementAssetSource = "default";
    this.ui.setExperienceMode(this.selectedExperienceMode);
    this.ui.setPlacementMode(this.selectedPlacementMode);
    this.ui.setGeoHeadingReferenceEnabled(this.geoHeadingReferenceEnabled);
    this.applySiteGeoTargetFromConfig({ force: true });
    this.applySiteGeoCalibrationFromConfig({ force: true });
    this.applySitePlacementTransformFromConfig({ force: true });
    this.applySiteLocalObjectsFromConfig({ force: true });
    this.ui.setGeoTargetInputs(this.placementController.getGeoTarget());
    this.ui.bindGeoLocationService(this.geoLocationService);
    this.ui.bindSensorFusion(this.sensorFusion);

    if (assetInfo.usedPlaceholder) {
      this.ui.setHint("tree.glb konnte nicht geladen werden. Platzhalter aktiv.");
    } else {
      this.ui.setHint("Fallback-3D-Ansicht aktiv. Im freien Modus platzierst du per Reticle, im Geo-Local-Modus per QR-basiertem lokalen Offset.");
    }

    this.arSessionManager = new ARSessionManager({
      renderer: this.sceneManager.getRenderer(),
      overlayRoot: this.document.getElementById("hud"),
      onSessionEnded: this.handleSessionEnded,
      onSelect: this.handleSelect
    });

    this.ui.bindActions({
      onStartAR: () => this.startSelectedExperience(),
      onPlace: () => this.placeObjectFromUI(),
      onResetPlacement: () => this.resetPlacement(),
      onStopAR: () => this.stopActiveExperience(),
      onApplyGeoTarget: (coord) => this.applyGeoTarget(coord),
      onModeChange: (mode) => this.applyPlacementMode(mode),
      onExperienceModeChange: (mode) => this.applyExperienceMode(mode),
      onRequestGeolocation: () => this.requestGeoLocation(),
      onCalibrateHeading: () => this.calibrateGeoHeading(),
      onGeoHeadingReferenceToggle: (enabled) => this.applyGeoHeadingReferenceMode(enabled),
      onGeoOffsetToggle: (state) => this.applyGeoOffsetState(state),
      onGeoOffsetChange: (state) => this.applyGeoOffsetState(state),
      onGeoOffsetAdopt: (state) => this.adoptGeoOffsetAsSiteCalibration(state),
      onGeoOffsetReset: () => this.resetGeoOffsetState(),
      onUIInteractionChange: (isInteracting) => this.handleUIInteractionChange(isInteracting),
      onTextInputActiveChange: (isActive) => this.handleTextInputActiveChange(isActive)
    });
    this.ui.setGeoOffsetControlState(this.geoOffsetUiState);

    const support = await this.arSessionManager.checkSupport();
    this.ui.setSupportState(support.available, support.message);
    this.ui.setSessionState(false, support.available ? "AR kann gestartet werden." : support.message);
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.syncDebugPanels();
    this.syncCanvasPointerState();

    if (this.siteConfig) {
      this.ui.setMessage(`Site '${this.siteConfig.id}' geladen.`);
      this.ui.setHint("QR-Site geladen. AR (WebXR) mit Geo-Local ist vorausgewaehlt.");
    }

    this.sceneManager.setAnimationLoop(this.handleFrame);
  }

  async loadSiteConfiguration() {
    try {
      this.siteConfig = await this.siteLoader.loadFromQuery();
    } catch (error) {
      this.siteConfig = null;
      this.ui.setMessage(`Site-Laden fehlgeschlagen: ${toMessage(error)}`);
      this.ui.setHint("Fallback-3D-Ansicht aktiv. Geo-Global-Modus ist ohne gueltige Site-Konfiguration nicht verfuegbar.");
      return;
    }

    if (!this.siteConfig) {
      return;
    }

    try {
      await this.geoSceneManager.loadSite(this.siteConfig);
      this.selectedExperienceMode = ExperienceMode.XR;
      this.selectedPlacementMode = PlacementUIModel.GEO_LOCAL;
      this.lastXRPlacementMode = PlacementUIModel.GEO_LOCAL;
    } catch (error) {
      this.siteConfig = null;
      this.ui.setMessage(`Site-Szene konnte nicht geladen werden: ${toMessage(error)}`);
      this.ui.setHint("Fallback-3D-Ansicht aktiv. Geo-Global-Modus bleibt deaktiviert.");
    }
  }

  getSiteGeoPlacementConfig() {
    if (!this.siteConfig) {
      return null;
    }

    const sitePlacement =
      this.siteConfig.placement && typeof this.siteConfig.placement === "object"
        ? this.siteConfig.placement
        : null;
    const targetSource =
      sitePlacement && sitePlacement.target && typeof sitePlacement.target === "object"
        ? sitePlacement.target
        : this.siteConfig.origin;
    const latitude = Number.isFinite(targetSource && targetSource.lat)
      ? targetSource.lat
      : targetSource && Number.isFinite(targetSource.latitude)
        ? targetSource.latitude
        : null;
    const longitude = Number.isFinite(targetSource && targetSource.lon)
      ? targetSource.lon
      : targetSource && Number.isFinite(targetSource.longitude)
        ? targetSource.longitude
        : null;
    const targetCoord =
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? {
            latitude,
            longitude
          }
        : null;

    const preferredAssetUrl =
      sitePlacement && typeof sitePlacement.asset === "string" && sitePlacement.asset.trim()
        ? sitePlacement.asset.trim()
        : this.siteConfig.scene && typeof this.siteConfig.scene.asset === "string"
          ? this.siteConfig.scene.asset
          : null;
    const assetUrl = normalizeSiteAssetUrl(preferredAssetUrl);
    const toleranceMeters = clampSiteToleranceMeters(
      sitePlacement && Number.isFinite(sitePlacement.maxDistanceMeters)
        ? sitePlacement.maxDistanceMeters
        : DEFAULT_GEO_SITE_TOLERANCE_METERS
    );

    return {
      targetCoord,
      assetUrl,
      assetLabel: toAssetLabel(assetUrl),
      calibration:
        sitePlacement && sitePlacement.calibration && typeof sitePlacement.calibration === "object"
          ? sitePlacement.calibration
          : null,
      transform:
        sitePlacement && sitePlacement.transform && typeof sitePlacement.transform === "object"
          ? sitePlacement.transform
          : null,
      toleranceMeters
    };
  }

  isGeoPlacementModeSelected() {
    return (
      this.selectedPlacementMode === PlacementUIModel.GEO_LOCAL ||
      this.selectedPlacementMode === PlacementUIModel.GEO_GLOBAL
    );
  }

  isGeoLocalHeadingReferenceEnabled() {
    return this.geoHeadingReferenceEnabled && this.selectedPlacementMode === PlacementUIModel.GEO_LOCAL;
  }

  hasGeoLocalHeading() {
    return Number.isFinite(this.headingService.getHeadingRad());
  }

  applyGeoHeadingReferenceMode(enabled) {
    if (this.geoSensorActive || (this.arSessionManager && this.arSessionManager.isActive())) {
      this.ui.setMessage("Kompassbezug ist nur moeglich, wenn kein AR- oder Geo-Modus laeuft.");
      this.ui.setGeoHeadingReferenceEnabled(this.geoHeadingReferenceEnabled);
      return false;
    }

    this.geoHeadingReferenceEnabled = Boolean(enabled);
    this.ui.setGeoHeadingReferenceEnabled(this.geoHeadingReferenceEnabled);

    if (this.geoHeadingReferenceEnabled) {
      this.ui.setMessage("Geo-Local mit Kompassbezug aktiviert.");
      this.ui.setHint("X/Z-Offsets werden beim naechsten Geo-Local-Start als Ost/Nord-Meter interpretiert.");
    } else {
      this.ui.setMessage("Geo-Local mit Kompassbezug deaktiviert.");
      this.ui.setHint("X/Z-Offsets folgen beim naechsten Geo-Local-Start wieder der lokalen Blickrichtung.");
    }

    return true;
  }

  async ensureGeoLocalHeadingPermissionFromUserGesture() {
    if (!this.isGeoLocalHeadingReferenceEnabled()) {
      return true;
    }

    try {
      const granted = await this.headingService.requestPermission();
      if (!granted) {
        this.ui.setSessionState(false, "Kompass-Freigabe verweigert.");
        this.ui.setHint(
          "Fuer echten Nord/Ost-Bezug im Geo-Local-Modus muss der Browser Zugriff auf Orientierungssensoren erlauben."
        );
        return false;
      }
    } catch (_error) {
      this.ui.setSessionState(false, "Kompass-Freigabe verweigert.");
      this.ui.setHint(
        "Fuer echten Nord/Ost-Bezug im Geo-Local-Modus muss der Browser Zugriff auf Orientierungssensoren erlauben."
      );
      return false;
    }

    await this.headingService.waitForHeading(250);
    return true;
  }

  applySiteLocalObjectsFromConfig({ force = false } = {}) {
    if (!this.placementController) {
      return false;
    }

    if (!force && !this.isGeoPlacementModeSelected()) {
      return false;
    }

    const siteObjects =
      this.siteConfig && Array.isArray(this.siteConfig.objects) ? this.siteConfig.objects : null;
    this.placementController.setGeoObjects(siteObjects);
    return Array.isArray(siteObjects) && siteObjects.length > 0;
  }

  applySiteGeoTargetFromConfig({ force = false } = {}) {
    if (!this.placementController || !this.siteConfig) {
      return false;
    }

    const placementConfig = this.getSiteGeoPlacementConfig();
    if (!placementConfig || !placementConfig.targetCoord) {
      return false;
    }

    if (!force && this.selectedPlacementMode !== PlacementUIModel.GEO_GLOBAL) {
      return false;
    }

    const accepted = this.placementController.setGeoTarget(placementConfig.targetCoord);
    if (!accepted) {
      return false;
    }

    this.ui.setGeoTargetInputs(this.placementController.getGeoTarget());
    return true;
  }

  applySiteGeoCalibrationFromConfig({ force = false } = {}) {
    if (!this.placementController) {
      return false;
    }

    if (!force && !this.isGeoPlacementModeSelected()) {
      this.placementController.setGeoCalibration(null);
      return false;
    }

    const placementConfig = this.getSiteGeoPlacementConfig();
    const baseCalibration = placementConfig ? placementConfig.calibration : null;
    const effectiveCalibration = mergeGeoCalibration(baseCalibration, this.geoOffsetUiState);
    this.placementController.setGeoCalibration(effectiveCalibration);
    return Boolean(effectiveCalibration);
  }

  applySitePlacementTransformFromConfig({ force = false } = {}) {
    if (!this.placementController) {
      return false;
    }

    if (!force && !this.isGeoPlacementModeSelected()) {
      this.placementController.setPlacementTransform(null);
      return false;
    }

    const placementConfig = this.getSiteGeoPlacementConfig();
    const baseTransform = placementConfig ? placementConfig.transform : null;
    const effectiveTransform = mergePlacementTransform(baseTransform, this.geoOffsetUiState);
    this.placementController.setPlacementTransform(effectiveTransform);
    return Boolean(effectiveTransform);
  }

  applyGeoOffsetState(state = {}) {
    const nextState = {
      useSiteCalibration:
        typeof state.useSiteCalibration === "boolean"
          ? state.useSiteCalibration
          : this.geoOffsetUiState.useSiteCalibration,
      enabled:
        typeof state.enabled === "boolean"
          ? state.enabled
          : this.geoOffsetUiState.enabled,
      eastMeters:
        state.eastMeters != null
          ? clampGeoOffsetMeters(Number.parseFloat(state.eastMeters))
          : this.geoOffsetUiState.eastMeters,
      northMeters:
        state.northMeters != null
          ? clampGeoOffsetMeters(Number.parseFloat(state.northMeters))
          : this.geoOffsetUiState.northMeters,
      scaleEnabled:
        typeof state.scaleEnabled === "boolean"
          ? state.scaleEnabled
          : this.geoOffsetUiState.scaleEnabled,
      scaleFactor:
        state.scaleFactor != null
          ? clampGeoScaleFactor(Number.parseFloat(state.scaleFactor))
          : this.geoOffsetUiState.scaleFactor,
      rotationEnabled:
        typeof state.rotationEnabled === "boolean"
          ? state.rotationEnabled
          : this.geoOffsetUiState.rotationEnabled,
      rotationDeg:
        state.rotationDeg != null
          ? normalizeRotationDeg(Number.parseFloat(state.rotationDeg))
          : this.geoOffsetUiState.rotationDeg
    };

    this.geoOffsetUiState = nextState;
    this.ui.setGeoOffsetControlState(nextState);
    this.syncGeoAdjustmentsAfterOffsetChange();
    return { ...nextState };
  }

  resetGeoOffsetState() {
    return this.applyGeoOffsetState({
      useSiteCalibration: true,
      enabled: false,
      eastMeters: 0,
      northMeters: 0,
      scaleEnabled: false,
      scaleFactor: 1,
      rotationEnabled: false,
      rotationDeg: 0
    });
  }

  adoptGeoOffsetAsSiteCalibration(offsetState = null) {
    if (!this.siteConfig) {
      this.ui.setMessage("Keine Site geladen. JSON-Kalibrierung kann nicht uebernommen werden.");
      return null;
    }

    const state = offsetState && typeof offsetState === "object" ? offsetState : this.geoOffsetUiState;
    if (!state.enabled) {
      this.ui.setMessage("Aktiviere zuerst den Test-Offset, um ihn als JSON-Kalibrierung zu uebernehmen.");
      return null;
    }

    const sitePlacement =
      this.siteConfig.placement && typeof this.siteConfig.placement === "object"
        ? this.siteConfig.placement
        : {};
    if (!this.siteConfig.placement || typeof this.siteConfig.placement !== "object") {
      this.siteConfig.placement = sitePlacement;
    }

    const baseCalibration = normalizeGeoCalibration(sitePlacement.calibration);
    const adoptedCalibration = {
      eastMeters: baseCalibration.eastMeters + clampGeoOffsetMeters(state.eastMeters),
      northMeters: baseCalibration.northMeters + clampGeoOffsetMeters(state.northMeters),
      yawDeg: baseCalibration.yawDeg
    };
    this.siteConfig.placement.calibration = adoptedCalibration;

    const nextState = this.applyGeoOffsetState({
      ...this.geoOffsetUiState,
      useSiteCalibration: true,
      enabled: false,
      eastMeters: 0,
      northMeters: 0
    });

    this.ui.setMessage(
      `JSON-Kalibrierung uebernommen: E ${adoptedCalibration.eastMeters.toFixed(2)} m, N ${adoptedCalibration.northMeters.toFixed(2)} m.`
    );
    this.ui.setHint("Druecke 'Neu platzieren', um mit der uebernommenen JSON-Kalibrierung zu testen.");
    return nextState;
  }

  syncGeoAdjustmentsAfterOffsetChange() {
    if (!this.placementController) {
      return;
    }

    if (!this.isGeoPlacementModeSelected()) {
      return;
    }

    this.applySiteGeoCalibrationFromConfig({ force: true });
    this.applySitePlacementTransformFromConfig({ force: true });
  }

  getGeoSiteToleranceMeters() {
    const placementConfig = this.getSiteGeoPlacementConfig();
    return placementConfig ? placementConfig.toleranceMeters : DEFAULT_GEO_SITE_TOLERANCE_METERS;
  }

  isWithinGeoSiteTolerance(distanceMeters) {
    return Number.isFinite(distanceMeters) && distanceMeters <= this.getGeoSiteToleranceMeters();
  }

  getCurrentGeoAccuracyMeters() {
    const livePosition = this.geoLocationService.getCurrentPosition();
    if (livePosition && Number.isFinite(livePosition.accuracyMeters)) {
      return livePosition.accuracyMeters;
    }

    const sensorSnapshot = this.sensorFusion.getSnapshot();
    const sensorPosition = sensorSnapshot && sensorSnapshot.position ? sensorSnapshot.position : null;
    if (sensorPosition && Number.isFinite(sensorPosition.accuracyMeters)) {
      return sensorPosition.accuracyMeters;
    }

    return null;
  }

  hasAcceptableGeoAccuracy() {
    const accuracyMeters = this.getCurrentGeoAccuracyMeters();
    return !Number.isFinite(accuracyMeters) || accuracyMeters <= MAX_GEO_ORIGIN_ACCURACY_METERS;
  }

  async ensurePlacementAssetForExperience(experienceMode) {
    if (!this.placementController) {
      return false;
    }

    const placementConfig = this.getSiteGeoPlacementConfig();
    const shouldUseSiteAsset =
      Boolean(placementConfig && placementConfig.assetUrl) &&
      (experienceMode === ExperienceMode.GEO_SENSOR || this.isGeoPlacementModeSelected());

    if (shouldUseSiteAsset) {
      if (this.activePlacementAssetSource === placementConfig.assetUrl) {
        return true;
      }

      try {
        const assetInfo = await this.sceneManager.createPlacementAssetFromUrl(
          placementConfig.assetUrl,
          placementConfig.assetLabel
        );
        this.placementController.setAsset(assetInfo.object);
        this.activePlacementAssetSource = placementConfig.assetUrl;
        this.ui.setAssetLabel(assetInfo.label);
        return true;
      } catch (error) {
        this.ui.setMessage(`Geo-Modell konnte nicht geladen werden: ${toMessage(error)}`);
        this.ui.setHint("Pruefe den Modellpfad in der Site-JSON (placement.asset).");
        return false;
      }
    }

    if (this.activePlacementAssetSource === "default") {
      return true;
    }

    try {
      const defaultAssetInfo = await this.sceneManager.createPlacementAsset();
      this.placementController.setAsset(defaultAssetInfo.object);
      this.activePlacementAssetSource = "default";
      this.ui.setAssetLabel(defaultAssetInfo.label);
      return true;
    } catch (error) {
      this.ui.setMessage(`Standard-Modell konnte nicht geladen werden: ${toMessage(error)}`);
      return false;
    }
  }

  async startSelectedExperience() {
    if (this.geoSensorActive || (this.arSessionManager && this.arSessionManager.isActive())) {
      return false;
    }

    if (this.selectedExperienceMode === ExperienceMode.GEO_SENSOR) {
      if (!this.siteConfig) {
        this.ui.setMessage("Geo-Modus ist ohne Site-QR-Konfiguration nicht verfuegbar.");
        this.ui.setHint("Oeffne die App mit einem gueltigen ?site=... Parameter.");
        return false;
      }

      this.applySiteGeoTargetFromConfig({ force: true });
      this.applySiteGeoCalibrationFromConfig({ force: true });
      this.applySitePlacementTransformFromConfig({ force: true });
      this.applySiteLocalObjectsFromConfig({ force: true });
      const siteAssetReady = await this.ensurePlacementAssetForExperience(ExperienceMode.GEO_SENSOR);
      if (!siteAssetReady) {
        return false;
      }

      return this.startGeoSensorMode();
    }

    const headingPermissionReady = await this.ensureGeoLocalHeadingPermissionFromUserGesture();
    if (!headingPermissionReady) {
      return false;
    }

    const xrAssetReady = await this.ensurePlacementAssetForExperience(ExperienceMode.XR);
    if (!xrAssetReady) {
      return false;
    }

    this.applySiteGeoCalibrationFromConfig({ force: false });
    this.applySitePlacementTransformFromConfig({ force: false });
    this.applySiteLocalObjectsFromConfig({ force: false });

    return this.startAR();
  }

  async stopActiveExperience() {
    if (this.geoSensorActive) {
      return this.stopGeoSensorMode();
    }

    return this.stopAR();
  }

  syncPresentationVisibility() {
    const hasARSession = this.arSessionManager && this.arSessionManager.isActive();
    const showGeoGlobalScene =
      this.geoSensorActive &&
      !hasARSession &&
      this.selectedPlacementMode === PlacementUIModel.GEO_GLOBAL;
    this.geoSceneManager.setVisible(showGeoGlobalScene);

    if (this.placementController) {
      this.placementController.setPresentationVisible(!showGeoGlobalScene);
    }
  }

  async requestGeoCameraFromUserGesture() {
    this.ui.setMessage("Starte Geo-Modus...");

    try {
      await this.sceneManager.startCameraVideo();
      this.sceneManager.setGeoMode(true);
      return true;
    } catch (error) {
      const feedback = toCameraStartFeedback(error);
      console.error("Geo camera start failed:", error);
      this.sceneManager.stopCameraVideo();
      this.sceneManager.setGeoMode(false);
      this.ui.setSessionState(false, feedback.message);
      this.ui.setHint(feedback.hint);
      return false;
    }
  }

  async requestGeoLocationFromUserGesture() {
    if (!window.isSecureContext) {
      const feedback = toGeolocationStartFeedback({
        issue: "https-required"
      });
      console.error("Geo geolocation start failed:", feedback.message);
      this.ui.setSessionState(false, feedback.message);
      this.ui.setHint(feedback.hint);
      return false;
    }

    if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== "function") {
      const feedback = toGeolocationStartFeedback({
        issue: "geolocation-unsupported"
      });
      console.error("Geo geolocation start failed:", feedback.message);
      this.ui.setSessionState(false, feedback.message);
      this.ui.setHint(feedback.hint);
      return false;
    }

    try {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          () => {
            resolve(true);
          },
          (error) => {
            reject(error);
          },
          GEOLOCATION_PERMISSION_OPTIONS
        );
      });

      return true;
    } catch (error) {
      console.error("Geo geolocation start failed:", error);
      const feedback = toGeolocationStartFeedback(error);
      this.ui.setSessionState(false, feedback.message);
      this.ui.setHint(feedback.hint);
      return false;
    }
  }

  async startGeoSensorMode() {
    if (!this.siteConfig) {
      this.ui.setMessage("Geo-Modus ist ohne Site-QR-Konfiguration nicht verfuegbar.");
      this.ui.setHint("Oeffne die App mit einem gueltigen ?site=... Parameter.");
      return false;
    }

    if (this.arSessionManager && this.arSessionManager.isActive()) {
      this.ui.setMessage("WebXR laeuft bereits. Beende zuerst den AR-Modus.");
      return false;
    }

    this.applySiteGeoTargetFromConfig({ force: true });
    this.applySiteGeoCalibrationFromConfig({ force: true });
    this.applySitePlacementTransformFromConfig({ force: true });
    this.ui.setMessage("Starte Geo-Modus in WebXR...");
    const arStarted = await this.startAR({
      allowGeoGlobal: true
    });

    if (!arStarted) {
      return false;
    }

    const locationReady = await this.requestGeoLocationFromUserGesture();
    if (!locationReady) {
      await this.stopAR();
      return false;
    }

    this.requestGeoLocation();
    if (!this.siteConfig.origin) {
      this.ui.setSessionState(false, "Geo-Modus benoetigt in der Site-JSON eine origin-Koordinate.");
      this.ui.setHint("Fuer QR-basiertes Placement nutze AR (WebXR) mit Geo-Local.");
      await this.stopAR();
      return false;
    }
    const started = await this.sensorFusion.start({
      origin: this.siteConfig.origin
    });

    if (!started) {
      console.error("Geo sensor start failed:", this.sensorFusion.getSnapshot());
      this.sensorFusion.stop();
      const sensorSnapshot = this.sensorFusion.getSnapshot();
      this.ui.setSessionState(false, sensorSnapshot.message);
      this.ui.setHint("Geo-Modus benoetigt GPS sowie Kompass-/IMU-Zugriff.");
      await this.stopAR();
      return false;
    }

    this.geoSensorActive = true;
    this.syncPresentationVisibility();
    this.ui.setSessionState(true, `Geo-Modus aktiv. Site '${this.siteConfig.id}' geladen.`);
    this.syncDebugPanels(this.activeSurfaceState, null, this.sensorFusion.getSnapshot());
    this.ui.setHint(
      `Geo-Modus aktiv. Zielkoordinate aus Site geladen (Toleranz ${this.getGeoSiteToleranceMeters().toFixed(1)} m).`
    );
    return true;
  }

  async stopGeoSensorMode() {
    if (!this.geoSensorActive) {
      return false;
    }

    this.lastFrameTimeMs = 0;
    const hasARSession = this.arSessionManager && this.arSessionManager.isActive();

    if (hasARSession) {
      this.sensorFusion.stop();
      this.geoLocationService.stop();
      await this.stopAR();
      return true;
    }

    this.geoSensorActive = false;
    this.sensorFusion.stop();
    this.geoLocationService.stop();
    this.sceneManager.stopCameraVideo();
    this.sceneManager.setGeoMode(false);
    this.sceneManager.resetFallbackView();
    this.syncPresentationVisibility();
    this.ui.setSessionState(false, "Geo-Modus beendet. Fallback-3D-Ansicht aktiv.");
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.syncDebugPanels();
    this.ui.setHint("Fallback-3D-Ansicht aktiv. Geo-Modus kann jederzeit erneut gestartet werden.");
    return true;
  }

  async startAR({ allowGeoGlobal = false } = {}) {
    if (this.selectedPlacementMode === PlacementUIModel.GEO_GLOBAL && !allowGeoGlobal) {
      this.ui.setMessage("Geo-Global-Modus nutzt den Geo-WebXR-Flow. Waehle 'Geo (WebXR)' und starte diesen Modus.");
      return false;
    }

    this.lastFrameTimeMs = 0;
    this.activeSurfaceState = null;
    this.ui.setMessage("Starte immersive AR...");

    let result = null;
    try {
      result = await this.arSessionManager.startSession();
    } catch (error) {
      this.ui.setSessionState(false, `AR-Start fehlgeschlagen: ${toMessage(error)}`);
      this.ui.setHint("Fallback-3D-Ansicht bleibt aktiv.");
      return;
    }

    if (!result.started) {
      this.ui.setSessionState(false, result.message);
      this.ui.setHint("Fallback-3D-Ansicht bleibt aktiv.");
      return;
    }

    try {
      await this.hitTestManager.initialize(result.session);
    } catch (error) {
      this.ui.setMessage(`Hit-Test konnte nicht initialisiert werden: ${toMessage(error)}`);
      await this.arSessionManager.endSession();
      return;
    }

    this.poseStabilizer.reset();
    this.arSessionManager.clearOriginPose();
    this.placementController.clearGeoOrigin();
    this.placementController.enterARMode();
    this.placementController.setTextInputActive(this.isTextInputActive);
    this.placementController.setMode(mapPlacementUiModeToControllerMode(this.selectedPlacementMode));
    if (this.isGeoPlacementModeSelected()) {
      this.applySiteGeoCalibrationFromConfig({ force: true });
      this.applySitePlacementTransformFromConfig({ force: true });
      this.applySiteLocalObjectsFromConfig({ force: true });
    } else {
      this.placementController.setGeoCalibration(null);
      this.placementController.setPlacementTransform(null);
      this.placementController.setGeoObjects(null);
    }
    this.sceneManager.setARMode(true);
    this.syncPresentationVisibility();
    this.ui.setSessionState(true, result.message);
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.syncDebugPanels();
    this.syncCanvasPointerState();

    if (this.placementController.getMode() === PlacementMode.GEO) {
      this.ui.setHint(
        this.isGeoLocalHeadingReferenceEnabled()
          ? "Geo-Local mit Kompassbezug aktiv. Halte am QR-Startpunkt kurz still, damit Ursprung und Nordrichtung erfasst werden."
          : "Geo-Local aktiv. Richte dich am QR-Code aus und halte fuer die erste stabile Bodenpose kurz still."
      );
      return true;
    }

    this.ui.setHint("Bewege das Geraet langsam ueber Boden oder Tisch, bis eine stabile Referenzflaeche erkannt wird.");
    return true;
  }

  async stopAR() {
    await this.arSessionManager.endSession();
  }

  handleSessionEnded() {
    const wasGeoSensor = this.geoSensorActive;
    this.lastFrameTimeMs = 0;
    this.activeSurfaceState = null;
    this.lastCameraState = null;
    this.geoSensorActive = false;
    if (wasGeoSensor) {
      this.sensorFusion.stop();
      this.geoLocationService.stop();
    }
    this.hitTestManager.dispose();
    this.poseStabilizer.reset();
    this.sceneManager.setARMode(false);
    this.placementController.exitARMode();
    this.syncPresentationVisibility();
    this.handleTextInputActiveChange(false);
    this.ui.setSessionState(
      false,
      wasGeoSensor ? "Geo-Modus beendet. Fallback-3D-Ansicht aktiv." : "AR beendet. Fallback-3D-Ansicht aktiv."
    );
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.syncDebugPanels();
    this.ui.setHint(
      wasGeoSensor
        ? "Fallback-3D-Ansicht aktiv. Geo-Modus kann jederzeit erneut gestartet werden."
        : "Fallback-3D-Ansicht aktiv. AR kann jederzeit erneut gestartet werden."
    );
  }

  handleFrame(timeMs, frame) {
    const deltaSeconds = this.computeDeltaSeconds(timeMs);

    if (this.arSessionManager && this.arSessionManager.isActive()) {
      if (this.isTextInputActive) {
        this.sceneManager.render();
        return;
      }

      const referenceSpace = this.arSessionManager.getReferenceSpace();
      const viewerPose =
        Boolean(frame) && Boolean(referenceSpace)
          ? frame.getViewerPose(referenceSpace)
          : null;
      const tracking = Boolean(viewerPose);
      const cameraState = buildCameraState(viewerPose);
      this.lastCameraState = tracking && cameraState ? cameraState : null;

      this.ui.setTrackingState(tracking);

      let surfaceState = null;
      if (tracking && frame && referenceSpace) {
        const hitResult = this.hitTestManager.update(frame, referenceSpace);
        surfaceState = this.poseStabilizer.update(hitResult.pose, deltaSeconds);
      } else {
        surfaceState = this.poseStabilizer.update(null, deltaSeconds);
      }

      this.activeSurfaceState = surfaceState;
      this.placementController.updateSurfaceState(surfaceState);
      this.ui.setSurfaceState(surfaceState.surfaceDetected, surfaceState.isStable);

      if (surfaceState.isStable && !this.arSessionManager.hasOriginPose()) {
        this.arSessionManager.setOriginPose(surfaceState.stablePose);
      }

      if (tracking && this.placementController.getMode() === PlacementMode.GEO) {
        this.captureGeoLocalReference(surfaceState, cameraState);
        this.maybePlaceGeoObject(surfaceState, cameraState);
      }

      this.ui.setPlacementState(this.placementController.isPlaced());
      this.syncDebugPanels(surfaceState, cameraState);
      this.updateInteractionHint(surfaceState, tracking, cameraState);
    } else if (this.geoSensorActive) {
      this.updateGeoSensorFrame(deltaSeconds);
    }

    this.sceneManager.render();
  }

  updateGeoSensorFrame(deltaSeconds) {
    const pose = this.sensorFusion.update(deltaSeconds);
    const sensorSnapshot = this.sensorFusion.getSnapshot();
    const cameraState = buildCameraStateFromPose(pose);
    const tracking = Boolean(pose);

    if (pose) {
      this.sceneManager.setGeoCameraPose(pose);
    }

    this.ui.setTrackingState(tracking);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(Boolean(sensorSnapshot.ready));
    this.syncDebugPanels(null, cameraState, sensorSnapshot);
    this.updateInteractionHint(null, tracking, cameraState, sensorSnapshot);
  }

  handleSelect() {
    if (this.isTextInputActive || this.isUIInteracting) {
      return;
    }

    if (this.placementController.getMode() === PlacementMode.FREE) {
      this.placeFreeObject("xr");
      return;
    }

    if (this.placementController.getMode() === PlacementMode.GEO) {
      this.placeGeoObject("xr");
    }
  }

  applyPlacementMode(mode) {
    const normalizedMode = normalizePlacementUiMode(mode);
    if (this.geoSensorActive || (this.arSessionManager && this.arSessionManager.isActive())) {
      this.ui.setMessage("Moduswechsel ist nur moeglich, wenn kein AR- oder Geo-Modus laeuft.");
      return false;
    }

    if (normalizedMode === PlacementUIModel.GEO_GLOBAL && !this.siteConfig) {
      this.ui.setMessage("Geo-Global-Modus ist ohne Site-QR-Konfiguration nicht verfuegbar.");
      return false;
    }

    this.selectedPlacementMode = normalizedMode;

    if (normalizedMode === PlacementUIModel.GEO_GLOBAL) {
      this.selectedExperienceMode = ExperienceMode.GEO_SENSOR;
    } else {
      this.selectedExperienceMode = ExperienceMode.XR;
      this.lastXRPlacementMode = normalizedMode;
    }

    const controllerAccepted =
      normalizedMode === PlacementUIModel.GEO_GLOBAL
        ? true
        : this.placementController.setMode(mapPlacementUiModeToControllerMode(normalizedMode));

    if (!controllerAccepted) {
      this.ui.setMessage("Platzierungsmodus konnte nicht gewechselt werden.");
      return false;
    }

    this.ui.setExperienceMode(this.selectedExperienceMode);
    this.ui.setPlacementMode(this.selectedPlacementMode);

    if (this.selectedExperienceMode === ExperienceMode.GEO_SENSOR || this.isGeoPlacementModeSelected()) {
      this.applySiteGeoTargetFromConfig({ force: true });
      this.applySiteGeoCalibrationFromConfig({ force: true });
      this.applySitePlacementTransformFromConfig({ force: true });
      this.applySiteLocalObjectsFromConfig({ force: true });
    } else {
      this.placementController.setGeoCalibration(null);
      this.placementController.setPlacementTransform(null);
      this.placementController.setGeoObjects(null);
    }

    if (this.placementController.isPlaced()) {
      this.ui.setHint("Mode gewechselt. Bestehendes Placement bleibt bis zum Reset unveraendert.");
    } else if (normalizedMode === PlacementUIModel.GEO_LOCAL) {
      this.ui.setHint(
        this.geoHeadingReferenceEnabled
          ? "Geo-Local aktiv. Mit Kompassbezug werden X/Z-Offsets beim Start als Ost/Nord-Meter interpretiert."
          : "Geo-Local aktiv. QR-Startpunkt und Blickrichtung definieren den lokalen AR-Raum."
      );
    } else if (normalizedMode === PlacementUIModel.GEO_GLOBAL) {
      this.ui.setHint("Geo-Global-Modus aktiv. Beim Start werden GNSS, IMU und Kompass fuer die Szene genutzt.");
    } else {
      this.ui.setHint("Freie Platzierung aktiv. Sobald das Reticle stabil ist, kannst du das Objekt setzen.");
    }

    return true;
  }

  applyExperienceMode(mode) {
    const normalizedMode = normalizeExperienceMode(mode);
    if (this.geoSensorActive || (this.arSessionManager && this.arSessionManager.isActive())) {
      this.ui.setMessage("Hauptmodus kann nur gewechselt werden, wenn kein laufender Modus aktiv ist.");
      return false;
    }

    if (normalizedMode === ExperienceMode.GEO_SENSOR && !this.siteConfig) {
      this.ui.setMessage("Geo (WebXR) ist ohne Site-QR-Konfiguration nicht verfuegbar.");
      return false;
    }

    this.selectedExperienceMode = normalizedMode;

    if (normalizedMode === ExperienceMode.GEO_SENSOR) {
      this.selectedPlacementMode = PlacementUIModel.GEO_GLOBAL;
    } else if (this.selectedPlacementMode === PlacementUIModel.GEO_GLOBAL) {
      this.selectedPlacementMode = this.lastXRPlacementMode;
      this.placementController.setMode(mapPlacementUiModeToControllerMode(this.selectedPlacementMode));
    }

    if (this.selectedPlacementMode !== PlacementUIModel.GEO_GLOBAL) {
      this.placementController.setMode(mapPlacementUiModeToControllerMode(this.selectedPlacementMode));
    }

    this.ui.setExperienceMode(this.selectedExperienceMode);
    this.ui.setPlacementMode(this.selectedPlacementMode);

    if (this.selectedExperienceMode === ExperienceMode.GEO_SENSOR || this.isGeoPlacementModeSelected()) {
      this.applySiteGeoTargetFromConfig({ force: true });
      this.applySiteGeoCalibrationFromConfig({ force: true });
      this.applySitePlacementTransformFromConfig({ force: true });
      this.applySiteLocalObjectsFromConfig({ force: true });
    } else {
      this.placementController.setGeoCalibration(null);
      this.placementController.setPlacementTransform(null);
      this.placementController.setGeoObjects(null);
    }

    if (this.selectedExperienceMode === ExperienceMode.GEO_SENSOR) {
      this.ui.setHint("Geo (WebXR) ausgewaehlt. Beim Start werden WebXR, Standort und IMU/Kompass gemeinsam aktiviert.");
    } else if (this.selectedPlacementMode === PlacementUIModel.GEO_LOCAL) {
      this.ui.setHint(
        this.geoHeadingReferenceEnabled
          ? "AR (WebXR) ausgewaehlt. Geo-Local nutzt QR-Offsets mit optionalem Kompassbezug fuer echte Ost/Nord-Platzierung."
          : "AR (WebXR) ausgewaehlt. Geo-Local nutzt QR-Offsets mit Hit-Test + Stabilizer."
      );
    } else {
      this.ui.setHint("AR (WebXR) ausgewaehlt. Freie Platzierung bleibt unveraendert.");
    }

    return true;
  }

  applyGeoTarget(coord) {
    if (!this.placementController) {
      return false;
    }

    const accepted = this.placementController.setGeoTarget(coord);
    if (!accepted) {
      this.ui.setMessage("Geo-Koordinaten konnten nicht uebernommen werden.");
      return false;
    }

    const target = this.placementController.getGeoTarget();
    this.ui.setGeoTargetInputs(target);
    this.ui.setMessage(
      `Geo-Ziel uebernommen: ${target.latitude.toFixed(6)}, ${target.longitude.toFixed(6)}.`
    );

    if (this.placementController.isPlaced()) {
      this.ui.setHint("Aktuelles Placement bleibt fixiert. Neue Geo-Koordinaten greifen nach Reset.");
    } else if (this.placementController.getMode() === PlacementMode.GEO) {
      this.ui.setHint("Neue Geo-Koordinaten gespeichert. Bei stabiler Flaeche wird die Position erneut geprueft.");
    } else {
      this.ui.setHint("Geo-Koordinaten gespeichert. Sie werden verwendet, sobald du in den Koordinaten-Modus wechselst.");
    }

    return true;
  }

  requestGeoLocation() {
    return this.geoLocationService.requestPermissionAndStart();
  }

  calibrateGeoHeading() {
    const calibrated = this.sensorFusion.calibrateHeading();
    if (!calibrated) {
      this.ui.setMessage("Kalibrierung ist erst moeglich, sobald ein Heading verfuegbar ist.");
      return false;
    }

    this.ui.setMessage("Ausrichtung kalibriert.");
    this.ui.setHint("Kompass-Referenz gespeichert. Die Geo-Szene bleibt relativ zu dieser Ausrichtung stabil.");
    return true;
  }

  placeObjectFromUI() {
    if (!this.placementController) {
      return false;
    }

    if (this.placementController.getMode() === PlacementMode.GEO) {
      return this.placeGeoObject("ui");
    }

    return this.placeFreeObject("ui");
  }

  placeFreeObject(source = "ui") {
    if (!this.arSessionManager || !this.arSessionManager.isActive()) {
      return false;
    }

    if (this.isTextInputActive) {
      return false;
    }

    if (source !== "ui" && this.isUIInteracting) {
      return false;
    }

    if (this.placementController.getMode() !== PlacementMode.FREE) {
      return false;
    }

    if (!this.activeSurfaceState || !this.activeSurfaceState.isStable || !this.activeSurfaceState.stablePose) {
      this.ui.setMessage("Noch keine stabile Flaeche fuer die freie Platzierung.");
      return false;
    }

    const placed = this.placementController.placeAtStablePose(this.activeSurfaceState.stablePose);
    if (!placed) {
      return false;
    }

    this.ui.setPlacementState(true);
    this.ui.setMessage("Objekt stabil auf der erkannten Flaeche platziert.");
    this.ui.setHint("Placement-Lock aktiv. Neu platzieren nur per Reset.");
    return true;
  }

  placeGeoObject(source = "ui") {
    if (!this.arSessionManager || !this.arSessionManager.isActive()) {
      return false;
    }

    if (this.isTextInputActive) {
      return false;
    }

    if (source !== "ui" && this.isUIInteracting) {
      return false;
    }

    if (this.placementController.getMode() !== PlacementMode.GEO) {
      return false;
    }

    if (this.placementController.isPlaced()) {
      return false;
    }

    if (!this.activeSurfaceState || !this.activeSurfaceState.isStable || !this.activeSurfaceState.stablePose) {
      this.ui.setMessage("Keine stabile Flaeche. Der Koordinaten-Modus benoetigt eine stabile Bodenflaeche.");
      return false;
    }

    const cameraState = this.lastCameraState;
    if (!cameraState) {
      this.ui.setMessage("Tracking pausiert. Halte das Geraet ruhig, bis WebXR wieder Viewer-Pose liefert.");
      return false;
    }

    this.captureGeoLocalReference(this.activeSurfaceState, cameraState);

    if (!this.placementController.hasGeoReferenceDirection()) {
      this.ui.setMessage(
        this.isGeoLocalHeadingReferenceEnabled()
          ? this.hasGeoLocalHeading()
            ? "Nordreferenz wird initialisiert. Halte das Geraet kurz ruhig."
            : "Geo-Local aktiv. Warte auf Kompass-Heading fuer echten Nord/Ost-Bezug."
          : "Lokale Referenzrichtung wird initialisiert. Halte die Blickrichtung kurz stabil."
      );
      return false;
    }

    if (!this.placementController.hasGeoOrigin()) {
      this.ui.setMessage("Lokaler QR-Ursprung wird initialisiert. Halte das Geraet kurz ruhig.");
      return false;
    }

    const computation = this.placementController.computeGeoPosition(this.activeSurfaceState.stablePose, cameraState);
    if (computation.status !== "ready" || !computation.pose) {
      if (computation.status === "missing-origin") {
        this.ui.setMessage("Lokaler QR-Ursprung fehlt noch. Halte die Bodenpose kurz stabil.");
      } else if (computation.status === "missing-reference") {
        this.ui.setMessage(
          this.isGeoLocalHeadingReferenceEnabled()
            ? this.hasGeoLocalHeading()
              ? "Nordreferenz wird initialisiert. Halte das Geraet kurz ruhig."
              : "Geo-Local aktiv. Warte auf Kompass-Heading fuer echten Nord/Ost-Bezug."
            : "Lokale Referenzrichtung wird initialisiert. Halte die Blickrichtung kurz stabil."
        );
      }
      return false;
    }

    const placed = this.placementController.placeGeoAtPose(computation.pose, cameraState);
    if (!placed) {
      return false;
    }

    const objectCount = Array.isArray(computation.placements) ? computation.placements.length : 1;
    this.ui.setPlacementState(true);
    this.ui.setMessage(`Geo-Local Placement aktiv: ${objectCount} Objekt(e) relativ zum QR-Ursprung gesetzt.`);
    this.ui.setHint("Placement-Lock aktiv. Offsets bleiben stabil, bis du resettest.");
    return true;
  }

  maybePlaceGeoObject(surfaceState, cameraState) {
    if (this.isTextInputActive || !surfaceState.isStable || this.placementController.isPlaced()) {
      return;
    }

    this.captureGeoLocalReference(surfaceState, cameraState);

    const computation = this.placementController.computeGeoPosition(surfaceState.stablePose, cameraState);
    if (computation.status !== "ready" || !computation.pose) {
      return;
    }

    const placed = this.placementController.placeGeoAtPose(computation.pose, cameraState);
    if (!placed) {
      return;
    }

    const objectCount = Array.isArray(computation.placements) ? computation.placements.length : 1;
    this.ui.setPlacementState(true);
    this.ui.setMessage(`Geo-Local Placement aktiv: ${objectCount} Objekt(e) relativ zum QR-Ursprung gesetzt.`);
    this.ui.setHint("Placement-Lock aktiv. Offsets bleiben stabil, bis du resettest.");
  }

  captureGeoLocalReference(surfaceState, cameraState) {
    if (!surfaceState || !surfaceState.isStable || !surfaceState.stablePose || !cameraState) {
      return false;
    }

    const localOriginPose =
      this.arSessionManager && this.arSessionManager.hasOriginPose()
        ? this.arSessionManager.getOriginPose()
        : surfaceState.stablePose;
    const originCaptured = this.placementController.hasGeoOrigin()
      ? true
      : this.placementController.setGeoOrigin({ anchorPose: localOriginPose });
    const usesHeadingReference = this.isGeoLocalHeadingReferenceEnabled();
    const directionCaptured = this.placementController.hasGeoReferenceDirection()
      ? true
      : this.placementController.setGeoReferenceDirection(cameraState.direction, {
          headingRad: this.headingService.getHeadingRad(),
          requireHeading: usesHeadingReference
        });

    return originCaptured && directionCaptured;
  }

  handleUIInteractionChange(isInteracting) {
    this.isUIInteracting = isInteracting;
  }

  handleTextInputActiveChange(isActive) {
    this.isTextInputActive = Boolean(isActive);

    if (this.placementController) {
      this.placementController.setTextInputActive(this.isTextInputActive);
    }

    this.syncCanvasPointerState();
  }

  syncCanvasPointerState() {
    this.sceneManager.setCanvasPointerEvents(this.isTextInputActive ? "none" : "auto");
  }

  syncDebugPanels(surfaceState = null, cameraState = null, geoSensorSnapshot = null) {
    if (!this.placementController) {
      return;
    }

    const hasARSession = this.arSessionManager && this.arSessionManager.isActive();

    if (this.geoSensorActive && !hasARSession) {
      const enuPosition = geoSensorSnapshot && geoSensorSnapshot.enuPosition ? geoSensorSnapshot.enuPosition : null;
      this.ui.setGeoDebug({
        originLatitude: this.siteConfig && this.siteConfig.origin ? this.siteConfig.origin.lat : null,
        originLongitude: this.siteConfig && this.siteConfig.origin ? this.siteConfig.origin.lon : null,
        targetLatitude: geoSensorSnapshot && geoSensorSnapshot.position ? geoSensorSnapshot.position.lat : null,
        targetLongitude: geoSensorSnapshot && geoSensorSnapshot.position ? geoSensorSnapshot.position.lon : null,
        xMeters: enuPosition ? enuPosition.e : null,
        zMeters: enuPosition ? enuPosition.n : null,
        distanceMeters: enuPosition ? Math.hypot(enuPosition.e, enuPosition.n) : null
      });
      this.ui.setPlacementDebug({
        objectPlaced: Boolean(geoSensorSnapshot && geoSensorSnapshot.ready),
        distanceOverLimit: false,
        hasStableSurface: Boolean(geoSensorSnapshot && geoSensorSnapshot.ready),
        objectBehindCamera: false
      });
      return;
    }

    this.ui.setGeoDebug(this.placementController.getGeoDebugSnapshot());
    this.ui.setPlacementDebug(
      this.placementController.getPlacementDebugSnapshot({
        hasStableSurface: Boolean(surfaceState && surfaceState.isStable),
        cameraState
      })
    );
  }

  updateInteractionHint(surfaceState, tracking, cameraState, geoSensorSnapshot = null) {
    const hasARSession = this.arSessionManager && this.arSessionManager.isActive();

    if (this.geoSensorActive && !hasARSession) {
      if (!this.siteConfig) {
        this.ui.setHint("Keine Site geladen. Geo-Modus benoetigt einen QR-Link mit ?site=...");
        return;
      }

      if (geoSensorSnapshot && geoSensorSnapshot.issue) {
        this.ui.setHint(geoSensorSnapshot.message || "Geo-Daten sind aktuell nicht verfuegbar.");
        return;
      }

      if (!geoSensorSnapshot || !geoSensorSnapshot.position) {
        this.ui.setHint("Warte auf GPS-Fix fuer die ENU-Position.");
        return;
      }

      if (!Number.isFinite(geoSensorSnapshot.headingDeg)) {
        this.ui.setHint("Warte auf Kompass/IMU. Halte das Geraet kurz ruhig und kalibriere bei Bedarf.");
        return;
      }

      if (!tracking) {
        this.ui.setHint("Sensoren laufen, die Pose wird noch geglaettet.");
        return;
      }

      this.ui.setHint("Geo-Modus aktiv. Szene und Marker folgen jetzt stabil deiner ENU-Position.");
      return;
    }

    const geoDebug = this.placementController.getGeoDebugSnapshot();
    const placementDebug = this.placementController.getPlacementDebugSnapshot({
      hasStableSurface: Boolean(surfaceState && surfaceState.isStable),
      cameraState
    });

    if (this.placementController.isPlaced()) {
      if (this.placementController.getMode() === PlacementMode.GEO) {
        if (placementDebug.objectBehindCamera) {
          this.ui.setHint("Objekt liegt hinter dir. Geo-Placement bleibt fixiert, bis du resettest.");
        } else {
          this.ui.setHint("Geo-Placement fixiert. 'Neu platzieren' berechnet die Zielposition erneut.");
        }
      } else {
        this.ui.setHint("Objekt fixiert. 'Neu platzieren' aktiviert das Reticle erneut.");
      }
      return;
    }

    if (!tracking) {
      this.ui.setHint("Tracking pausiert. Halte das Geraet ruhig, bis WebXR wieder Viewer-Pose liefert.");
      return;
    }

    if (this.placementController.getMode() === PlacementMode.FREE) {
      if (surfaceState.isStable) {
        this.ui.setHint("Reticle stabil. Tippen oder 'Objekt setzen' druecken.");
      } else if (surfaceState.surfaceDetected) {
        this.ui.setHint("Flaeche erkannt. Kurz ruhig halten, damit die Mehrframe-Pruefung stabil wird.");
      } else {
        this.ui.setHint("Keine Flaeche erkannt. Geraet ruhig ueber eine ebene Umgebung bewegen.");
      }
      return;
    }

    if (!this.placementController.hasGeoOrigin()) {
      this.ui.setHint("Geo-Local aktiv. Warte auf die erste stabile Bodenpose am QR-Startpunkt.");
      return;
    }

    if (!this.placementController.hasGeoReferenceDirection()) {
      this.ui.setHint(
        this.isGeoLocalHeadingReferenceEnabled()
          ? this.hasGeoLocalHeading()
            ? "Nordreferenz wird initialisiert. Halte das Geraet kurz ruhig."
            : "Geo-Local aktiv. Warte auf Kompass-Heading fuer echten Nord/Ost-Bezug."
          : "Lokale Referenzrichtung wird initialisiert. Halte die Blickrichtung kurz stabil."
      );
      return;
    }

    if (geoDebug.status === "missing-origin") {
      this.ui.setHint("Lokaler QR-Ursprung fehlt noch.");
      return;
    }

    if (!surfaceState.isStable) {
      if (surfaceState.surfaceDetected) {
        this.ui.setHint("Flaeche erkannt. Kurz ruhig halten, damit die Bodenhoehe stabil wird.");
      } else {
        this.ui.setHint("Keine stabile Flaeche. Der Koordinaten-Modus benoetigt eine stabile Bodenflaeche.");
      }
      return;
    }

    if (placementDebug.objectBehindCamera) {
      this.ui.setHint("Objekt liegt hinter dir.");
      return;
    }

    this.ui.setHint(
      this.isGeoLocalHeadingReferenceEnabled()
        ? "Stabile Flaeche erkannt. Offsets werden relativ zum QR-Ursprung als Ost/Nord-Meter gesetzt."
        : "Stabile Flaeche erkannt. Offsets werden relativ zum QR-Ursprung im lokalen AR-Raum gesetzt."
    );
  }

  resetPlacement() {
    const hasARSession = this.arSessionManager && this.arSessionManager.isActive();

    if (this.geoSensorActive && !hasARSession) {
      this.ui.setMessage("Dieser Fallback-Geo-Modus nutzt kein hit-test-basiertes Placement.");
      this.ui.setHint("Nutze 'Ausrichtung kalibrieren', wenn die Szene neu ausgerichtet werden soll.");
      return;
    }

    this.lastFrameTimeMs = 0;
    this.activeSurfaceState = null;
    this.poseStabilizer.reset();
    if (this.arSessionManager) {
      this.arSessionManager.clearOriginPose();
    }
    this.placementController.clearGeoOrigin();
    this.placementController.clearGeoReferenceDirection();
    this.placementController.resetPlacement();
    this.ui.setPlacementState(false);
    this.ui.setSurfaceState(false, false);
    this.syncDebugPanels();

    if (this.arSessionManager && this.arSessionManager.isActive()) {
      this.ui.setMessage("Placement wurde zurueckgesetzt.");
      if (this.placementController.getMode() === PlacementMode.GEO) {
        this.ui.setHint(
          this.isGeoLocalHeadingReferenceEnabled()
            ? "Suche am QR-Startpunkt eine neue stabile Flaeche; Ursprung und Nordrichtung werden neu gesetzt."
            : "Suche am QR-Startpunkt eine neue stabile Flaeche; der lokale Ursprung wird neu gesetzt."
        );
      } else {
        this.ui.setHint("Freie Platzierung aktiv. Richte das Reticle neu aus und setze das Objekt erneut.");
      }
      return;
    }

    this.ui.setMessage("Objekt auf die Fallback-Buehne zurueckgesetzt.");
    this.ui.setHint("Fallback-3D-Ansicht aktiv.");
  }

  computeDeltaSeconds(timeMs) {
    const deltaSeconds = this.lastFrameTimeMs
      ? Math.min((timeMs - this.lastFrameTimeMs) / 1000, 0.1)
      : 1 / 60;

    this.lastFrameTimeMs = timeMs;
    return deltaSeconds;
  }

  dispose() {
    this.geoSensorActive = false;
    this.sensorFusion.stop();

    if (this.arSessionManager && this.arSessionManager.isActive()) {
      this.arSessionManager.endSession().catch(() => {
        // Ignore unload-time errors.
      });
    }

    this.hitTestManager.dispose();
    this.poseStabilizer.reset();
    this.geoLocationService.stop();
    this.headingService.dispose();

    if (this.placementController) {
      this.placementController.dispose();
    }

    this.ui.dispose();
    this.geoSceneManager.dispose();
    this.sceneManager.dispose();
  }
}
