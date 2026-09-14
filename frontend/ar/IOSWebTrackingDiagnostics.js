const ENABLED_VALUES = new Set(["1", "true", "on"]);
const SAMPLE_INTERVAL_MS = 500;
const POSITION_EPSILON = 1e-5;
const QUATERNION_EPSILON = 1e-5;
const MATRIX_EPSILON = 1e-6;
const PROJECTION_EPSILON = 1e-5;

const finiteNumber = (value) => Number.isFinite(value) ? value : null;
const round = (value, digits = 5) => (
  Number.isFinite(value) ? Number(value.toFixed(digits)) : null
);
const vectorSnapshot = (value) => value ? {
  x: round(value.x),
  y: round(value.y),
  z: round(value.z),
} : null;
const quaternionSnapshot = (value) => value ? {
  x: round(value.x),
  y: round(value.y),
  z: round(value.z),
  w: round(value.w),
} : null;
const distance = (a, b) => {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
};
const maxElementDelta = (current, previous) => {
  if (!current || !previous || current.length !== previous.length) return Infinity;
  let maximum = 0;
  for (let index = 0; index < current.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(current[index] - previous[index]));
  }
  return maximum;
};
const quaternionAngle = (a, b) => {
  if (!a || !b) return Infinity;
  const dot = Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w));
  return 2 * Math.acos(dot);
};
const getWorldTransform = (node) => {
  if (!node?.position?.clone || !node?.quaternion?.clone) return null;
  node.updateWorldMatrix?.(true, false);
  const position = node.position.clone();
  const quaternion = node.quaternion.clone();
  node.getWorldPosition?.(position);
  node.getWorldQuaternion?.(quaternion);
  return {
    position,
    quaternion,
    matrix: node.matrixWorld?.elements ? Array.from(node.matrixWorld.elements) : null,
  };
};
const getPlacedNode = (placementController) => {
  if (!placementController?.isPlaced?.()) return null;
  const geoRoot = placementController.geoInstancesRoot;
  if (geoRoot?.children?.length) return geoRoot.children[0];
  return placementController.objectRoot || null;
};
const getComputedSize = (windowRef, element) => {
  if (!element) return {};
  const style = windowRef?.getComputedStyle?.(element);
  const rect = element.getBoundingClientRect?.();
  return {
    cssWidth: style?.width || null,
    cssHeight: style?.height || null,
    rect: rect ? {
      x: round(rect.x, 2),
      y: round(rect.y, 2),
      width: round(rect.width, 2),
      height: round(rect.height, 2),
    } : null,
  };
};

export function isIOSWebTrackingDiagnosticsEnabled(locationRef = globalThis.location) {
  const value = new URLSearchParams(locationRef?.search || "").get("iosdiag");
  return ENABLED_VALUES.has(String(value || "").toLowerCase());
}

export function computeVideoProcessingDelta({
  videoCurrentTimeSeconds,
  processedFrameTimeSeconds,
  processedFrameTimeBasis,
}) {
  if (
    processedFrameTimeBasis !== "media-seconds"
    || !Number.isFinite(videoCurrentTimeSeconds)
    || !Number.isFinite(processedFrameTimeSeconds)
  ) {
    return { comparable: false, deltaMs: null, reason: "Zeitbasis nicht vergleichbar" };
  }
  const deltaMs = (videoCurrentTimeSeconds - processedFrameTimeSeconds) * 1000;
  if (Math.abs(deltaMs) > 10000) {
    return {
      comparable: false,
      deltaMs: null,
      reason: "Zeitbasen offenbar verschieden oder Frame veraltet",
    };
  }
  return { comparable: true, deltaMs: round(deltaMs, 1), reason: null };
}

export class IOSWebTrackingDiagnostics {
  constructor({
    enabled = isIOSWebTrackingDiagnosticsEnabled(),
    windowRef = globalThis.window,
    documentRef = globalThis.document,
    logger = globalThis.console,
    sampleIntervalMs = SAMPLE_INTERVAL_MS,
  } = {}) {
    this.enabled = enabled;
    this.windowRef = windowRef;
    this.documentRef = documentRef;
    this.logger = logger;
    this.sampleIntervalMs = sampleIntervalMs;
    this.active = false;
    this.overlay = null;
    this.lastSampleAtMs = -Infinity;
    this.lastTrackingStatus = null;
    this.lastCameraTransform = null;
    this.lastProjectionMatrix = null;
    this.placementBaseline = null;
  }

  start() {
    if (!this.enabled || this.active) return;
    this.active = true;
    this.overlay = this.createOverlay();
    this.logger?.info?.(
      "[iOS-AR-Diagnose] aktiviert (Deaktivieren: URL-Parameter iosdiag entfernen oder auf 0 setzen)",
    );
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.overlay?.remove?.();
    this.overlay = null;
    this.lastTrackingStatus = null;
    this.lastCameraTransform = null;
    this.lastProjectionMatrix = null;
    this.placementBaseline = null;
    this.logger?.info?.("[iOS-AR-Diagnose] beendet");
  }

  createOverlay() {
    if (!this.documentRef?.createElement || !this.documentRef?.body) return null;
    const overlay = this.documentRef.createElement("pre");
    overlay.id = "ios-ar-diagnostics";
    overlay.setAttribute("aria-live", "polite");
    Object.assign(overlay.style, {
      position: "fixed",
      right: "8px",
      bottom: "8px",
      zIndex: "10000",
      maxWidth: "calc(100vw - 16px)",
      margin: "0",
      padding: "8px 10px",
      borderRadius: "6px",
      background: "rgba(0, 0, 0, 0.72)",
      color: "#d8ffdf",
      font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
      pointerEvents: "none",
      whiteSpace: "pre-wrap",
    });
    overlay.textContent = "iOS-AR-Diagnose: warte auf Frame …";
    this.documentRef.body.appendChild(overlay);
    return overlay;
  }

  update({
    timeMs,
    slamResult,
    camera,
    placementController,
    videoElement,
    canvasElement,
  }) {
    if (!this.active || !slamResult || !camera) return;
    const cameraTransform = getWorldTransform(camera);
    this.logTrackingTransition(slamResult, cameraTransform, timeMs);
    this.logProjectionChange(camera, videoElement, canvasElement, timeMs);
    this.lastCameraTransform = cameraTransform;

    if (timeMs - this.lastSampleAtMs < this.sampleIntervalMs) return;
    this.lastSampleAtMs = timeMs;

    const placedNode = getPlacedNode(placementController);
    const objectTransform = getWorldTransform(placedNode);
    const stability = this.measurePlacementStability(placedNode, objectTransform, cameraTransform);
    const frameDiagnostics = slamResult.diagnostics || {};
    const videoCurrentTime = finiteNumber(videoElement?.currentTime);
    const processingDelta = computeVideoProcessingDelta({
      videoCurrentTimeSeconds: videoCurrentTime,
      processedFrameTimeSeconds: frameDiagnostics.processedFrameTimeSeconds,
      processedFrameTimeBasis: frameDiagnostics.processedFrameTimeBasis,
    });
    const snapshot = {
      timestamp: new Date().toISOString(),
      performanceTimeMs: round(timeMs, 1),
      tracking: {
        status: frameDiagnostics.trackingStatus || (slamResult.tracking ? "NORMAL" : "LIMITED"),
        reason: frameDiagnostics.trackingReason || null,
        lastProcessCpuAtMs: round(frameDiagnostics.lastProcessCpuAtMs, 1),
        lastProcessCpuWallClock: frameDiagnostics.lastProcessCpuWallClock || null,
        processCpuSequence: frameDiagnostics.processCpuSequence ?? null,
        frameId: frameDiagnostics.frameId ?? null,
      },
      camera: {
        worldPosition: vectorSnapshot(cameraTransform?.position),
        worldQuaternion: quaternionSnapshot(cameraTransform?.quaternion),
      },
      object: objectTransform ? {
        worldPosition: vectorSnapshot(objectTransform.position),
        worldQuaternion: quaternionSnapshot(objectTransform.quaternion),
        cameraDistance: round(distance(cameraTransform?.position, objectTransform.position)),
        worldPositionStable: stability?.positionStable ?? null,
        worldQuaternionStable: stability?.quaternionStable ?? null,
        worldMatrixStable: stability?.matrixStable ?? null,
        cameraMovedSincePlacement: stability?.cameraMoved ?? null,
        cameraPositionDeltaSincePlacement: round(stability?.cameraDelta),
        objectPositionDeltaSincePlacement: round(stability?.positionDelta, 7),
        objectWorldMatrixMaxDelta: round(stability?.matrixDelta, 7),
        assessment: stability?.assessment ?? null,
      } : null,
      video: {
        currentTimeSeconds: videoCurrentTime,
        videoWidth: videoElement?.videoWidth || 0,
        videoHeight: videoElement?.videoHeight || 0,
        ...getComputedSize(this.windowRef, videoElement),
      },
      canvas: {
        drawingBufferWidth: canvasElement?.width || 0,
        drawingBufferHeight: canvasElement?.height || 0,
        devicePixelRatio: finiteNumber(this.windowRef?.devicePixelRatio),
        ...getComputedSize(this.windowRef, canvasElement),
      },
      processedFrame: {
        videoTimeSeconds: frameDiagnostics.processedFrameTimeSeconds ?? null,
        timeBasis: frameDiagnostics.processedFrameTimeBasis || "unavailable",
        videoMinusProcessedFrameMs: processingDelta.deltaMs,
        comparable: processingDelta.comparable,
        comparisonNote: processingDelta.reason,
      },
    };
    this.logger?.info?.("[iOS-AR-Diagnose] Frame", snapshot);
    this.renderOverlay(snapshot);
  }

  logTrackingTransition(slamResult, cameraTransform, timeMs) {
    const diagnostics = slamResult.diagnostics || {};
    const current = diagnostics.trackingStatus || (slamResult.tracking ? "NORMAL" : "LIMITED");
    const previous = this.lastTrackingStatus;
    this.lastTrackingStatus = current;
    if (
      !previous
      || previous === current
      || !["NORMAL", "LIMITED"].includes(previous)
      || !["NORMAL", "LIMITED"].includes(current)
    ) return;
    this.logger?.warn?.(`[iOS-AR-Diagnose] Tracking ${previous} -> ${current}`, {
      timestamp: new Date().toISOString(),
      performanceTimeMs: round(timeMs, 1),
      reason: diagnostics.trackingReason || null,
      cameraBefore: vectorSnapshot(this.lastCameraTransform?.position),
      cameraAfter: vectorSnapshot(cameraTransform?.position),
    });
  }

  logProjectionChange(camera, videoElement, canvasElement, timeMs) {
    const current = camera.projectionMatrix?.elements
      ? Array.from(camera.projectionMatrix.elements)
      : null;
    if (!current) return;
    const delta = maxElementDelta(current, this.lastProjectionMatrix);
    if (!this.lastProjectionMatrix || delta > PROJECTION_EPSILON) {
      this.logger?.info?.(
        this.lastProjectionMatrix
          ? "[iOS-AR-Diagnose] Projektionsmatrix geändert"
          : "[iOS-AR-Diagnose] Projektionsmatrix initialisiert",
        {
          timestamp: new Date().toISOString(),
          performanceTimeMs: round(timeMs, 1),
          maxElementDelta: this.lastProjectionMatrix ? round(delta, 7) : null,
          orientation: this.windowRef?.screen?.orientation?.type
            || this.windowRef?.orientation
            || null,
          video: {
            videoWidth: videoElement?.videoWidth || 0,
            videoHeight: videoElement?.videoHeight || 0,
            ...getComputedSize(this.windowRef, videoElement),
          },
          canvas: {
            drawingBufferWidth: canvasElement?.width || 0,
            drawingBufferHeight: canvasElement?.height || 0,
            devicePixelRatio: finiteNumber(this.windowRef?.devicePixelRatio),
            ...getComputedSize(this.windowRef, canvasElement),
          },
          projectionMatrix: current.map((value) => round(value, 7)),
        },
      );
      this.lastProjectionMatrix = current;
    }
  }

  measurePlacementStability(node, objectTransform, cameraTransform) {
    if (!node || !objectTransform) {
      this.placementBaseline = null;
      return null;
    }
    if (!this.placementBaseline || this.placementBaseline.node !== node) {
      this.placementBaseline = {
        node,
        objectPosition: objectTransform.position.clone(),
        objectQuaternion: objectTransform.quaternion.clone(),
        objectMatrix: objectTransform.matrix ? [...objectTransform.matrix] : null,
        cameraPosition: cameraTransform?.position?.clone?.() || null,
      };
    }
    const baseline = this.placementBaseline;
    const positionDelta = distance(objectTransform.position, baseline.objectPosition);
    const positionStable = positionDelta <= POSITION_EPSILON;
    const quaternionStable =
      quaternionAngle(objectTransform.quaternion, baseline.objectQuaternion) <= QUATERNION_EPSILON;
    const matrixDelta = maxElementDelta(objectTransform.matrix, baseline.objectMatrix);
    const matrixStable = matrixDelta <= MATRIX_EPSILON;
    const cameraDelta = distance(cameraTransform?.position, baseline.cameraPosition);
    const cameraMoved = Number.isFinite(cameraDelta) && cameraDelta > 0.01;
    return {
      positionStable,
      quaternionStable,
      matrixStable,
      positionDelta,
      matrixDelta,
      cameraDelta,
      cameraMoved,
      assessment: positionStable && quaternionStable && matrixStable && cameraMoved
        ? "OBJEKT_WORLD_STABIL_KAMERA_BEWEGT_VISUELL_PRÜFEN"
        : (positionStable && quaternionStable && matrixStable
          ? "OBJEKT_WORLD_STABIL"
          : "OBJEKT_WORLD_TRANSFORM_GEÄNDERT"),
    };
  }

  renderOverlay(snapshot) {
    if (!this.overlay) return;
    const formatVector = (value) => value
      ? `${value.x}, ${value.y}, ${value.z}`
      : "—";
    const object = snapshot.object;
    const delta = snapshot.processedFrame.comparable
      ? `${snapshot.processedFrame.videoMinusProcessedFrameMs} ms`
      : "nicht vergleichbar";
    this.overlay.textContent = [
      `Tracking: ${snapshot.tracking.status}${snapshot.tracking.reason ? ` (${snapshot.tracking.reason})` : ""}`,
      `Video − ProcessCpu: ${delta}`,
      `Kamera: ${formatVector(snapshot.camera.worldPosition)}`,
      `Objekt: ${formatVector(object?.worldPosition)}`,
      `Abstand: ${object?.cameraDistance ?? "—"} m`,
    ].join("\n");
  }
}
