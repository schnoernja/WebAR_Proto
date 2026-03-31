import * as THREE from "three";
import { SceneManager } from "./SceneManager.js";
import { ARSessionManager } from "./ARSessionManager.js";
import { HitTestManager } from "./HitTestManager.js";
import { PoseStabilizer } from "./PoseStabilizer.js";
import { PlacementController, PlacementMode } from "./PlacementController.js";
import { UIController } from "./UIController.js";
import { GeoLocationService } from "./GeoLocationService.js";

function toMessage(error, fallbackMessage = "unbekannter Fehler") {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
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

  const position = new THREE.Vector3(
    viewerPose.transform.position.x,
    viewerPose.transform.position.y,
    viewerPose.transform.position.z
  );
  const orientation = new THREE.Quaternion(
    viewerPose.transform.orientation.x,
    viewerPose.transform.orientation.y,
    viewerPose.transform.orientation.z,
    viewerPose.transform.orientation.w
  );
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
    this.hitTestManager = new HitTestManager();
    this.poseStabilizer = new PoseStabilizer();
    this.geoLocationService = new GeoLocationService();
    this.placementController = null;
    this.arSessionManager = null;
    this.lastFrameTimeMs = 0;
    this.activeSurfaceState = null;
    this.isUIInteracting = false;

    this.handleFrame = this.handleFrame.bind(this);
    this.handleSessionEnded = this.handleSessionEnded.bind(this);
    this.handleSelect = this.handleSelect.bind(this);
  }

  async init() {
    await this.sceneManager.initialize();

    this.placementController = new PlacementController({
      scene: this.sceneManager.getScene()
    });

    const assetInfo = await this.sceneManager.createPlacementAsset();
    this.placementController.setAsset(assetInfo.object);

    this.ui.setAssetLabel(assetInfo.label);
    this.ui.setPlacementMode(this.placementController.getMode());
    this.ui.setGeoTargetInputs(this.placementController.getGeoTarget());
    this.ui.bindGeoLocationService(this.geoLocationService);

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
      onStartAR: () => this.startAR(),
      onPlace: () => this.placeFreeObject(),
      onResetPlacement: () => this.resetPlacement(),
      onStopAR: () => this.stopAR(),
      onApplyGeoTarget: (coord) => this.applyGeoTarget(coord),
      onModeChange: (mode) => this.applyPlacementMode(mode),
      onRequestGeolocation: () => this.requestGeoLocation(),
      onUIInteractionChange: (isInteracting) => this.handleUIInteractionChange(isInteracting),
      onHudCollapsedChange: (isCollapsed) => this.handleHudCollapsedChange(isCollapsed)
    });

    const support = await this.arSessionManager.checkSupport();
    this.ui.setSupportState(support.available, support.message);
    this.ui.setSessionState(false, support.available ? "AR kann gestartet werden." : support.message);
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.syncDebugPanels();

    this.sceneManager.setAnimationLoop(this.handleFrame);
  }

  async startAR() {
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
    this.captureGeoOriginFromDevice();
    this.sceneManager.setARMode(true);
    this.ui.setSessionState(true, result.message);
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.syncDebugPanels();

    if (this.placementController.getMode() === PlacementMode.GEO && !this.placementController.hasGeoOrigin()) {
      this.ui.setHint("Koordinaten-Modus aktiv. Warte auf Geraetestandort und stabile Flaeche.");
      return;
    }

    this.ui.setHint("Bewege das Geraet langsam ueber Boden oder Tisch, bis eine stabile Referenzflaeche erkannt wird.");
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
    }

    this.sceneManager.render();
  }

  handleSelect() {
    if (this.isUIInteracting) {
      return;
    }

    if (this.placementController.getMode() === PlacementMode.FREE) {
      this.placeFreeObject();
    }
  }

  applyPlacementMode(mode) {
    const accepted = this.placementController.setMode(mode);
    if (!accepted) {
      this.ui.setMessage("Platzierungsmodus konnte nicht gewechselt werden.");
      return false;
    }

    this.ui.setPlacementMode(this.placementController.getMode());

    if (this.placementController.isPlaced()) {
      this.ui.setHint("Mode gewechselt. Bestehendes Placement bleibt bis zum Reset unveraendert.");
    } else if (this.placementController.getMode() === PlacementMode.GEO) {
      this.ui.setHint("Koordinaten-Modus aktiv. Bei stabiler Flaeche wird das Objekt relativ zur Geo-Position gesetzt.");
    } else {
      this.ui.setHint("Freie Platzierung aktiv. Sobald das Reticle stabil ist, kannst du das Objekt setzen.");
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

  placeFreeObject() {
    if (!this.arSessionManager || !this.arSessionManager.isActive()) {
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
    if (!surfaceState.isStable || this.placementController.isPlaced()) {
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

  handleHudCollapsedChange(isCollapsed) {
    this.sceneManager.setCanvasPointerEvents(isCollapsed ? "auto" : "none");
  }

  syncDebugPanels(surfaceState = null, cameraState = null) {
    if (!this.placementController) {
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

  updateInteractionHint(surfaceState, tracking, cameraState) {
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
    this.sceneManager.dispose();
  }
}
