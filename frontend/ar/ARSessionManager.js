import { APP_CONFIG } from "./config.js";
import { clonePose } from "./utils.js";

function toMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

export class ARSessionManager {
  constructor({ renderer, overlayRoot, onSessionEnded }) {
    this.renderer = renderer;
    this.overlayRoot = overlayRoot;
    this.onSessionEnded = onSessionEnded;
    this.session = null;
    this.originPose = null;
    this.handleSessionEnd = this.handleSessionEnd.bind(this);
  }

  async checkSupport() {
    if (!window.isSecureContext) {
      return {
        available: false,
        message: "Immersive AR benoetigt HTTPS oder localhost."
      };
    }

    if (!navigator.xr || typeof navigator.xr.isSessionSupported !== "function") {
      return {
        available: false,
        message: "Dieser Browser bietet keine WebXR-Schnittstelle."
      };
    }

    try {
      const supported = await navigator.xr.isSessionSupported(APP_CONFIG.ar.sessionMode);
      return {
        available: supported,
        message: supported
          ? "WebXR immersive-ar ist verfuegbar."
          : "Immersive AR wird auf diesem Geraet oder Browser nicht angeboten."
      };
    } catch (error) {
      return {
        available: false,
        message: `WebXR-Pruefung fehlgeschlagen: ${toMessage(error, "unbekannt")}`
      };
    }
  }

  async startSession() {
    if (this.session) {
      return {
        started: true,
        session: this.session,
        message: "AR-Session laeuft bereits.",
        domOverlayActive: Boolean(this.session.domOverlayState)
      };
    }

    const support = await this.checkSupport();
    if (!support.available) {
      return {
        started: false,
        message: support.message
      };
    }

    const preferredInit = {
      requiredFeatures: APP_CONFIG.ar.requiredFeatures,
      optionalFeatures: APP_CONFIG.ar.optionalFeatures,
      domOverlay: this.overlayRoot ? { root: this.overlayRoot } : undefined
    };
    const fallbackInit = {
      requiredFeatures: APP_CONFIG.ar.requiredFeatures
    };

    let session = null;

    try {
      session = await navigator.xr.requestSession(APP_CONFIG.ar.sessionMode, preferredInit);
    } catch (firstError) {
      try {
        session = await navigator.xr.requestSession(APP_CONFIG.ar.sessionMode, fallbackInit);
      } catch (secondError) {
        return {
          started: false,
          message: `AR-Session konnte nicht gestartet werden: ${toMessage(
            secondError,
            toMessage(firstError, "unbekannter Fehler")
          )}`
        };
      }
    }

    this.session = session;
    this.originPose = null;
    this.session.addEventListener("end", this.handleSessionEnd);

    try {
      this.renderer.xr.setReferenceSpaceType(APP_CONFIG.ar.referenceSpaceType);
      await this.renderer.xr.setSession(this.session);
    } catch (error) {
      this.session.removeEventListener("end", this.handleSessionEnd);

      try {
        await this.session.end();
      } catch {
        // Ignore cleanup errors here and surface the renderer/session binding failure.
      }

      this.session = null;
      this.originPose = null;

      return {
        started: false,
        message: `XR-Session konnte nicht an den Renderer gebunden werden: ${toMessage(
          error,
          "unbekannter Fehler"
        )}`
      };
    }

    return {
      started: true,
      session: this.session,
      message: this.session.domOverlayState
        ? "AR-Session aktiv."
        : "AR-Session aktiv. Browser zeigt kein DOM-Overlay an.",
      domOverlayActive: Boolean(this.session.domOverlayState)
    };
  }

  async endSession() {
    if (!this.session) {
      return;
    }

    await this.session.end();
  }

  isActive() {
    return this.session !== null;
  }

  getReferenceSpace() {
    return this.renderer.xr.getReferenceSpace();
  }

  getSession() {
    return this.session;
  }

  hasOriginPose() {
    return this.originPose !== null;
  }

  setOriginPose(pose) {
    if (!pose || this.originPose) {
      return false;
    }

    this.originPose = clonePose(pose);
    return true;
  }

  getOriginPose() {
    return this.originPose ? clonePose(this.originPose) : null;
  }

  clearOriginPose() {
    this.originPose = null;
  }

  handleSessionEnd() {
    if (this.session) {
      this.session.removeEventListener("end", this.handleSessionEnd);
    }

    this.session = null;
    this.originPose = null;

    if (typeof this.onSessionEnded === "function") {
      this.onSessionEnded();
    }
  }
}
