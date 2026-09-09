export const PlacementBackendState = Object.freeze({
  IDLE: "idle",
  REQUESTING_PERMISSION: "requesting-permission",
  INITIALIZING: "initializing",
  SCANNING: "scanning",
  READY_TO_PLACE: "ready-to-place",
  PLACED: "placed",
  TRACKING_LOST: "tracking-lost",
  ERROR: "error",
  STOPPED: "stopped"
});

const ENGINE_URL = new URL("../vendor/8thwall/xr.js", import.meta.url).href;
const PIPELINE_MODULE_NAME = "epartwin-ios-world-tracking";
const CAMERA_START_HEIGHT_METERS = 1.6;
const HIT_TEST_X = 0.5;
const HIT_TEST_Y = 0.62;
const SURFACE_DWELL_MS = 1200;
const SURFACE_HIT_GRACE_MS = 300;
const TRACKING_LOSS_GRACE_MS = 500;
const ABSOLUTE_SCALE_MOTION_METERS = 0.12;
const HIT_TYPE_PRIORITY = Object.freeze({
  DETECTED_SURFACE: 3,
  ESTIMATED_SURFACE: 2,
  FEATURE_POINT: 1,
  UNSPECIFIED: 0
});

function errorMessage(error, fallback = "AR konnte nicht initialisiert werden.") {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function selectBestHit(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  return [...results].sort((a, b) => {
    const distanceDifference =
      (Number.isFinite(a.distance) ? a.distance : Number.POSITIVE_INFINITY) -
      (Number.isFinite(b.distance) ? b.distance : Number.POSITIVE_INFINITY);
    if (distanceDifference !== 0) {
      return distanceDifference;
    }
    const typeDifference = (HIT_TYPE_PRIORITY[b.type] || 0) - (HIT_TYPE_PRIORITY[a.type] || 0);
    if (typeDifference !== 0) {
      return typeDifference;
    }
    return 0;
  })[0];
}

export class IOSWebSLAMPlacementBackend {
  constructor({
    sceneManager,
    threeRef,
    windowRef = window,
    documentRef = document,
    engineUrl = ENGINE_URL,
    onStateChange = null
  } = {}) {
    this.sceneManager = sceneManager;
    this.THREE = threeRef;
    this.window = windowRef;
    this.document = documentRef;
    this.engineUrl = engineUrl;
    this.onStateChange = onStateChange;
    this.enginePromise = null;
    this.xr8 = null;
    this.pipelineModule = null;
    this.videoElement = null;
    this.active = false;
    this.pipelineStarted = false;
    this.preRenderPending = false;
    this.latestReality = null;
    this.lastTracking = false;
    this.lastNormalTrackingAtMs = null;
    this.surfaceHitStartedAtMs = null;
    this.lastSurfaceHitAtMs = null;
    this.scaleMotionOrigin = null;
    this.absoluteScaleMotionObserved = false;
    this.placed = false;
    this.state = PlacementBackendState.IDLE;
    this.error = null;
  }

  setState(state, detail = null) {
    if (this.state === state && detail === null) {
      return;
    }
    this.state = state;
    if (typeof this.onStateChange === "function") {
      this.onStateChange({ state, detail });
    }
  }

  prepare() {
    if (this.window.XR8) {
      this.xr8 = this.window.XR8;
      return Promise.resolve(this.xr8);
    }
    if (this.enginePromise) {
      return this.enginePromise;
    }

    this.setState(PlacementBackendState.INITIALIZING);
    this.enginePromise = new Promise((resolve, reject) => {
      let script = this.document.querySelector("script[data-epartwin-xr-engine]");
      const cleanup = () => {
        this.window.removeEventListener("xrloaded", handleLoaded);
        if (script) {
          script.removeEventListener("error", handleError);
        }
      };
      const handleLoaded = () => {
        cleanup();
        if (!this.window.XR8) {
          reject(new Error("Die AR-Engine wurde geladen, ist aber nicht verfügbar."));
          return;
        }
        this.xr8 = this.window.XR8;
        resolve(this.xr8);
      };
      const handleError = () => {
        cleanup();
        reject(new Error("Die AR-Engine konnte nicht geladen werden."));
      };

      this.window.addEventListener("xrloaded", handleLoaded, { once: true });
      if (!script) {
        script = this.document.createElement("script");
        script.async = true;
        script.crossOrigin = "anonymous";
        script.src = this.engineUrl;
        script.dataset.preloadChunks = "slam";
        script.dataset.epartwinXrEngine = "true";
        this.document.head.appendChild(script);
      }
      script.addEventListener("error", handleError, { once: true });

      if (this.window.XR8) {
        handleLoaded();
      }
    }).catch((error) => {
      this.enginePromise = null;
      this.error = error;
      this.setState(PlacementBackendState.ERROR, errorMessage(error));
      throw error;
    });

    return this.enginePromise;
  }

  createPipelineModule() {
    return {
      name: PIPELINE_MODULE_NAME,
      onCameraStatusChange: ({ status, stream }) => {
        if (status === "requesting") {
          this.setState(PlacementBackendState.REQUESTING_PERMISSION);
        } else if (status === "hasStream") {
          this.attachVideoStream(stream);
          this.setState(PlacementBackendState.INITIALIZING);
        } else if (status === "hasVideo") {
          this.setState(PlacementBackendState.SCANNING);
        } else if (status === "failed") {
          this.error = new Error("Der Kamerazugriff wurde verweigert oder ist nicht verfügbar.");
          this.setState(PlacementBackendState.ERROR, this.error.message);
        }
      },
      onAttach: ({ stream }) => this.attachVideoStream(stream),
      onStart: ({ canvasWidth, canvasHeight }) => {
        this.pipelineStarted = true;
        this.xr8.XrController.updateCameraProjectionMatrix({
          cam: {
            pixelRectWidth: canvasWidth,
            pixelRectHeight: canvasHeight,
            nearClipPlane: 0.01,
            farClipPlane: 40
          },
          origin: { x: 0, y: CAMERA_START_HEIGHT_METERS, z: 0 },
          facing: { w: 1, x: 0, y: 0, z: 0 }
        });
        this.setState(PlacementBackendState.SCANNING);
      },
      onUpdate: ({ processCpuResult }) => {
        this.latestReality = processCpuResult && processCpuResult.reality
          ? processCpuResult.reality
          : null;
      },
      onException: (error) => {
        this.error = error instanceof Error ? error : new Error(errorMessage(error));
        this.setState(PlacementBackendState.ERROR, this.error.message);
      },
      onDetach: () => {
        this.pipelineStarted = false;
        this.latestReality = null;
      }
    };
  }

  attachVideoStream(stream) {
    if (!this.videoElement || !stream || this.videoElement.srcObject === stream) {
      return;
    }
    this.videoElement.srcObject = stream;
    this.videoElement.play().catch(() => {
      // Der Stream bleibt gesetzt; Safari startet ihn nach Freigabe automatisch erneut.
    });
  }

  async start({ videoElement } = {}) {
    if (this.active) {
      return true;
    }
    if (!this.sceneManager || !this.THREE) {
      throw new Error("Das AR-Backend wurde nicht vollständig konfiguriert.");
    }

    this.videoElement = videoElement || null;
    this.error = null;
    this.latestReality = null;
    this.lastTracking = false;
    this.lastNormalTrackingAtMs = null;
    this.resetSurfaceReadiness();
    this.placed = false;
    const xr8 = await this.prepare();

    if (!xr8.XrController || !xr8.XrConfig || typeof xr8.run !== "function") {
      throw new Error("Die geladene AR-Engine stellt die benötigten Schnittstellen nicht bereit.");
    }

    const allowedDevices = xr8.XrConfig.device().MOBILE;
    if (
      xr8.XrDevice &&
      typeof xr8.XrDevice.isDeviceBrowserCompatible === "function" &&
      !xr8.XrDevice.isDeviceBrowserCompatible({ allowedDevices })
    ) {
      throw new Error("Dieses Gerät oder dieser Browser erfüllt die AR-Anforderungen nicht.");
    }

    xr8.XrController.configure({
      disableWorldTracking: false,
      enableLighting: false,
      enableWorldPoints: false,
      leftHandedAxes: false,
      mirroredDisplay: false,
      scale: "absolute"
    });
    this.pipelineModule = this.createPipelineModule();
    xr8.addCameraPipelineModules([
      xr8.XrController.pipelineModule(),
      this.pipelineModule
    ]);

    this.active = true;
    this.setState(PlacementBackendState.REQUESTING_PERMISSION);
    xr8.run({
      canvas: this.sceneManager.getCanvasElement(),
      ownRunLoop: false,
      cameraConfig: { direction: xr8.XrConfig.camera().BACK },
      allowedDevices,
      glContextConfig: {
        alpha: true,
        antialias: true,
        depth: true,
        stencil: true,
        preserveDrawingBuffer: false
      }
    });
    return true;
  }

  update(timeMs, camera) {
    if (!this.active || !this.xr8) {
      return this.emptyFrame();
    }

    try {
      this.xr8.runPreRender(timeMs);
      this.preRenderPending = true;
      const renderer = this.sceneManager.getRenderer();
      if (renderer && typeof renderer.resetState === "function") {
        renderer.resetState();
      }
    } catch (error) {
      this.error = error instanceof Error ? error : new Error(errorMessage(error));
      this.setState(PlacementBackendState.ERROR, this.error.message);
      return this.emptyFrame({ error: this.error });
    }

    if (this.error) {
      return this.emptyFrame({ error: this.error });
    }

    const reality = this.latestReality;
    const hasCameraPose = Boolean(
      reality &&
      reality.position &&
      reality.rotation &&
      reality.trackingReason !== "INITIALIZING"
    );
    const normalTracking = hasCameraPose && reality.trackingStatus === "NORMAL";
    if (normalTracking) {
      this.lastNormalTrackingAtMs = timeMs;
    }
    const withinTrackingGrace = Boolean(
      !normalTracking &&
      hasCameraPose &&
      this.lastTracking &&
      Number.isFinite(this.lastNormalTrackingAtMs) &&
      Number.isFinite(timeMs) &&
      timeMs - this.lastNormalTrackingAtMs <= TRACKING_LOSS_GRACE_MS
    );
    const tracking = normalTracking || withinTrackingGrace;
    const trackingLost = this.lastTracking && !tracking;
    this.lastTracking = tracking;

    if (!tracking) {
      this.resetSurfaceReadiness();
      this.setState(
        trackingLost ? PlacementBackendState.TRACKING_LOST : PlacementBackendState.SCANNING
      );
      return this.emptyFrame({ trackingLost, error: this.error });
    }

    if (withinTrackingGrace) {
      this.setState(
        this.placed ? PlacementBackendState.PLACED : PlacementBackendState.SCANNING
      );
      return {
        tracking: true,
        trackingLost: false,
        surfaceDetected: false,
        isStable: false,
        pose: null,
        cameraPose: {
          position: camera.position.clone(),
          quaternion: camera.quaternion.clone()
        },
        hitType: null,
        error: null
      };
    }

    camera.matrixAutoUpdate = false;
    camera.position.set(reality.position.x, reality.position.y, reality.position.z);
    camera.quaternion.set(
      reality.rotation.x,
      reality.rotation.y,
      reality.rotation.z,
      reality.rotation.w
    );
    if (Array.isArray(reality.intrinsics) && reality.intrinsics.length === 16) {
      camera.projectionMatrix.fromArray(reality.intrinsics);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
    camera.updateMatrix();
    camera.updateMatrixWorld(true);

    const hit = selectBestHit(
      this.xr8.XrController.hitTest(HIT_TEST_X, HIT_TEST_Y, ["FEATURE_POINT"])
    );
    const pose = hit && hit.position
      ? {
          position: new this.THREE.Vector3(hit.position.x, hit.position.y, hit.position.z),
          quaternion: hit.rotation
            ? new this.THREE.Quaternion(hit.rotation.x, hit.rotation.y, hit.rotation.z, hit.rotation.w)
            : new this.THREE.Quaternion()
        }
      : null;
    const isStable = this.updateSurfaceReadiness(timeMs, Boolean(pose), camera.position);

    this.setState(
      this.placed
        ? PlacementBackendState.PLACED
        : pose
          ? PlacementBackendState.READY_TO_PLACE
          : PlacementBackendState.SCANNING
    );
    return {
      tracking: true,
      trackingLost: false,
      surfaceDetected: Boolean(pose),
      isStable,
      pose,
      cameraPose: {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone()
      },
      hitType: hit ? hit.type : null,
      error: null
    };
  }

  finishFrame() {
    if (!this.active || !this.xr8 || !this.preRenderPending) {
      return;
    }
    this.preRenderPending = false;
    this.xr8.runPostRender();
  }

  emptyFrame({ trackingLost = false, error = null } = {}) {
    return {
      tracking: false,
      trackingLost,
      surfaceDetected: false,
      isStable: false,
      pose: null,
      cameraPose: null,
      hitType: null,
      error
    };
  }

  reset() {
    this.latestReality = null;
    this.lastTracking = false;
    this.lastNormalTrackingAtMs = null;
    this.resetSurfaceReadiness();
    this.placed = false;
    if (this.active && this.xr8 && this.xr8.XrController) {
      this.xr8.XrController.recenter();
    }
    this.setState(PlacementBackendState.SCANNING);
  }

  stop() {
    if (this.xr8 && this.active) {
      this.xr8.stop();
      this.xr8.clearCameraPipelineModules();
    }
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
    }
    this.active = false;
    this.pipelineStarted = false;
    this.preRenderPending = false;
    this.latestReality = null;
    this.lastTracking = false;
    this.lastNormalTrackingAtMs = null;
    this.resetSurfaceReadiness();
    this.placed = false;
    this.pipelineModule = null;
    this.error = null;
    this.setState(PlacementBackendState.STOPPED);
  }

  isActive() {
    return this.active;
  }

  isTracking() {
    return this.lastTracking;
  }

  updateSurfaceReadiness(timeMs, hasHit, cameraPosition = null) {
    if (!Number.isFinite(timeMs)) {
      return false;
    }

    if (cameraPosition && !this.scaleMotionOrigin) {
      this.scaleMotionOrigin = {
        x: cameraPosition.x,
        y: cameraPosition.y,
        z: cameraPosition.z
      };
    } else if (cameraPosition && !this.absoluteScaleMotionObserved) {
      const dx = cameraPosition.x - this.scaleMotionOrigin.x;
      const dy = cameraPosition.y - this.scaleMotionOrigin.y;
      const dz = cameraPosition.z - this.scaleMotionOrigin.z;
      this.absoluteScaleMotionObserved = Math.hypot(dx, dy, dz) >= ABSOLUTE_SCALE_MOTION_METERS;
    }

    if (hasHit) {
      const previousHitAtMs = this.lastSurfaceHitAtMs;
      if (
        this.surfaceHitStartedAtMs === null ||
        (previousHitAtMs !== null && timeMs - previousHitAtMs > SURFACE_HIT_GRACE_MS)
      ) {
        this.surfaceHitStartedAtMs = timeMs;
      }
      this.lastSurfaceHitAtMs = timeMs;
      return (
        this.absoluteScaleMotionObserved &&
        timeMs - this.surfaceHitStartedAtMs >= SURFACE_DWELL_MS
      );
    }

    if (
      this.lastSurfaceHitAtMs === null ||
      timeMs - this.lastSurfaceHitAtMs > SURFACE_HIT_GRACE_MS
    ) {
      this.resetSurfaceHitReadiness();
    }
    return false;
  }

  resetSurfaceHitReadiness() {
    this.surfaceHitStartedAtMs = null;
    this.lastSurfaceHitAtMs = null;
  }

  resetSurfaceReadiness() {
    this.resetSurfaceHitReadiness();
    this.scaleMotionOrigin = null;
    this.absoluteScaleMotionObserved = false;
  }

  setPlaced(placed) {
    this.placed = Boolean(placed);
    if (this.active && this.placed) {
      this.setState(PlacementBackendState.PLACED);
    }
  }

  dispose() {
    this.stop();
    this.onStateChange = null;
  }
}
