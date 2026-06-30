import { APP_CONFIG } from "./config.js";
import { clonePose } from "./utils.js";

function toMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

export class ARSessionManager {
  constructor({ renderer, overlayRoot, onSessionEnded, onSelect }) {
    this.renderer = renderer;
    this.overlayRoot = overlayRoot;
    this.onSessionEnded = onSessionEnded;
    this.onSelect = onSelect;
    this.session = null;
    this.originPose = null;
    this.handleSessionEnd = this.handleSessionEnd.bind(this);
    this.handleSelect = this.handleSelect.bind(this);
  }

  async checkSupport() {
    console.info("[WebXR] AR-Support wird geprueft.");

    if (!window.isSecureContext) {
      console.warn("[WebXR] AR-Support fehlt: HTTPS oder localhost erforderlich.");
      return {
        available: false,
        message: "Immersive AR benoetigt HTTPS oder localhost."
      };
    }

    if (!navigator.xr || typeof navigator.xr.isSessionSupported !== "function") {
      console.warn("[WebXR] AR-Support fehlt: WebXR-Schnittstelle nicht verfuegbar.");
      return {
        available: false,
        message: "Dieser Browser bietet keine WebXR-Schnittstelle."
      };
    }

    try {
      const supported = await navigator.xr.isSessionSupported(APP_CONFIG.ar.sessionMode);
      console.info(`[WebXR] immersive-ar Support: ${supported ? "verfuegbar" : "nicht verfuegbar"}.`);
      return {
        available: supported,
        message: supported
          ? "WebXR immersive-ar ist verfuegbar."
          : "Immersive AR wird auf diesem Geraet oder Browser nicht angeboten."
      };
    } catch (error) {
      console.error("[WebXR] AR-Supportpruefung fehlgeschlagen:", error);
      return {
        available: false,
        message: `WebXR-Pruefung fehlgeschlagen: ${toMessage(error, "unbekannt")}`
      };
    }
  }

  async startSession({ skipSupportCheck = false } = {}) {
    if (this.session) {
      return {
        started: true,
        session: this.session,
        message: "AR-Session laeuft bereits.",
        domOverlayActive: Boolean(this.session.domOverlayState)
      };
    }

    if (!skipSupportCheck) {
      const support = await this.checkSupport();
      if (!support.available) {
        return {
          started: false,
          message: support.message
        };
      }
    } else {
      if (!window.isSecureContext) {
        return {
          started: false,
          message: "Immersive AR benoetigt HTTPS oder localhost."
        };
      }

      if (!navigator.xr || typeof navigator.xr.requestSession !== "function") {
        return {
          started: false,
          message: "Dieser Browser bietet keine WebXR-Schnittstelle."
        };
      }
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

    console.info("[WebXR] immersive-ar Session wird angefragt.");
    try {
      session = await navigator.xr.requestSession(APP_CONFIG.ar.sessionMode, preferredInit);
    } catch (firstError) {
      console.warn("[WebXR] Session mit optionalen Features fehlgeschlagen; Fallback wird angefragt.");
      try {
        session = await navigator.xr.requestSession(APP_CONFIG.ar.sessionMode, fallbackInit);
      } catch (secondError) {
        console.error("[WebXR] AR-Session konnte nicht gestartet werden:", secondError);
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
    this.session.addEventListener("select", this.handleSelect);

    try {
      this.renderer.xr.setReferenceSpaceType(APP_CONFIG.ar.referenceSpaceType);
      await this.renderer.xr.setSession(this.session);
    } catch (error) {
      this.session.removeEventListener("end", this.handleSessionEnd);
      this.session.removeEventListener("select", this.handleSelect);

      try {
        await this.session.end();
      } catch {
        // Ignore cleanup errors here and surface the renderer/session binding failure.
      }

      this.session = null;
      this.originPose = null;
      console.error("[WebXR] AR-Session konnte nicht an den Renderer gebunden werden:", error);

      return {
        started: false,
        message: `XR-Session konnte nicht an den Renderer gebunden werden: ${toMessage(
          error,
          "unbekannter Fehler"
        )}`
      };
    }

    console.info("[WebXR] AR-Session gestartet.");
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

  handleSelect(event) {
    if (typeof this.onSelect === "function") {
      this.onSelect(event);
    }
  }

  handleSessionEnd() {
    if (this.session) {
      this.session.removeEventListener("end", this.handleSessionEnd);
      this.session.removeEventListener("select", this.handleSelect);
    }

    this.session = null;
    this.originPose = null;

    if (typeof this.onSessionEnded === "function") {
      this.onSessionEnded();
    }
  }
}
