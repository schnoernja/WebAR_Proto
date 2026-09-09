import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ArCapabilityDetector, ARLaunchMode } from "../ar/ArCapabilityDetector.js";
import { ArLauncher } from "../ar/ArLauncher.js";
import { GeoLocationService } from "../ar/GeoLocationService.js";
import { SiteLoader } from "../ar/geo/SiteLoader.js";
import {
  IOSWebSLAMPlacementBackend,
  PlacementBackendState
} from "../ar/IOSWebSLAMPlacementBackend.js";

function createCapabilityEnvironment({ webXRSupported = false, ios = true, safari = true } = {}) {
  const navigatorRef = {
    userAgent: ios
      ? safari
        ? "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1"
        : "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/120 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile Safari/537.36",
    platform: ios ? "iPhone" : "Linux armv8l",
    maxTouchPoints: 5,
    mediaDevices: { getUserMedia() {} },
    xr: {
      async isSessionSupported(mode) {
        assert.equal(mode, "immersive-ar");
        return webXRSupported;
      }
    }
  };
  return {
    navigatorRef,
    windowRef: {
      isSecureContext: true,
      WebAssembly,
      DeviceOrientationEvent: function DeviceOrientationEvent() {}
    },
    documentRef: {
      createElement() {
        return { getContext: () => ({}) };
      }
    }
  };
}

test("WebXR-Unterstützung behält unabhängig vom Gerät Priorität", async () => {
  const detector = new ArCapabilityDetector(createCapabilityEnvironment({ webXRSupported: true }));
  const result = await detector.detect();
  assert.equal(result.mode, ARLaunchMode.WEBXR);
});

test("iOS-Safari ohne immersive-ar wählt das Web-Tracking-Backend", async () => {
  const detector = new ArCapabilityDetector(createCapabilityEnvironment());
  const result = await detector.detect();
  assert.equal(result.mode, ARLaunchMode.IOS_WEB_TRACKING);
  assert.equal(result.iosWebTrackingSupported, true);
});

test("iOS-WebView mit den benötigten Fähigkeiten nutzt denselben Trackingpfad", async () => {
  const detector = new ArCapabilityDetector(
    createCapabilityEnvironment({ ios: true, safari: false, webXRSupported: false })
  );
  const result = await detector.detect();
  assert.equal(result.mode, ARLaunchMode.IOS_WEB_TRACKING);
});

test("nicht unterstützte Browser erhalten keine sichtbare Plattformauswahl", async () => {
  const detector = new ArCapabilityDetector(
    createCapabilityEnvironment({ ios: false, safari: false, webXRSupported: false })
  );
  const result = await detector.detect();
  assert.equal(result.mode, ARLaunchMode.UNSUPPORTED);
});

test("Launcher startet ausschließlich das automatisch gewählte Backend", async () => {
  let webXRStarts = 0;
  let iosStarts = 0;
  const launcher = new ArLauncher({
    capabilityDetector: {
      getLastResult: () => ({ mode: ARLaunchMode.IOS_WEB_TRACKING })
    }
  });
  const result = await launcher.launch({
    startWebXR: async () => { webXRStarts += 1; return true; },
    startIOSWebTracking: async () => { iosStarts += 1; return true; }
  });
  assert.equal(result.started, true);
  assert.equal(webXRStarts, 0);
  assert.equal(iosStarts, 1);
});

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
}

class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.set(x, y, z, w); }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
}

function createMatrix() {
  return {
    values: null,
    fromArray(values) { this.values = [...values]; return this; },
    copy(other) { this.values = other.values; return this; },
    invert() { return this; }
  };
}

function createBackendHarness({ cameraFailure = false, hitResults = null } = {}) {
  const calls = { add: 0, clear: 0, run: [], stop: 0, pre: 0, post: 0, recenter: 0 };
  let customModule = null;
  let started = false;
  const reality = {
    position: { x: 1, y: 1.4, z: -2 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    intrinsics: Array.from({ length: 16 }, (_, index) => index % 5 === 0 ? 1 : 0),
    trackingStatus: "NORMAL",
    trackingReason: "UNDEFINED"
  };
  const xr8 = {
    XrConfig: {
      camera: () => ({ BACK: "back" }),
      device: () => ({ MOBILE: "mobile" })
    },
    XrController: {
      configure() {},
      pipelineModule: () => ({ name: "reality" }),
      updateCameraProjectionMatrix() {},
      recenter() { calls.recenter += 1; },
      hitTest: () => hitResults || [{
        type: "DETECTED_SURFACE",
        position: { x: 0, y: 0, z: -1.5 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        distance: 1.5
      }]
    },
    addCameraPipelineModules(modules) {
      calls.add += 1;
      customModule = modules[1];
    },
    clearCameraPipelineModules() { calls.clear += 1; },
    run(options) { calls.run.push(options); },
    runPreRender() {
      calls.pre += 1;
      if (!started) {
        started = true;
        customModule.onCameraStatusChange({ status: "requesting" });
        if (cameraFailure) {
          customModule.onCameraStatusChange({ status: "failed" });
        } else {
          customModule.onStart({ canvasWidth: 390, canvasHeight: 844 });
        }
      }
      if (!cameraFailure) {
        customModule.onUpdate({ processCpuResult: { reality } });
      }
    },
    runPostRender() { calls.post += 1; },
    stop() { calls.stop += 1; }
  };
  const renderer = { resetState() {} };
  const sceneManager = {
    getCanvasElement: () => ({}),
    getRenderer: () => renderer
  };
  const backend = new IOSWebSLAMPlacementBackend({
    sceneManager,
    threeRef: { Vector3, Quaternion },
    windowRef: { XR8: xr8 },
    documentRef: {}
  });
  const camera = {
    position: new Vector3(),
    quaternion: new Quaternion(),
    projectionMatrix: createMatrix(),
    projectionMatrixInverse: createMatrix(),
    updateMatrix() {},
    updateMatrixWorld() {}
  };
  return { backend, camera, calls, reality };
}

test("iOS-Backend nutzt genau einen extern gesteuerten Render-Loop und räumt sauber auf", async () => {
  const { backend, camera, calls, reality } = createBackendHarness();
  await backend.start();
  await backend.start();
  assert.equal(calls.add, 1);
  assert.equal(calls.run.length, 1);
  assert.equal(calls.run[0].ownRunLoop, false);

  const frame = backend.update(1000, camera);
  assert.equal(frame.tracking, true);
  assert.equal(frame.surfaceDetected, true);
  assert.equal(frame.isStable, false);
  assert.equal(frame.hitType, "DETECTED_SURFACE");
  backend.finishFrame();
  assert.equal(calls.pre, 1);
  assert.equal(calls.post, 1);

  let stableFrame = null;
  for (let timeMs = 1100; timeMs <= 2200; timeMs += 100) {
    stableFrame = backend.update(timeMs, camera);
    backend.finishFrame();
  }
  assert.equal(stableFrame.surfaceDetected, true);
  assert.equal(stableFrame.isStable, false);

  reality.position.x = 1.13;
  stableFrame = backend.update(2300, camera);
  backend.finishFrame();
  assert.equal(stableFrame.isStable, true);

  backend.setPlaced(true);
  assert.equal(backend.state, PlacementBackendState.PLACED);
  backend.reset();
  assert.equal(calls.recenter, 1);
  backend.stop();
  assert.equal(calls.stop, 1);
  assert.equal(calls.clear, 1);
  assert.equal(backend.state, PlacementBackendState.STOPPED);

  await backend.start();
  assert.equal(calls.add, 2);
  assert.equal(calls.run.length, 2);
  backend.stop();
  assert.equal(calls.stop, 2);
  assert.equal(calls.clear, 2);
});

test("iOS-Backend verwendet den nächsten Treffer wie WebXR", async () => {
  const { backend, camera } = createBackendHarness({
    hitResults: [
      {
        type: "DETECTED_SURFACE",
        position: { x: 0, y: 0, z: -3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        distance: 3
      },
      {
        type: "FEATURE_POINT",
        position: { x: 0, y: 0, z: -1 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        distance: 1
      }
    ]
  });
  await backend.start();

  const frame = backend.update(1000, camera);
  assert.equal(frame.pose.position.z, -1);
  assert.equal(frame.hitType, "FEATURE_POINT");
  backend.finishFrame();
  backend.stop();
});

test("iOS-Backend blendet platzierte Modelle bei kurzen LIMITED-Frames nicht aus", async () => {
  const { backend, camera, reality } = createBackendHarness();
  await backend.start();

  const normalFrame = backend.update(1000, camera);
  backend.finishFrame();
  assert.equal(normalFrame.tracking, true);
  backend.setPlaced(true);

  reality.trackingStatus = "LIMITED";
  reality.position.x = 9;
  const transientLimitedFrame = backend.update(1300, camera);
  backend.finishFrame();
  assert.equal(transientLimitedFrame.tracking, true);
  assert.equal(transientLimitedFrame.trackingLost, false);
  assert.equal(transientLimitedFrame.cameraPose.position.x, 1);
  assert.equal(backend.state, PlacementBackendState.PLACED);

  const sustainedLimitedFrame = backend.update(1501, camera);
  backend.finishFrame();
  assert.equal(sustainedLimitedFrame.tracking, false);
  assert.equal(sustainedLimitedFrame.trackingLost, true);
  backend.stop();
});

test("verweigerter Kamerazugriff wird als Backend-Fehler geliefert", async () => {
  const { backend, camera } = createBackendHarness({ cameraFailure: true });
  await backend.start();
  const frame = backend.update(1000, camera);
  assert.equal(frame.tracking, false);
  assert.match(frame.error.message, /Kamerazugriff/);
  backend.stop();
});

test("verweigerter Standortzugriff bleibt ein kontrollierter UI-Zustand", () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { protocol: "https:", hostname: "example.test" } }
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { geolocation: {}, permissions: null }
  });

  try {
    const service = new GeoLocationService();
    service.permissionState = "denied";
    assert.equal(service.requestPermissionAndStart(), false);
    assert.equal(service.getSnapshot().status, "denied");
    assert.equal(service.getSnapshot().issue, "permission-denied");
  } finally {
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      delete globalThis.window;
    }
    if (navigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
  }
});

test("Fehler beim Laden der iOS-Engine wird kontrolliert gemeldet", async () => {
  const listeners = {};
  const script = {
    dataset: {},
    addEventListener(type, handler) { listeners[type] = handler; },
    removeEventListener() {}
  };
  const windowRef = {
    addEventListener() {},
    removeEventListener() {}
  };
  const documentRef = {
    querySelector: () => null,
    createElement: () => script,
    head: {
      appendChild() { queueMicrotask(() => listeners.error()); }
    }
  };
  const backend = new IOSWebSLAMPlacementBackend({
    sceneManager: {},
    threeRef: {},
    windowRef,
    documentRef,
    engineUrl: "/missing/xr.js"
  });
  await assert.rejects(backend.prepare(), /nicht geladen/);
  assert.equal(backend.state, PlacementBackendState.ERROR);
});

test("gemeinsame Oberfläche enthält genau einen neutralen AR-Start", async () => {
  const [html, styles] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8")
  ]);
  assert.equal((html.match(/id="start-ar-button"/g) || []).length, 1);
  assert.match(html, />\s*AR starten\s*</);
  assert.doesNotMatch(html, /WebXR|8th Wall|SLAM|ARCore|ARKit|iOS-Fallback/);
  assert.match(html, /href="\.\/vendor\/8thwall\/LICENSE"/);
  assert.match(html, /© 2026 Niantic Spatial, Inc\./);
  assert.match(html, /class="object-transform-editor info-board-editor startup-developer-only"/);
  assert.match(styles, /body\[data-ui-mode="user"\] \.startup-developer-only\s*\{\s*display:\s*none;/);
});

test("iOS platziert nach geglätteter stabiler Bodenpose automatisch", async () => {
  const appSource = await readFile(new URL("../ar/App.js", import.meta.url), "utf8");
  const stabilizerSource = await readFile(new URL("../ar/PoseStabilizer.js", import.meta.url), "utf8");

  assert.match(appSource, /stabilityUsesSmoothedPose:\s*true/);
  assert.match(appSource, /surfaceState\.isStable\s*&&\s*!this\.placementController\.isPlaced\(\)/);
  assert.match(appSource, /this\.placeFreeObject\("ios-auto"\)/);
  assert.match(appSource, /slamResult\.isStable/);
  assert.match(stabilizerSource, /this\.config\.stabilityUsesSmoothedPose/);
});

test("3D-Assets werden erst beim AR-Start geladen", async () => {
  const appSource = await readFile(new URL("../ar/App.js", import.meta.url), "utf8");

  assert.match(appSource, /this\.prepareLazyPlacementAsset\(\)/);
  assert.doesNotMatch(appSource, /prepareInitialPlacementAsset/);
  assert.match(appSource, /startIOSWebTrackingExperience[\s\S]*ensurePlacementAssetForExperience\(ExperienceMode\.XR\)/);
  assert.match(appSource, /startSelectedWebXRExperience[\s\S]*ensurePlacementAssetForExperience\(ExperienceMode\.XR\)/);
  assert.match(appSource, /pending:\s*this\.scenarioSwitchPending\s*\|\|\s*this\.placementAssetLoadPending/);
  assert.match(appSource, /maybePlaceGeoObject[\s\S]*this\.placementAssetLoadPending/);
});

test("klimawoche-Szenarien behalten getrennte, austauschbare Modellpfade", async () => {
  const rawConfig = JSON.parse(
    await readFile(new URL("../public/sites/klimawocheFHE.json", import.meta.url), "utf8")
  );
  const locationRef = new URL("https://example.test/webar/index.html?site=klimawocheFHE");
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: locationRef }
  });

  let site = null;
  try {
    const loader = new SiteLoader({ locationRef, fetchImpl: async () => null });
    site = loader.normalizeSite("klimawocheFHE", rawConfig, locationRef.href);
    const duplicateBoardConfig = structuredClone(rawConfig);
    duplicateBoardConfig.scenarios[0].infoBoards[1].id = "tafel-1";
    assert.throws(
      () => loader.normalizeSite("klimawocheFHE", duplicateBoardConfig, locationRef.href),
      /eindeutige ID/
    );
  } finally {
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      delete globalThis.window;
    }
  }

  assert.equal(site.scenarios.length, 2);
  assert.notEqual(site.scenarios[0].placement.asset, site.scenarios[1].placement.asset);
  assert.match(site.scenarios[0].placement.asset, /scene_a_environment_final\.glb/);
  assert.match(site.scenarios[1].placement.asset, /scene_b_environment_final_webar\.glb/);
  assert.deepEqual(site.scenarios[0].placement.editableNodes.at(-2), {
    nodes: ["Gras", "Gras001"],
    label: "Gras"
  });
  assert.deepEqual(site.scenarios[1].placement.editableNodes.at(-1), {
    nodes: ["Plane", "Plane002"],
    label: "Rasen und Bordsteinkante"
  });

  const [sceneA, sceneB] = site.scenarios;
  assert.equal(sceneA.placement.transform.scaleFactor, 1.32);
  assert.equal(sceneA.placement.transform.scaleFactor, sceneB.placement.transform.scaleFactor);
  assert.equal(sceneA.infoBoards.length, 3);
  assert.equal(sceneB.infoBoards.length, 4);
  assert.deepEqual(sceneA.infoBoards.map((board) => board.id), ["tafel-1", "tafel-2", "tafel-3"]);
  assert.deepEqual(sceneB.infoBoards.map((board) => board.id), ["tafel-1", "tafel-2", "tafel-3", "tafel-4"]);
  assert.ok(sceneA.infoBoards.every((board) => board.sceneId === "a" && board.active && board.billboard));
  assert.ok(sceneB.infoBoards.every((board) => board.sceneId === "b" && board.active && board.billboard));
  assert.deepEqual(sceneA.infoBoards.map((board) => board.offset), [
    { x: 13.49, y: 1.5, z: 2.1 },
    { x: 5.75, y: 1.05, z: 0.35 },
    { x: 17, y: 1, z: -2.15 }
  ]);
  assert.deepEqual(sceneB.infoBoards.map((board) => board.offset), [
    { x: 11.22, y: 1.5, z: 0.3 },
    { x: 4.33, y: 1.05, z: -0.4 },
    { x: 9, y: 1, z: 1.5 },
    { x: 15.47, y: 1.35, z: 2.1 }
  ]);
  assert.deepEqual(sceneA.infoBoards.map((board) => board.provisional), [false, false, true]);
  assert.deepEqual(sceneB.infoBoards.map((board) => board.provisional), [false, false, true, false]);
  assert.equal(
    sceneA.infoBoards[0].text,
    "Kühlungseffekt von Bäumen: Kühlung der Lufttemperatur um ca. 5 Grad, Kühlung der Oberflächentemperatur um ca. 11 Grad bei 100%iger Bedeckung durch Stadtbäume im Vergleich zu vollversiegelten Flächen (Referenz Deutschland)"
  );
  assert.equal(
    sceneA.infoBoards[1].text,
    "ca. 15 Grad weniger Oberflächentemperatur (45 Grad) als Beton (60 Grad), insgesamt Kühlungseffekt von ca. 3 Grad"
  );
  assert.equal(sceneA.infoBoards[2].text, sceneA.infoBoards[0].text);
  assert.equal(sceneB.infoBoards[1].text, sceneA.infoBoards[1].text);
  assert.equal(sceneB.infoBoards[3].text, sceneB.infoBoards[0].text);

  const appSource = await readFile(new URL("../ar/App.js", import.meta.url), "utf8");
  assert.match(
    appSource,
    /switchToNextScenario[\s\S]*ensurePlacementAssetForExperience\(this\.selectedExperienceMode,\s*\{[\s\S]*preservePlacement:\s*true/
  );
});
