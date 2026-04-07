import * as THREE from "three";
import { SceneManager } from "./SceneManager.js";
import { ARSessionManager } from "./ARSessionManager.js";
import { HitTestManager } from "./HitTestManager.js";
import { PoseStabilizer } from "./PoseStabilizer.js";
import { PlacementController, PlacementMode } from "./PlacementController.js";
import { UIController } from "./UIController.js";
import { GeoLocationService } from "./GeoLocationService.js";
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
  return mode === PlacementUIModel.GEO_LOCAL ? PlacementMode.GEO : PlacementMode.FREE;
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

function toGeoCoord(position) {
  if (!position) {
    return null;
  }

  return {
    latitude: position.latitude,
    longitude: position.longitude
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
    this.siteLoader = new SiteLoader();
    this.sensorFusion = new SensorFusion();
    this.placementController = null;
    this.arSessionManager = null;
    this.lastFrameTimeMs = 0;
    this.activeSurfaceState = null;
    this.isUIInteracting = false;
    this.isTextInputActive = false;
    this.siteConfig = null;
    this.selectedExperienceMode = ExperienceMode.XR;
    this.selectedPlacementMode = PlacementUIModel.FREE;
    this.lastXRPlacementMode = PlacementUIModel.FREE;
    this.geoSensorActive = false;

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
    this.ui.setExperienceMode(this.selectedExperienceMode);
    this.ui.setPlacementMode(this.selectedPlacementMode);
    this.ui.setGeoTargetInputs(this.placementController.getGeoTarget());
    this.ui.bindGeoLocationService(this.geoLocationService);
    this.ui.bindSensorFusion(this.sensorFusion);

    if (assetInfo.usedPlaceholder) {
      this.ui.setHint("tree.glb konnte nicht geladen werden. Platzhalter aktiv.");
    } else {
      this.ui.setHint("Fallback-3D-Ansicht aktiv. Im freien Modus platzierst du per Reticle, im Geo-Modus per Latitude/Longitude.");
    }

    this.arSessionManager = new ARSessionManager({
      renderer: this.sceneManager.getRenderer(),
      overlayRoot: this.document.getElementById("hud"),
      onSessionEnded: this.handleSessionEnded,
      onSelect: this.handleSelect
    });

    this.ui.bindActions({
      onStartAR: () => this.startSelectedExperience(),
      onPlace: () => this.placeFreeObject(),
      onResetPlacement: () => this.resetPlacement(),
      onStopAR: () => this.stopActiveExperience(),
      onApplyGeoTarget: (coord) => this.applyGeoTarget(coord),
      onModeChange: (mode) => this.applyPlacementMode(mode),
      onExperienceModeChange: (mode) => this.applyExperienceMode(mode),
      onRequestGeolocation: () => this.requestGeoLocation(),
      onCalibrateHeading: () => this.calibrateGeoHeading(),
      onUIInteractionChange: (isInteracting) => this.handleUIInteractionChange(isInteracting),
      onTextInputActiveChange: (isActive) => this.handleTextInputActiveChange(isActive)
    });

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
      this.ui.setHint("Geo (Sensor) ist vorausgewaehlt. Starte den Modus, um die Site-Szene direkt ueber der Kamera zu sehen.");
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
      this.selectedExperienceMode = ExperienceMode.GEO_SENSOR;
      this.selectedPlacementMode = PlacementUIModel.GEO_GLOBAL;
    } catch (error) {
      this.siteConfig = null;
      this.ui.setMessage(`Site-Szene konnte nicht geladen werden: ${toMessage(error)}`);
      this.ui.setHint("Fallback-3D-Ansicht aktiv. Geo-Global-Modus bleibt deaktiviert.");
    }
  }

  async startSelectedExperience() {
    if (this.geoSensorActive || (this.arSessionManager && this.arSessionManager.isActive())) {
      return false;
    }

    if (this.selectedExperienceMode === ExperienceMode.GEO_SENSOR) {
      const cameraReady = await this.requestGeoCameraFromUserGesture();
      if (!cameraReady) {
        return false;
      }

      return this.startGeoSensorMode({
        cameraReady: true
      });
    }

    return this.startAR();
  }

  async stopActiveExperience() {
    if (this.geoSensorActive) {
      return this.stopGeoSensorMode();
    }

    return this.stopAR();
  }

  syncPresentationVisibility() {
    const showGeoGlobalScene = this.geoSensorActive && this.selectedPlacementMode === PlacementUIModel.GEO_GLOBAL;
    this.geoSceneManager.setVisible(showGeoGlobalScene);

    if (this.placementController) {
      this.placementController.setPresentationVisible(!showGeoGlobalScene);
    }
  }

  async requestGeoCameraFromUserGesture() {
    this.ui.setMessage("Starte Geo-Sensor-Modus...");

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

  async startGeoSensorMode({ cameraReady = false } = {}) {
    if (!this.siteConfig) {
      this.ui.setMessage("Geo-Sensor-Modus ist ohne Site-QR-Konfiguration nicht verfuegbar.");
      this.ui.setHint("Oeffne die App mit einem gueltigen ?site=... Parameter.");
      return false;
    }

    if (this.arSessionManager && this.arSessionManager.isActive()) {
      this.ui.setMessage("WebXR laeuft bereits. Beende zuerst den AR-Modus.");
      return false;
    }

    this.lastFrameTimeMs = 0;
    this.activeSurfaceState = null;
    if (!cameraReady) {
      const startedCamera = await this.requestGeoCameraFromUserGesture();
      if (!startedCamera) {
        return false;
      }
    }

    const started = await this.sensorFusion.start({
      origin: this.siteConfig.origin
    });

    if (!started) {
      console.error("Geo sensor start failed:", this.sensorFusion.getSnapshot());
      this.sceneManager.stopCameraVideo();
      this.sceneManager.setGeoMode(false);
      this.sceneManager.resetFallbackView();
      const sensorSnapshot = this.sensorFusion.getSnapshot();
      this.ui.setSessionState(false, sensorSnapshot.message);
      this.ui.setHint("Geo-Sensor-Modus benoetigt GPS sowie Kompass-/IMU-Zugriff.");
      return false;
    }

    this.geoSensorActive = true;
    this.syncPresentationVisibility();
    this.ui.setSessionState(true, `Geo-Sensor-Modus aktiv. Site '${this.siteConfig.id}' geladen.`);
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.syncDebugPanels();
    this.syncCanvasPointerState();
    this.ui.setHint("Geo-Sensor-Modus aktiv. Warte auf GPS und Heading; danach folgt die Szene deiner ENU-Position.");
    return true;
  }

  async stopGeoSensorMode() {
    if (!this.geoSensorActive) {
      return false;
    }

    this.lastFrameTimeMs = 0;
    this.geoSensorActive = false;
    this.sensorFusion.stop();
    this.sceneManager.stopCameraVideo();
    this.sceneManager.setGeoMode(false);
    this.sceneManager.resetFallbackView();
    this.syncPresentationVisibility();
    this.ui.setSessionState(false, "Geo-Sensor-Modus beendet. Fallback-3D-Ansicht aktiv.");
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.syncDebugPanels();
    this.ui.setHint("Fallback-3D-Ansicht aktiv. Geo-Sensor-Modus kann jederzeit erneut gestartet werden.");
    return true;
  }

  async startAR() {
    if (this.selectedPlacementMode === PlacementUIModel.GEO_GLOBAL) {
      this.ui.setMessage("Geo-Global-Modus nutzt den Sensor-Pfad. Waehle 'Geo (Sensor)' und starte diesen Modus.");
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
    this.captureGeoOriginFromDevice();
    this.sceneManager.setARMode(true);
    this.syncPresentationVisibility();
    this.ui.setSessionState(true, result.message);
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.syncDebugPanels();
    this.syncCanvasPointerState();

    if (this.placementController.getMode() === PlacementMode.GEO && !this.placementController.hasGeoOrigin()) {
      this.ui.setHint("Koordinaten-Modus aktiv. Warte auf Geraetestandort und stabile Flaeche.");
      return true;
    }

    this.ui.setHint("Bewege das Geraet langsam ueber Boden oder Tisch, bis eine stabile Referenzflaeche erkannt wird.");
    return true;
  }

  async stopAR() {
    await this.arSessionManager.endSession();
  }

  handleSessionEnded() {
    this.lastFrameTimeMs = 0;
    this.activeSurfaceState = null;
    this.hitTestManager.dispose();
    this.poseStabilizer.reset();
    this.sceneManager.setARMode(false);
    this.placementController.exitARMode();
    this.syncPresentationVisibility();
    this.handleTextInputActiveChange(false);
    this.ui.setSessionState(false, "AR beendet. Fallback-3D-Ansicht aktiv.");
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.syncDebugPanels();
    this.ui.setHint("Fallback-3D-Ansicht aktiv. AR kann jederzeit erneut gestartet werden.");
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
        this.captureGeoReferenceDirection(cameraState);
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
    }
  }

  applyPlacementMode(mode) {
    const normalizedMode = normalizePlacementUiMode(mode);
    if (this.geoSensorActive || (this.arSessionManager && this.arSessionManager.isActive())) {
      this.ui.setMessage("Moduswechsel ist nur moeglich, wenn kein AR- oder Geo-Sensor-Modus laeuft.");
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

    if (this.placementController.isPlaced()) {
      this.ui.setHint("Mode gewechselt. Bestehendes Placement bleibt bis zum Reset unveraendert.");
    } else if (normalizedMode === PlacementUIModel.GEO_LOCAL) {
      this.ui.setHint("Koordinaten-Modus aktiv. Bei stabiler Flaeche wird das Objekt relativ zur Geo-Position gesetzt.");
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
      this.ui.setMessage("Geo (Sensor) ist ohne Site-QR-Konfiguration nicht verfuegbar.");
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

    if (this.selectedExperienceMode === ExperienceMode.GEO_SENSOR) {
      this.ui.setHint("Geo (Sensor) ausgewaehlt. Beim Start wird die Site-Szene per GNSS/IMU ueber das Kamerabild gelegt.");
    } else if (this.selectedPlacementMode === PlacementUIModel.GEO_LOCAL) {
      this.ui.setHint("AR (WebXR) ausgewaehlt. Geo-Local nutzt weiter die bestehende Hit-Test- und Stabilizer-Kette.");
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

  maybePlaceGeoObject(surfaceState, cameraState) {
    if (this.isTextInputActive || !surfaceState.isStable || this.placementController.isPlaced()) {
      return;
    }

    if (!this.placementController.hasGeoOrigin()) {
      const captured = this.captureGeoOriginFromDevice();
      if (!captured) {
        return;
      }
    }

    const computation = this.placementController.computeGeoPosition(surfaceState.stablePose, cameraState);
    if (computation.status !== "ready" || !computation.pose) {
      return;
    }

    const placed = this.placementController.placeGeoAtPose(computation.pose, cameraState);
    if (!placed) {
      return;
    }

    this.ui.setPlacementState(true);
    this.ui.setMessage(
      `Objekt im Koordinaten-Modus platziert. Distanz zum Startpunkt: ${computation.distanceMeters.toFixed(1)} m.`
    );
    this.ui.setHint("Placement-Lock aktiv. Geo-Platzierung bleibt fixiert, bis du resettest.");
  }

  captureGeoOriginFromDevice() {
    const devicePosition = this.geoLocationService.getCurrentPosition();
    const geoCoord = toGeoCoord(devicePosition);
    if (!geoCoord) {
      return false;
    }

    return this.placementController.setGeoOrigin(geoCoord);
  }

  captureGeoReferenceDirection(cameraState) {
    if (!cameraState || this.placementController.hasGeoReferenceDirection()) {
      return false;
    }

    return this.placementController.setGeoReferenceDirection(cameraState.direction);
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

    if (this.geoSensorActive) {
      const enuPosition = geoSensorSnapshot && geoSensorSnapshot.enuPosition ? geoSensorSnapshot.enuPosition : null;
      this.ui.setGeoDebug({
        originLatitude: this.siteConfig ? this.siteConfig.origin.lat : null,
        originLongitude: this.siteConfig ? this.siteConfig.origin.lon : null,
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
    if (this.geoSensorActive) {
      if (!this.siteConfig) {
        this.ui.setHint("Keine Site geladen. Geo-Sensor-Modus benoetigt einen QR-Link mit ?site=...");
        return;
      }

      if (geoSensorSnapshot && geoSensorSnapshot.issue) {
        this.ui.setHint(geoSensorSnapshot.message || "Geo-Sensor-Daten sind aktuell nicht verfuegbar.");
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

      this.ui.setHint("Geo-Sensor-Modus aktiv. Szene und Marker folgen jetzt stabil deiner ENU-Position.");
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
      if (!this.geoLocationService.getCurrentPosition()) {
        this.ui.setHint("Keine Geraeteposition verfuegbar. Aktiviere zuerst den Standort.");
      } else if (!this.placementController.hasGeoReferenceDirection()) {
        this.ui.setHint("Geo-Referenz wird initialisiert. Halte die Blickrichtung kurz stabil.");
      } else if (this.geoLocationService.getStatus() !== "granted") {
        this.ui.setHint("Koordinaten-Modus aktiv. Aktiviere zuerst den Standort ueber 'Standort aktivieren'.");
      } else {
        this.ui.setHint("Koordinaten-Modus aktiv. Warte auf Geraetestandort, um die Zielposition zu berechnen.");
      }
      return;
    }

    if (!this.placementController.hasGeoReferenceDirection()) {
      this.ui.setHint("Geo-Referenz wird initialisiert. Halte die Blickrichtung kurz stabil.");
      return;
    }

    if (geoDebug.status === "missing-origin") {
      this.ui.setHint("Keine Geraeteposition verfuegbar.");
      return;
    }

    if (geoDebug.status === "too-far" && Number.isFinite(geoDebug.distanceMeters)) {
      this.ui.setHint(`Ziel zu weit entfernt: ${geoDebug.distanceMeters.toFixed(1)} m. Sichtbarkeit endet bei 100 m.`);
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

    this.ui.setHint("Stabile Flaeche erkannt. Geo-Ziel wird relativ zum Startpunkt auf dem Boden gesetzt.");
  }

  resetPlacement() {
    if (this.geoSensorActive) {
      this.ui.setMessage("Geo-Sensor-Modus nutzt kein hit-test-basiertes Placement.");
      this.ui.setHint("Nutze 'Ausrichtung kalibrieren', wenn die Szene neu ausgerichtet werden soll.");
      return;
    }

    this.lastFrameTimeMs = 0;
    this.activeSurfaceState = null;
    this.poseStabilizer.reset();
    if (this.arSessionManager) {
      this.arSessionManager.clearOriginPose();
    }
    this.placementController.resetPlacement();
    this.ui.setPlacementState(false);
    this.ui.setSurfaceState(false, false);
    this.syncDebugPanels();

    if (this.arSessionManager && this.arSessionManager.isActive()) {
      this.ui.setMessage("Placement wurde zurueckgesetzt.");
      if (this.placementController.getMode() === PlacementMode.GEO) {
        this.ui.setHint("Suche eine neue stabile Flaeche. Das Geo-Ziel wird danach erneut auf dem Boden platziert.");
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

    if (this.placementController) {
      this.placementController.dispose();
    }

    this.ui.dispose();
    this.geoSceneManager.dispose();
    this.sceneManager.dispose();
  }
}
