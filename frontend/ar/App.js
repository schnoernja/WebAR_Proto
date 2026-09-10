import * as THREE from "three";
import { APP_CONFIG } from "./config.js";
import { ArCapabilityDetector, ARLaunchMode } from "./ArCapabilityDetector.js";
import { ArLauncher } from "./ArLauncher.js";
import { SceneManager } from "./SceneManager.js?v=placement-consistency-20260909";
import { ARSessionManager } from "./ARSessionManager.js";
import { IOSWebSLAMPlacementBackend } from "./IOSWebSLAMPlacementBackend.js?v=ios-tracking-grace-20260909";
import { HitTestManager } from "./HitTestManager.js";
import { PoseStabilizer } from "./PoseStabilizer.js?v=hold-tolerance-2-20260910";
import { PlacementController, PlacementMode } from "./PlacementController.js?v=placement-consistency-20260909";
import { UIController } from "./UIController.js?v=placement-hold-20260910";
import { GeoLocationService } from "./GeoLocationService.js";
import { HeadingService } from "./HeadingService.js";
import { resolveAppUrl } from "./urlUtils.js";
import { SiteLoader } from "./geo/SiteLoader.js?v=info-board-dev-20260909";
import { SensorFusion } from "./geo/SensorFusion.js";
import { GeoSceneManager } from "./geo/GeoSceneManager.js?v=placement-consistency-20260909";

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
const MIN_GEO_SCALE_FACTOR = 0.1;
const MAX_GEO_SCALE_FACTOR = 3;

const IOS_TRACKING_STABILIZER_CONFIG = Object.freeze({
  positionSmoothing: 8,
  rotationSmoothing: 8,
  positionDeadbandMeters: 0.004,
  rotationDeadbandRad: 0.03,
  stabilityWindowSize: 12,
  stableFramesRequired: 8,
  maxPositionDeviationMeters: 0.1,
  maxRotationDeviationRad: 0.3490658503988659,
  stabilityUsesSmoothedPose: true
});

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
  return resolveAppUrl(url);
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

function normalizePlacementTransform(transform) {
  if (!transform || typeof transform !== "object") {
    return {
      position: { x: 0, y: 0, z: 0 },
      scaleFactor: 1,
      rotationDeg: 0,
      preserveSourceScale: false
    };
  }

  const scaleSource =
    Number.isFinite(transform.scaleFactor) ? transform.scaleFactor : transform.scale;
  const rotationSource =
    Number.isFinite(transform.rotationDeg) ? transform.rotationDeg : transform.rotation;
  const position = transform.position && typeof transform.position === "object" ? transform.position : {};

  return {
    position: {
      x: clampGeoOffsetMeters(position.x),
      y: clampGeoOffsetMeters(position.y),
      z: clampGeoOffsetMeters(position.z)
    },
    scaleFactor: clampGeoScaleFactor(Number.isFinite(scaleSource) ? scaleSource : 1),
    rotationDeg: normalizeRotationDeg(rotationSource),
    preserveSourceScale: transform.preserveSourceScale === true
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
      scene: this.sceneManager.getScene(),
      preparePlacementAsset: (assetRoot, options) =>
        this.sceneManager.normalizePlacementAsset(assetRoot, options)
    });
    this.hitTestManager = new HitTestManager();
    this.poseStabilizer = new PoseStabilizer();
    this.geoLocationService = new GeoLocationService();
    this.headingService = new HeadingService();
    this.siteLoader = new SiteLoader();
    this.sensorFusion = new SensorFusion();
    this.arCapabilityDetector = new ArCapabilityDetector({
      sessionMode: APP_CONFIG.ar.sessionMode
    });
    this.iosPlacementBackend = new IOSWebSLAMPlacementBackend({
      sceneManager: this.sceneManager,
      threeRef: THREE
    });
    this.arLauncher = new ArLauncher({
      capabilityDetector: this.arCapabilityDetector
    });
    this.placementController = null;
    this.arSessionManager = null;
    this.lastFrameTimeMs = 0;
    this.activeSurfaceState = null;
    this.lastCameraState = null;
    this.isUIInteracting = false;
    this.isTextInputActive = false;
    this.siteConfig = null;
    this.activeScenarioId = null;
    this.scenarioSwitchPending = false;
    this.selectedExperienceMode = ExperienceMode.XR;
    this.selectedPlacementMode = PlacementUIModel.FREE;
    this.lastXRPlacementMode = PlacementUIModel.FREE;
    this.geoHeadingReferenceEnabled = false;
    this.geoSensorActive = false;
    this.iosSlamActive = false;
    this.activePlacementAssetSource = null;
    this.activePlacementAssetUrl = null;
    this.placementAssetLoadPending = false;
    this.placementAssetLoadPromise = null;
    this.sceneTransformUiState = {
      position: { x: 0, y: 0, z: 0 },
      scaleFactor: 1,
      rotationDeg: 0,
      preserveSourceScale: false
    };
    this.objectTransformUiState = [];

    this.handleFrame = this.handleFrame.bind(this);
    this.handleSessionEnded = this.handleSessionEnded.bind(this);
    this.handleSelect = this.handleSelect.bind(this);
    this.handleCanvasPlacement = this.handleCanvasPlacement.bind(this);
  }

  async init() {
    await this.sceneManager.initialize();
    this.sceneManager.getCanvasElement().addEventListener("pointerup", this.handleCanvasPlacement);
    await this.loadSiteConfiguration();

    this.placementController = new PlacementController({
      scene: this.sceneManager.getScene(),
      infoBoardManager: this.sceneManager.getInfoBoardManager()
    });
    this.syncSceneTransformStateFromConfig();

    this.prepareLazyPlacementAsset();
    this.ui.setExperienceMode(this.selectedExperienceMode);
    this.ui.setPlacementMode(this.selectedPlacementMode);
    this.ui.setGeoHeadingReferenceEnabled(this.geoHeadingReferenceEnabled);
    this.applySiteGeoTargetFromConfig({ force: true });
    this.applySiteGeoCalibrationFromConfig({ force: true });
    this.applySitePlacementTransformFromConfig({ force: true });
    this.applySiteObjectTransformsFromConfig({ force: true });
    this.applySiteInfoBoardsFromConfig({ reset: true });
    this.applySiteLocalObjectsFromConfig({ force: true });
    this.ui.setGeoTargetInputs(this.placementController.getGeoTarget());
    this.ui.bindGeoLocationService(this.geoLocationService);
    this.ui.bindSensorFusion(this.sensorFusion);

    this.ui.setHint("Fallback-3D-Ansicht aktiv. Das 3D-Modell wird beim AR-Start geladen.");

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
      onSceneTransformChange: (transform) => this.applySceneTransformState(transform),
      onSceneTransformAdopt: (transform) => this.adoptSceneTransformAsSiteConfig(transform),
      onSceneTransformReset: () => this.resetSceneTransformState(),
      onObjectTransformsChange: (transforms) => this.applyObjectTransformsState(transforms),
      onObjectTransformsAdopt: (transforms) => this.adoptObjectTransformsAsSiteConfig(transforms),
      onInfoBoardChange: (board) => this.applyInfoBoardDraftState(board),
      onInfoBoardsAdopt: (boards) => this.adoptInfoBoardsAsSiteConfig(boards),
      onToggleScenario: () => this.switchToNextScenario(),
      onUIInteractionChange: (isInteracting) => this.handleUIInteractionChange(isInteracting),
      onTextInputActiveChange: (isActive) => this.handleTextInputActiveChange(isActive)
    });
    this.ui.setSceneTransformState(this.sceneTransformUiState);
    this.syncObjectTransformEditor();
    this.syncInfoBoardEditor();

    const capability = await this.arLauncher.detectCapabilities();
    const arAvailable = capability.mode !== ARLaunchMode.UNSUPPORTED;
    const supportMessage = capability.message;
    this.ui.setSupportState(arAvailable, supportMessage);
    this.ui.setSessionState(
      false,
      arAvailable ? "AR kann gestartet werden." : supportMessage
    );
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.syncDebugPanels();
    this.syncCanvasPointerState();

    if (this.siteConfig && !this.ui.isUserMode()) {
      this.ui.setMessage(`Site '${this.siteConfig.id}' geladen.`);
      this.ui.setHint("QR-Site geladen. AR mit Geo-Local ist vorausgewählt.");
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

    const scenarios = this.getScenarios();
    this.activeScenarioId = scenarios.length ? scenarios[0].id : null;
    this.syncScenarioSwitchControl();

    try {
      await this.geoSceneManager.loadSite(this.getActiveSiteConfig(), { loadSceneAsset: false });
      this.selectedExperienceMode = ExperienceMode.XR;
      this.selectedPlacementMode = PlacementUIModel.GEO_LOCAL;
      this.lastXRPlacementMode = PlacementUIModel.GEO_LOCAL;
    } catch (error) {
      this.siteConfig = null;
      this.activeScenarioId = null;
      this.syncScenarioSwitchControl();
      this.ui.setMessage(`Site-Szene konnte nicht geladen werden: ${toMessage(error)}`);
      this.ui.setHint("Fallback-3D-Ansicht aktiv. Geo-Global-Modus bleibt deaktiviert.");
    }
  }

  getScenarios() {
    return this.siteConfig && Array.isArray(this.siteConfig.scenarios) ? this.siteConfig.scenarios : [];
  }

  getActiveScenario() {
    const scenarios = this.getScenarios();
    return scenarios.find((scenario) => scenario.id === this.activeScenarioId) || null;
  }

  getActiveSiteConfig() {
    if (!this.siteConfig) {
      return null;
    }

    const scenario = this.getActiveScenario();
    if (!scenario) {
      return this.siteConfig;
    }

    return {
      ...this.siteConfig,
      origin: scenario.origin || this.siteConfig.origin,
      orientation: scenario.orientation || this.siteConfig.orientation,
      scene: scenario.scene,
      objects: scenario.objects,
      infoBoards: scenario.infoBoards,
      placement: scenario.placement
    };
  }

  getActivePlacementConfigOwner() {
    return this.getActiveScenario() || this.siteConfig;
  }

  syncScenarioSwitchControl() {
    this.ui.setScenarioSwitchState({
      scenarios: this.getScenarios().map((scenario) => ({
        id: scenario.id,
        label: scenario.label
      })),
      activeId: this.activeScenarioId,
      pending: this.scenarioSwitchPending || this.placementAssetLoadPending
    });
  }

  async switchToNextScenario() {
    const scenarios = this.getScenarios();
    if (this.scenarioSwitchPending || scenarios.length < 2) {
      return false;
    }

    const activeIndex = Math.max(0, scenarios.findIndex((scenario) => scenario.id === this.activeScenarioId));
    const previousScenarioId = this.activeScenarioId;
    const nextScenario = scenarios[(activeIndex + 1) % scenarios.length];

    this.scenarioSwitchPending = true;
    this.placementController.setInfoBoards([], { reset: true });
    this.syncScenarioSwitchControl();

    try {
      this.activeScenarioId = nextScenario.id;
      await this.geoSceneManager.loadSite(this.getActiveSiteConfig(), { loadSceneAsset: false });
      this.syncSceneTransformStateFromConfig();
      this.applySiteGeoTargetFromConfig({ force: true });
      this.applySiteGeoCalibrationFromConfig({ force: true });
      this.applySitePlacementTransformFromConfig({ force: true });
      this.applySiteLocalObjectsFromConfig({ force: true });
      this.applySiteObjectTransformsFromConfig({ force: true });

      const assetReady = await this.ensurePlacementAssetForExperience(this.selectedExperienceMode, {
        preservePlacement: true
      });
      if (!assetReady) {
        throw new Error("Szenario-Modell konnte nicht geladen werden.");
      }
      this.applySiteInfoBoardsFromConfig({ reset: true });
      this.syncInfoBoardEditor();

      const activeSiteConfig = this.getActiveSiteConfig();
      if (this.geoSensorActive && activeSiteConfig && activeSiteConfig.origin) {
        this.sensorFusion.setOrigin(activeSiteConfig.origin);
      }

      this.ui.setGeoTargetInputs(this.placementController.getGeoTarget());
      this.syncPresentationVisibility();
      this.ui.setMessage(`Szenario '${nextScenario.label}' aktiv.`);
      this.ui.setHint("Die bestehende Platzierung wird für das neue Szenario weiterverwendet.");
      return true;
    } catch (error) {
      this.activeScenarioId = previousScenarioId;
      await this.geoSceneManager.loadSite(this.getActiveSiteConfig(), { loadSceneAsset: false });
      this.syncSceneTransformStateFromConfig();
      this.applySiteGeoTargetFromConfig({ force: true });
      this.applySiteGeoCalibrationFromConfig({ force: true });
      this.applySitePlacementTransformFromConfig({ force: true });
      this.applySiteLocalObjectsFromConfig({ force: true });
      this.applySiteObjectTransformsFromConfig({ force: true });
      this.applySiteInfoBoardsFromConfig({ reset: true });
      this.syncInfoBoardEditor();
      this.ui.setMessage(`Szenariowechsel fehlgeschlagen: ${toMessage(error)}`);
      this.ui.setHint("Das vorherige Szenario bleibt aktiv.");
      return false;
    } finally {
      this.scenarioSwitchPending = false;
      this.syncScenarioSwitchControl();
    }
  }

  getSiteGeoPlacementConfig() {
    const activeSiteConfig = this.getActiveSiteConfig();
    if (!activeSiteConfig) {
      return null;
    }

    const sitePlacement =
      activeSiteConfig.placement && typeof activeSiteConfig.placement === "object"
        ? activeSiteConfig.placement
        : null;
    const targetSource =
      sitePlacement && sitePlacement.target && typeof sitePlacement.target === "object"
        ? sitePlacement.target
        : activeSiteConfig.origin;
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
        : activeSiteConfig.scene && typeof activeSiteConfig.scene.asset === "string"
          ? activeSiteConfig.scene.asset
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
      objectTransforms:
        sitePlacement && Array.isArray(sitePlacement.objectTransforms) ? sitePlacement.objectTransforms : [],
      editableNodes:
        sitePlacement && Array.isArray(sitePlacement.editableNodes) ? sitePlacement.editableNodes : null,
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

  isGeoHeadingReferenceRequired() {
    return (
      this.selectedPlacementMode === PlacementUIModel.GEO_GLOBAL ||
      this.isGeoLocalHeadingReferenceEnabled()
    );
  }

  getGeoReferenceHeadingRad() {
    if (this.selectedPlacementMode === PlacementUIModel.GEO_GLOBAL) {
      const headingDeg = this.sensorFusion.getSnapshot().headingDeg;
      return Number.isFinite(headingDeg) ? THREE.MathUtils.degToRad(headingDeg) : null;
    }
    return this.headingService.getHeadingRad();
  }

  hasGeoReferenceHeading() {
    return Number.isFinite(this.getGeoReferenceHeadingRad());
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

    const activeSiteConfig = this.getActiveSiteConfig();
    const siteObjects = activeSiteConfig && Array.isArray(activeSiteConfig.objects) ? activeSiteConfig.objects : null;
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
    this.placementController.setGeoCalibration(baseCalibration);
    return Boolean(baseCalibration);
  }

  applySitePlacementTransformFromConfig({ force = false } = {}) {
    if (!this.placementController) {
      return false;
    }

    if (!force && !this.isGeoPlacementModeSelected()) {
      this.placementController.setPlacementTransform(null);
      return false;
    }

    this.placementController.setPlacementTransform(this.sceneTransformUiState);
    return true;
  }

  applySiteObjectTransformsFromConfig({ force = false } = {}) {
    if (!this.placementController || (!force && !this.isGeoPlacementModeSelected())) {
      return false;
    }

    const placementConfig = this.getSiteGeoPlacementConfig();
    this.placementController.setEditableObjectNodes(placementConfig ? placementConfig.editableNodes : null);
    this.objectTransformUiState = placementConfig ? placementConfig.objectTransforms : [];
    this.placementController.setObjectTransforms(this.objectTransformUiState);
    this.syncObjectTransformEditor();
    return this.objectTransformUiState.length > 0;
  }

  applyObjectTransformsState(transforms) {
    if (!this.placementController) {
      return [];
    }

    this.objectTransformUiState = this.placementController.setObjectTransforms(transforms);
    return this.objectTransformUiState;
  }

  adoptObjectTransformsAsSiteConfig(transforms) {
    if (!this.siteConfig) {
      this.ui.setMessage("Keine Site geladen. Einzelobjekt-Transformation kann nicht in die JSON-Konfiguration uebernommen werden.");
      return null;
    }

    const placementConfigOwner = this.getActivePlacementConfigOwner();
    if (!placementConfigOwner.placement || typeof placementConfigOwner.placement !== "object") {
      placementConfigOwner.placement = {};
    }

    const adoptedTransforms = this.applyObjectTransformsState(transforms);
    placementConfigOwner.placement.objectTransforms = adoptedTransforms;
    this.ui.setMessage(`${adoptedTransforms.length} Einzelobjekt-Transformation(en) in die JSON-Konfiguration uebernommen.`);
    this.ui.setHint("Die Werte gelten sofort in dieser Sitzung. Fuer eine dauerhafte Änderung kopiere sie in die Site-JSON.");
    return adoptedTransforms;
  }

  syncObjectTransformEditor() {
    if (!this.ui || !this.placementController) {
      return;
    }

    this.ui.setObjectTransformTargets(
      this.placementController.getEditableObjectNodes(),
      this.placementController.getObjectTransforms()
    );
  }

  syncSceneTransformStateFromConfig() {
    const placementConfig = this.getSiteGeoPlacementConfig();
    this.sceneTransformUiState = normalizePlacementTransform(placementConfig ? placementConfig.transform : null);
    if (this.ui) {
      this.ui.setSceneTransformState(this.sceneTransformUiState);
    }
    return this.sceneTransformUiState;
  }

  applySceneTransformState(transform) {
    this.sceneTransformUiState = normalizePlacementTransform(transform);
    if (this.placementController) {
      this.placementController.setPlacementTransform(this.sceneTransformUiState);
    }
    this.ui.setSceneTransformState(this.sceneTransformUiState);
    return this.sceneTransformUiState;
  }

  resetSceneTransformState() {
    return this.applySceneTransformState(null);
  }

  adoptSceneTransformAsSiteConfig(transform) {
    if (!this.siteConfig) {
      this.ui.setMessage("Keine Site geladen. Die Gesamtszenen-Transformation kann nicht in die JSON-Konfiguration übernommen werden.");
      return null;
    }

    const placementConfigOwner = this.getActivePlacementConfigOwner();
    if (!placementConfigOwner.placement || typeof placementConfigOwner.placement !== "object") {
      placementConfigOwner.placement = {};
    }

    const adoptedTransform = this.applySceneTransformState(transform);
    placementConfigOwner.placement.transform = {
      position: { ...adoptedTransform.position },
      scaleFactor: adoptedTransform.scaleFactor,
      rotationDeg: adoptedTransform.rotationDeg,
      ...(adoptedTransform.preserveSourceScale ? { preserveSourceScale: true } : {})
    };
    this.ui.setMessage("Gesamtszenen-Transformation in die JSON-Konfiguration übernommen.");
    this.ui.setHint("Die Werte gelten sofort in dieser Sitzung. Für eine dauerhafte Änderung kopiere sie in die Site-JSON.");
    return adoptedTransform;
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

  prepareLazyPlacementAsset() {
    const placementConfig = this.getSiteGeoPlacementConfig();
    const shouldUseSiteAsset =
      Boolean(placementConfig && placementConfig.assetUrl) &&
      (this.selectedExperienceMode === ExperienceMode.GEO_SENSOR || this.isGeoPlacementModeSelected());
    const assetLabel = shouldUseSiteAsset
      ? placementConfig.assetLabel
      : toAssetLabel(APP_CONFIG.model.primaryUrl);

    this.activePlacementAssetSource = null;
    this.activePlacementAssetUrl = null;
    this.ui.setAssetLabel(assetLabel);
    return assetLabel;
  }

  applySiteInfoBoardsFromConfig({ reset = false } = {}) {
    if (!this.placementController) {
      return 0;
    }
    const activeSiteConfig = this.getActiveSiteConfig();
    const infoBoards = activeSiteConfig && Array.isArray(activeSiteConfig.infoBoards)
      ? activeSiteConfig.infoBoards
      : [];
    return this.placementController.setInfoBoards(infoBoards, { reset });
  }

  applyInfoBoardDraftState(board) {
    if (!this.placementController || !board) {
      return false;
    }
    try {
      this.placementController.updateInfoBoard(board);
      this.geoSceneManager.updateInfoBoard(board);
      return true;
    } catch (error) {
      this.ui.setMessage(`Infotafel konnte nicht aktualisiert werden: ${toMessage(error)}`);
      this.ui.setHint("Kürze den Text oder prüfe Position, Skalierung und Tafeldimensionen.");
      return false;
    }
  }

  adoptInfoBoardsAsSiteConfig(infoBoards) {
    const scenarioOwner = this.getActivePlacementConfigOwner();
    if (!scenarioOwner || !Array.isArray(infoBoards)) {
      this.ui.setMessage("Keine aktive Szenenkonfiguration für Infotafeln verfügbar.");
      return null;
    }
    if (infoBoards.some((board) => !board || typeof board.text !== "string" || !board.text.trim())) {
      this.ui.setMessage("Infotafeltexte dürfen für die JSON-Konfiguration nicht leer sein.");
      return null;
    }

    const adoptedBoards = infoBoards.map((board) => ({
      ...board,
      offset: { ...board.offset },
      ...(board.style ? { style: { ...board.style } } : {})
    }));
    try {
      this.placementController.setInfoBoards(adoptedBoards);
      this.geoSceneManager.setInfoBoards(adoptedBoards);
    } catch (error) {
      this.ui.setMessage(`Infotafelwerte konnten nicht übernommen werden: ${toMessage(error)}`);
      this.ui.setHint("Prüfe insbesondere Textlänge und Tafeldimensionen in der JSON-Ausgabe.");
      return null;
    }
    scenarioOwner.infoBoards = adoptedBoards;
    this.syncInfoBoardEditor();
    this.ui.setMessage(`${adoptedBoards.length} Infotafel-Konfiguration(en) in die laufende JSON-Konfiguration übernommen.`);
    this.ui.setHint("Die Werte gelten nur in dieser Sitzung. Kopiere die JSON-Ausgabe für eine dauerhafte Änderung in die Site-Datei.");
    return adoptedBoards;
  }

  syncInfoBoardEditor() {
    if (!this.ui) {
      return;
    }
    const scenario = this.getActiveScenario();
    const activeSiteConfig = this.getActiveSiteConfig();
    this.ui.setInfoBoardTargets({
      sceneId: scenario ? scenario.id : activeSiteConfig ? activeSiteConfig.id : null,
      sceneLabel: scenario ? scenario.label : activeSiteConfig ? activeSiteConfig.id : null,
      infoBoards: activeSiteConfig && Array.isArray(activeSiteConfig.infoBoards)
        ? activeSiteConfig.infoBoards
        : []
    });
  }

  async ensurePlacementAssetForExperience(experienceMode, { preservePlacement = false } = {}) {
    if (!this.placementController) {
      return false;
    }

    if (this.placementAssetLoadPromise) {
      return this.placementAssetLoadPromise;
    }

    this.placementAssetLoadPending = true;
    this.syncScenarioSwitchControl();
    const loadPromise = this.loadPlacementAssetForExperience(experienceMode, { preservePlacement });
    this.placementAssetLoadPromise = loadPromise;

    try {
      return await loadPromise;
    } finally {
      if (this.placementAssetLoadPromise === loadPromise) {
        this.placementAssetLoadPromise = null;
        this.placementAssetLoadPending = false;
        this.syncScenarioSwitchControl();
      }
    }
  }

  async loadPlacementAssetForExperience(experienceMode, { preservePlacement = false } = {}) {
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
        this.ui.setMessage("3D-Modell wird geladen...");
        const assetInfo = await this.sceneManager.createPlacementAssetFromUrl(
          placementConfig.assetUrl,
          placementConfig.assetLabel,
          { preserveSourceScale: placementConfig.transform && placementConfig.transform.preserveSourceScale === true }
        );
        this.placementController.setAsset(assetInfo.object, assetInfo.animations, { preservePlacement });
        this.applySiteObjectTransformsFromConfig({ force: true });
        this.activePlacementAssetSource = placementConfig.assetUrl;
        this.activePlacementAssetUrl = assetInfo.sourceUrl;
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
      this.ui.setMessage("3D-Modell wird geladen...");
      const defaultAssetInfo = await this.sceneManager.createPlacementAsset();
      this.placementController.setAsset(defaultAssetInfo.object, defaultAssetInfo.animations, { preservePlacement });
      this.applySiteObjectTransformsFromConfig({ force: true });
      this.activePlacementAssetSource = "default";
      this.activePlacementAssetUrl = defaultAssetInfo.sourceUrl;
      this.ui.setAssetLabel(defaultAssetInfo.label);
      if (defaultAssetInfo.usedPlaceholder) {
        this.ui.setHint("tree.glb konnte nicht geladen werden. Platzhalter aktiv.");
      }
      return true;
    } catch (error) {
      this.ui.setMessage(`Standard-Modell konnte nicht geladen werden: ${toMessage(error)}`);
      return false;
    }
  }

  async startSelectedExperience() {
    const capability = this.arCapabilityDetector.getLastResult();
    if (
      capability &&
      capability.isIOS &&
      capability.mode !== ARLaunchMode.WEBXR &&
      this.selectedPlacementMode === PlacementUIModel.GEO_GLOBAL &&
      this.siteConfig
    ) {
      return this.startIOSBrowserSensorFallback();
    }

    const result = await this.arLauncher.launch({
      startWebXR: () => this.startSelectedWebXRExperience(),
      startIOSWebTracking: () => this.startIOSWebTrackingExperience()
    });

    if (result.mode === ARLaunchMode.WEBXR || result.mode === ARLaunchMode.IOS_WEB_TRACKING) {
      return result.started;
    }

    this.ui.setSessionState(false, "AR wird auf diesem Gerät oder Browser nicht unterstützt.");
    this.ui.setHint("Fallback-3D-Ansicht bleibt aktiv.");
    return false;
  }

  async startIOSWebTrackingExperience() {
    if (this.iosSlamActive || this.geoSensorActive || (this.arSessionManager && this.arSessionManager.isActive())) {
      return false;
    }

    this.ui.setIOSXrAttributionVisible(false);
    this.ui.setMessage("AR wird initialisiert...");
    const xrAssetReady = await this.ensurePlacementAssetForExperience(ExperienceMode.XR);
    if (!xrAssetReady) {
      this.ui.setSessionState(false, "AR konnte nicht gestartet werden: 3D-Modell fehlt.");
      return false;
    }

    this.sceneManager.setSLAMMode(true);
    this.placementController.enterARMode();
    this.placementController.setTrackingVisible(false);
    this.poseStabilizer.setConfig(IOS_TRACKING_STABILIZER_CONFIG);

    try {
      await this.iosPlacementBackend.start({
        videoElement: this.sceneManager.cameraVideo
      });
      this.iosSlamActive = true;
      this.ui.setIOSXrAttributionVisible(true);
      this.ui.setSessionState(true, "AR aktiv. Bewege das Gerät langsam über den Boden.");
      this.ui.setHint("Bewege das Gerät kurz vor und zurück, damit Maßstab und Bodenfläche stabil erfasst werden.");
      this.ui.setTrackingState(false);
      this.ui.setSurfaceState(false, false);
      this.ui.setPlacementState(false);
      this.syncCanvasPointerState();
      return true;
    } catch (error) {
      console.error("Browser-AR start failed:", error);
      this.iosPlacementBackend.stop();
      this.placementController.exitARMode();
      this.sceneManager.setSLAMMode(false);
      this.sceneManager.resetFallbackView();
      this.iosSlamActive = false;
      this.ui.setIOSXrAttributionVisible(false);
      this.ui.setSessionState(false, error instanceof Error ? error.message : "AR konnte nicht gestartet werden.");
      this.ui.setHint("Prüfe die Kamera-Berechtigung in den Browser-Einstellungen.");
      return false;
    }
  }

  async stopIOSWebTrackingExperience() {
    this.ui.setIOSXrAttributionVisible(false);
    if (!this.iosSlamActive) {
      return true;
    }

    this.iosPlacementBackend.stop();
    this.placementController.exitARMode();
    this.poseStabilizer.reset();
    this.sceneManager.setSLAMMode(false);
    this.sceneManager.resetFallbackView();
    this.iosSlamActive = false;

    this.ui.setSessionState(false, "AR wurde beendet.");
    this.ui.setHint("Fallback-3D-Ansicht aktiv.");
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.syncDebugPanels();
    this.syncCanvasPointerState();
    return true;
  }

  async startIOSBrowserSensorFallback() {
    if (this.geoSensorActive || (this.arSessionManager && this.arSessionManager.isActive())) {
      return false;
    }

    const activeSiteConfig = this.getActiveSiteConfig();
    if (!activeSiteConfig || !activeSiteConfig.origin) {
      this.ui.setSessionState(false, "Geo-AR benötigt eine Site mit Ursprungskoordinaten.");
      this.ui.setHint("Öffne die Anwendung über den QR-Link mit einem gültigen ?site=... Parameter.");
      return false;
    }

    this.selectedExperienceMode = ExperienceMode.GEO_SENSOR;
    this.selectedPlacementMode = PlacementUIModel.GEO_GLOBAL;
    this.ui.setExperienceMode(this.selectedExperienceMode);
    this.ui.setPlacementMode(this.selectedPlacementMode);
    this.applySiteGeoTargetFromConfig({ force: true });
    this.applySiteGeoCalibrationFromConfig({ force: true });
    this.applySitePlacementTransformFromConfig({ force: true });
    this.applySiteLocalObjectsFromConfig({ force: true });
    this.lastFrameTimeMs = 0;

    // Berechtigungen müssen auf iOS direkt aus der Nutzeraktion angefordert werden.
    const sensorStartPromise = this.sensorFusion.start({
      origin: activeSiteConfig.origin
    });
    const cameraStartPromise = this.requestGeoCameraFromUserGesture();
    const locationReadyPromise = this.requestGeoLocationFromUserGesture();
    const siteSceneReadyPromise = this.geoSceneManager
      .ensureSceneAsset()
      .then(() => true)
      .catch((error) => {
        this.ui.setMessage(`Site-Szene konnte nicht geladen werden: ${toMessage(error)}`);
        return false;
      });
    const [sensorStarted, cameraStarted, locationReady, siteSceneReady] = await Promise.all([
      sensorStartPromise,
      cameraStartPromise,
      locationReadyPromise,
      siteSceneReadyPromise
    ]);

    if (!sensorStarted || !cameraStarted || !locationReady || !siteSceneReady) {
      this.sensorFusion.stop();
      this.geoLocationService.stop();
      this.sceneManager.stopCameraVideo();
      this.sceneManager.setGeoMode(false);
      this.sceneManager.resetFallbackView();
      this.syncPresentationVisibility();
      if (!sensorStarted) {
        const sensorSnapshot = this.sensorFusion.getSnapshot();
        this.ui.setSessionState(false, sensorSnapshot.message || "Geo-AR konnte nicht gestartet werden.");
        this.ui.setHint("Geo-AR benötigt Standort- sowie Kompass-/Bewegungsfreigabe.");
      } else if (!siteSceneReady) {
        this.ui.setSessionState(false, "Geo-AR konnte die Site-Szene nicht laden.");
        this.ui.setHint("Prüfe den Modellpfad in der Site-JSON und starte danach erneut.");
      }
      this.ui.setTrackingState(false);
      this.ui.setSurfaceState(false, false);
      this.ui.setPlacementState(false);
      this.syncDebugPanels();
      return false;
    }

    this.geoSensorActive = true;
    this.syncPresentationVisibility();
    this.ui.setSessionState(true, `Geo-AR aktiv. Site '${this.siteConfig.id}' geladen.`);
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.syncDebugPanels(null, null, this.sensorFusion.getSnapshot());
    this.ui.setHint(
      "Kamera, Standort und Kompass sind aktiv. Die Szenenposition folgt GPS und Orientierung, jedoch ohne Bodenverankerung."
    );
    return true;
  }

  async startSelectedWebXRExperience() {
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
      return this.startGeoSensorMode();
    }

    this.applySiteGeoCalibrationFromConfig({ force: false });
    this.applySitePlacementTransformFromConfig({ force: false });
    this.applySiteLocalObjectsFromConfig({ force: false });
    this.poseStabilizer.setConfig(APP_CONFIG.stabilizer);

    // requestSession must be invoked before any awaited permission or asset work.
    const arStartPromise = this.startAR();
    const headingPermissionPromise = this.ensureGeoLocalHeadingPermissionFromUserGesture();
    const xrAssetReadyPromise = this.ensurePlacementAssetForExperience(ExperienceMode.XR);
    const [arStarted, headingPermissionReady, xrAssetReady] = await Promise.all([
      arStartPromise,
      headingPermissionPromise,
      xrAssetReadyPromise
    ]);

    if (!arStarted) {
      return false;
    }

    if (!headingPermissionReady || !xrAssetReady) {
      await this.stopAR();
      if (!xrAssetReady) {
        this.ui.setSessionState(false, "AR beendet: Das 3D-Modell konnte nicht geladen werden.");
        this.ui.setHint("Pruefe den Modellpfad und starte AR danach erneut.");
      } else {
        this.ui.setSessionState(false, "Kompass-Freigabe verweigert. AR wurde beendet.");
        this.ui.setHint(
          "Deaktiviere den Kompassbezug oder erlaube den Zugriff auf Orientierungssensoren und starte erneut."
        );
      }
      return false;
    }

    return true;
  }

  async stopActiveExperience() {
    if (this.iosSlamActive) {
      return this.stopIOSWebTrackingExperience();
    }

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
      console.info("[Geolocation] Standort wird fuer den Geo-Modus angefragt.");
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const accuracy = position && position.coords ? position.coords.accuracy : null;
            console.info(
              `[Geolocation] Standort erhalten${Number.isFinite(accuracy) ? ` (${accuracy.toFixed(1)} m)` : ""}.`
            );
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
      this.ui.setMessage("AR läuft bereits. Beende zuerst den AR-Modus.");
      return false;
    }

    this.applySiteGeoTargetFromConfig({ force: true });
    this.applySiteGeoCalibrationFromConfig({ force: true });
    this.applySitePlacementTransformFromConfig({ force: true });
    const arStartPromise = this.startAR({
      allowGeoGlobal: true
    });
    const locationReadyPromise = this.requestGeoLocationFromUserGesture();
    const siteAssetReadyPromise = this.ensurePlacementAssetForExperience(ExperienceMode.GEO_SENSOR);
    const [arStarted, siteAssetReady, locationReady] = await Promise.all([
      arStartPromise,
      siteAssetReadyPromise,
      locationReadyPromise
    ]);

    if (!arStarted) {
      return false;
    }

    if (!siteAssetReady || !locationReady) {
      await this.stopAR();
      if (!siteAssetReady) {
        this.ui.setSessionState(false, "Geo-Modus beendet: Das Site-Modell konnte nicht geladen werden.");
        this.ui.setHint("Pruefe den Modellpfad in der Site-JSON.");
      } else {
        this.ui.setSessionState(false, "Geo-Modus beendet: Standort ist nicht verfuegbar oder nicht freigegeben.");
        this.ui.setHint("Der Geo-Modus benoetigt Standortzugriff ueber HTTPS.");
      }
      return false;
    }

    this.requestGeoLocation();
    const activeSiteConfig = this.getActiveSiteConfig();
    if (!activeSiteConfig || !activeSiteConfig.origin) {
      this.ui.setSessionState(false, "Geo-Modus benoetigt in der Site-JSON eine origin-Koordinate.");
      this.ui.setHint("Für QR-basiertes Placement nutze AR mit Geo-Local.");
      await this.stopAR();
      return false;
    }
    const started = await this.sensorFusion.start({
      origin: activeSiteConfig.origin
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
      this.ui.setMessage("Geo-Global-Modus nutzt den Geo-Flow. Wähle 'Geo' und starte diesen Modus.");
      return false;
    }

    this.lastFrameTimeMs = 0;
    this.activeSurfaceState = null;
    this.ui.setMessage("AR-Session wird angefragt...");

    let result = null;
    try {
      result = await this.arSessionManager.startSession({
        skipSupportCheck: true
      });
    } catch (error) {
      this.ui.setSessionState(false, `AR-Start fehlgeschlagen: ${toMessage(error)}`);
      this.ui.setHint("Fallback-3D-Ansicht bleibt aktiv.");
      return false;
    }

    if (!result.started) {
      this.ui.setSessionState(false, result.message);
      this.ui.setHint("Fallback-3D-Ansicht bleibt aktiv.");
      return false;
    }

    try {
      await this.hitTestManager.initialize(result.session);
    } catch (error) {
      this.ui.setMessage(`Hit-Test konnte nicht initialisiert werden: ${toMessage(error)}`);
      await this.arSessionManager.endSession();
      return false;
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
    this.placementController?.updateAnimations?.(deltaSeconds);
    this.geoSceneManager?.updateAnimations?.(deltaSeconds);

    if (this.arSessionManager && this.arSessionManager.isActive()) {
      if (this.isTextInputActive) {
        this.sceneManager.render(this.lastCameraState);
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

      if (tracking) {
        if (this.placementController.getMode() === PlacementMode.GEO) {
          this.captureGeoLocalReference(surfaceState, cameraState);
          this.maybePlaceGeoObject(surfaceState, cameraState);
        } else if (surfaceState.canPlace && !this.placementController.isPlaced()) {
          this.placeFreeObject("hold");
        }
      }

      this.ui.setPlacementState(this.placementController.isPlaced());
      this.syncDebugPanels(surfaceState, cameraState);
      this.updateInteractionHint(surfaceState, tracking, cameraState);
    } else if (this.iosSlamActive) {
      this.updateIOSWebTrackingFrame(timeMs, deltaSeconds);
    } else if (this.geoSensorActive) {
      this.updateGeoSensorFrame(deltaSeconds);
    }

    this.geoSceneManager.updateInfoBoardBillboards(this.lastCameraState || this.sceneManager.getCamera());
    this.sceneManager.render(this.lastCameraState);
    if (this.iosSlamActive) {
      this.iosPlacementBackend.finishFrame();
    }
  }

  updateIOSWebTrackingFrame(timeMs, deltaSeconds) {
    if (this.isTextInputActive) {
      return;
    }

    const slamResult = this.iosPlacementBackend.update(timeMs, this.sceneManager.getCamera());
    if (slamResult.error) {
      const message = toMessage(slamResult.error, "AR wurde wegen eines technischen Fehlers beendet.");
      void this.stopIOSWebTrackingExperience();
      this.ui.setSessionState(false, message);
      this.ui.setHint("Prüfe die Browser-Berechtigungen und starte AR erneut.");
      return;
    }
    const tracking = slamResult.tracking;
    this.placementController.setTrackingVisible(tracking);
    this.ui.setTrackingState(tracking);

    if (slamResult.trackingLost) {
      this.poseStabilizer.reset();
    }

    let surfaceState = null;
    if (tracking && slamResult.surfaceDetected && slamResult.pose) {
      surfaceState = this.poseStabilizer.update(slamResult.pose, deltaSeconds, slamResult.isStable);
    } else {
      surfaceState = this.poseStabilizer.update(null, deltaSeconds);
    }

    this.activeSurfaceState = surfaceState;
    this.placementController.updateSurfaceState(surfaceState);
    this.ui.setSurfaceState(surfaceState.surfaceDetected, surfaceState.isStable);

    const cameraState = slamResult.cameraPose ? buildCameraStateFromPose(slamResult.cameraPose) : null;
    this.lastCameraState = cameraState;

    if (tracking && surfaceState.canPlace && !this.placementController.isPlaced()) {
      if (this.placementController.getMode() === PlacementMode.FREE) {
        this.placeFreeObject("hold");
      } else if (this.placementController.getMode() === PlacementMode.GEO) {
        this.captureGeoLocalReference(surfaceState, cameraState);
        this.maybePlaceGeoObject(surfaceState, cameraState);
      }
    }

    this.ui.setPlacementState(this.placementController.isPlaced());
    this.syncDebugPanels(surfaceState, cameraState);
    this.updateInteractionHint(surfaceState, tracking, cameraState);
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

  handleCanvasPlacement(event) {
    if (!this.iosSlamActive || event.isPrimary === false || event.button !== 0) {
      return;
    }
    this.handleSelect();
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
      this.ui.setMessage("Geo ist ohne Site-QR-Konfiguration nicht verfügbar.");
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
      this.ui.setHint("Geo ausgewählt. Beim Start werden AR, Standort und Kompass gemeinsam aktiviert.");
    } else if (this.selectedPlacementMode === PlacementUIModel.GEO_LOCAL) {
      this.ui.setHint(
        this.geoHeadingReferenceEnabled
          ? "AR ausgewählt. Geo-Local nutzt QR-Offsets mit optionalem Kompassbezug für echte Ost/Nord-Platzierung."
          : "AR ausgewählt. Geo-Local nutzt QR-Offsets mit stabilisierter Flächenerkennung."
      );
    } else {
      this.ui.setHint("AR ausgewählt. Freie Platzierung bleibt unverändert.");
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
    console.info("[Geolocation] Standort wird angefragt.");
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
    const isXRSession = Boolean(this.arSessionManager && this.arSessionManager.isActive());
    const isSLAMSession = Boolean(this.iosSlamActive);
    if (!isXRSession && !isSLAMSession) {
      return false;
    }

    if (this.placementAssetLoadPending) {
      this.ui.setMessage("3D-Modell wird geladen...");
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

    if (!this.activeSurfaceState || !this.activeSurfaceState.canPlace || !this.activeSurfaceState.stablePose) {
      this.ui.setMessage("Halte das Gerät etwa vier Sekunden ruhig auf den gewünschten Startpunkt.");
      return false;
    }

    const placed = this.placementController.placeAtStablePose(
      this.activeSurfaceState.stablePose,
      this.lastCameraState
    );
    if (!placed) {
      return false;
    }

    this.ui.setPlacementState(true);
    if (isSLAMSession) {
      this.iosPlacementBackend.setPlaced(true);
    }
    this.ui.setMessage("Objekt stabil auf der erkannten Flaeche platziert.");
    this.ui.setHint("Placement-Lock aktiv. Neu platzieren nur per Reset.");
    return true;
  }

  placeGeoObject(source = "ui") {
    const isXRSession = Boolean(this.arSessionManager && this.arSessionManager.isActive());
    const isSLAMSession = Boolean(this.iosSlamActive);
    if (!isXRSession && !isSLAMSession) {
      return false;
    }

    if (this.placementAssetLoadPending) {
      this.ui.setMessage("3D-Modell wird geladen...");
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

    if (!this.activeSurfaceState || !this.activeSurfaceState.canPlace || !this.activeSurfaceState.stablePose) {
      this.ui.setMessage("Halte das Gerät etwa vier Sekunden ruhig auf den gewünschten Startpunkt.");
      return false;
    }

    const cameraState = this.lastCameraState;
    if (!cameraState) {
      this.ui.setMessage("Tracking pausiert. Halte das Gerät ruhig, bis die Position wieder erfasst wird.");
      return false;
    }

    this.captureGeoLocalReference(this.activeSurfaceState, cameraState);

    if (!this.placementController.hasGeoReferenceDirection()) {
      this.ui.setMessage(
        this.isGeoHeadingReferenceRequired()
          ? this.hasGeoReferenceHeading()
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
          this.isGeoHeadingReferenceRequired()
            ? this.hasGeoReferenceHeading()
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
    if (isSLAMSession) {
      this.iosPlacementBackend.setPlaced(true);
    }
    this.ui.setMessage(`Geo-Local Placement aktiv: ${objectCount} Objekt(e) relativ zum QR-Ursprung gesetzt.`);
    this.ui.setHint("Placement-Lock aktiv. Offsets bleiben stabil, bis du resettest.");
    return true;
  }

  maybePlaceGeoObject(surfaceState, cameraState) {
    if (
      this.placementAssetLoadPending ||
      this.isTextInputActive ||
      !surfaceState.canPlace ||
      this.placementController.isPlaced()
    ) {
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
    if (this.iosSlamActive) {
      this.iosPlacementBackend.setPlaced(true);
    }
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
    const usesHeadingReference = this.isGeoHeadingReferenceRequired();
    const directionCaptured = this.placementController.hasGeoReferenceDirection()
      ? true
      : this.placementController.setGeoReferenceDirection(cameraState.direction, {
          headingRad: this.getGeoReferenceHeadingRad(),
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
        originLatitude: this.getActiveSiteConfig()?.origin?.lat ?? null,
        originLongitude: this.getActiveSiteConfig()?.origin?.lon ?? null,
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
      this.ui.setHint("Tracking pausiert. Halte das Gerät ruhig, bis die Position wieder erfasst wird.");
      return;
    }

    if (this.placementController.getMode() === PlacementMode.FREE) {
      if (surfaceState.isStable) {
        this.ui.setHint("Cursor grün. Halte das Gerät bis zur automatischen Platzierung weiter ruhig.");
      } else if (surfaceState.surfaceDetected) {
        this.ui.setHint("Fläche erkannt. Halte den orangefarbenen Cursor ruhig auf den gewünschten Startpunkt.");
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
        this.isGeoHeadingReferenceRequired()
          ? this.hasGeoReferenceHeading()
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
        this.ui.setHint("Fläche erkannt. Halte den orangefarbenen Cursor ruhig auf den gewünschten Startpunkt.");
      } else {
        this.ui.setHint("Keine stabile Flaeche. Der Koordinaten-Modus benoetigt eine stabile Bodenflaeche.");
      }
      return;
    }

    if (placementDebug.objectBehindCamera) {
      this.ui.setHint("Objekt liegt hinter dir.");
      return;
    }

    this.ui.setHint("Cursor grün. Halte das Gerät bis zur automatischen Platzierung weiter ruhig.");
  }

  resetPlacement() {
    const hasARSession = (this.arSessionManager && this.arSessionManager.isActive()) || this.iosSlamActive;

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
    if (this.iosSlamActive && this.iosPlacementBackend) {
      this.iosPlacementBackend.reset();
    }
    this.placementController.clearGeoOrigin();
    this.placementController.clearGeoReferenceDirection();
    this.placementController.resetPlacement();
    this.ui.setPlacementState(false);
    this.ui.setSurfaceState(false, false);
    this.syncDebugPanels();

    if (hasARSession) {
      this.ui.setMessage("Placement wurde zurueckgesetzt.");
      if (this.placementController.getMode() === PlacementMode.GEO) {
        this.ui.setHint(
          this.isGeoHeadingReferenceRequired()
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
    this.iosPlacementBackend.dispose();
    this.sceneManager.getCanvasElement().removeEventListener("pointerup", this.handleCanvasPlacement);

    if (this.placementController) {
      this.placementController.dispose();
    }

    this.ui.dispose();
    this.geoSceneManager.dispose();
    this.sceneManager.dispose();
  }
}
