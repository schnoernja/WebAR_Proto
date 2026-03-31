import { SceneManager } from "./SceneManager.js";
import { ARSessionManager } from "./ARSessionManager.js";
import { HitTestManager } from "./HitTestManager.js";
import { PoseStabilizer } from "./PoseStabilizer.js";
import { PlacementController } from "./PlacementController.js";
import { UIController } from "./UIController.js";

function toMessage(error, fallbackMessage = "unbekannter Fehler") {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
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
    this.placementController = null;
    this.arSessionManager = null;
    this.lastFrameTimeMs = 0;

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

    if (assetInfo.usedPlaceholder) {
      this.ui.setHint("Modell konnte nicht geladen werden. Platzhalter aktiv.");
    } else {
      this.ui.setHint("Fallback-3D-Ansicht aktiv. Im AR-Modus eine stabile Flaeche ruhig anvisieren.");
    }

    this.arSessionManager = new ARSessionManager({
      renderer: this.sceneManager.getRenderer(),
      overlayRoot: this.document.getElementById("hud"),
      onSessionEnded: this.handleSessionEnded,
      onSelect: this.handleSelect
    });

    this.ui.bindActions({
      onStartAR: () => this.startAR(),
      onPlace: () => this.placeObject(),
      onResetPlacement: () => this.resetPlacement(),
      onStopAR: () => this.stopAR()
    });

    const support = await this.arSessionManager.checkSupport();
    this.ui.setSupportState(support.available, support.message);
    this.ui.setSessionState(false, support.available ? "AR kann gestartet werden." : support.message);
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);

    this.sceneManager.setAnimationLoop(this.handleFrame);
  }

  async startAR() {
    this.lastFrameTimeMs = 0;
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
    this.placementController.enterARMode();
    this.sceneManager.setARMode(true);
    this.ui.setSessionState(true, result.message);
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.ui.setHint("Bewege das Geraet langsam ueber Boden oder Tisch, bis der Reticle stabil wird.");
  }

  async stopAR() {
    await this.arSessionManager.endSession();
  }

  handleSessionEnded() {
    this.lastFrameTimeMs = 0;
    this.hitTestManager.dispose();
    this.poseStabilizer.reset();
    this.sceneManager.setARMode(false);
    this.placementController.exitARMode();
    this.ui.setSessionState(false, "AR beendet. Fallback-3D-Ansicht aktiv.");
    this.ui.setTrackingState(false);
    this.ui.setSurfaceState(false, false);
    this.ui.setPlacementState(false);
    this.ui.setHint("Fallback-3D-Ansicht aktiv. AR kann jederzeit erneut gestartet werden.");
  }

  handleFrame(timeMs, frame) {
    const deltaSeconds = this.computeDeltaSeconds(timeMs);

    if (this.arSessionManager && this.arSessionManager.isActive()) {
      const referenceSpace = this.arSessionManager.getReferenceSpace();
      const tracking =
        Boolean(frame) &&
        Boolean(referenceSpace) &&
        Boolean(frame.getViewerPose(referenceSpace));

      this.ui.setTrackingState(tracking);

      let surfaceState = null;
      if (tracking && frame && referenceSpace) {
        const hitResult = this.hitTestManager.update(frame, referenceSpace);
        surfaceState = this.poseStabilizer.update(hitResult.pose, deltaSeconds);
      } else {
        surfaceState = this.poseStabilizer.update(null, deltaSeconds);
      }

      this.placementController.updateSurfaceState(surfaceState);
      this.ui.setSurfaceState(surfaceState.surfaceDetected, surfaceState.isStable);
      this.ui.setPlacementState(this.placementController.isPlaced());

      if (!this.placementController.isPlaced()) {
        if (surfaceState.isStable) {
          this.ui.setHint("Flaeche stabil. Tippen oder 'Objekt setzen' druecken.");
        } else if (surfaceState.surfaceDetected) {
          this.ui.setHint("Flaeche erkannt. Kurz ruhig halten, damit die Mehrframe-Pruefung stabil wird.");
        } else {
          this.ui.setHint("Keine Flaeche erkannt. Geraet ruhig ueber eine ebene Umgebung bewegen.");
        }
      } else {
        this.ui.setHint("Objekt fixiert. 'Neu platzieren' hebt den Placement-Lock wieder auf.");
      }
    }

    this.sceneManager.render();
  }

  handleSelect() {
    this.placeObject();
  }

  placeObject() {
    if (!this.arSessionManager || !this.arSessionManager.isActive()) {
      return;
    }

    const placed = this.placementController.placeCurrent();
    if (placed) {
      this.ui.setPlacementState(true);
      this.ui.setMessage("Objekt stabil im Raum fixiert.");
      this.ui.setHint("Placement-Lock aktiv. Neu platzieren nur auf expliziten Befehl.");
      return;
    }

    this.ui.setMessage("Noch keine stabile Flaeche fuer die Platzierung.");
  }

  resetPlacement() {
    this.lastFrameTimeMs = 0;
    this.poseStabilizer.reset();
    this.placementController.resetPlacement();
    this.ui.setPlacementState(false);
    this.ui.setSurfaceState(false, false);

    if (this.arSessionManager && this.arSessionManager.isActive()) {
      this.ui.setMessage("Placement-Lock geloest.");
      this.ui.setHint("Neu platzieren aktiv. Flaeche erneut ruhig anvisieren.");
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

    if (this.placementController) {
      this.placementController.dispose();
    }

    this.ui.dispose();
    this.sceneManager.dispose();
  }
}
