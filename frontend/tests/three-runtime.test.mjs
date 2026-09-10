import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { APP_CONFIG } from "../ar/config.js";
import { HitTestManager } from "../ar/HitTestManager.js";
import { PlacementController } from "../ar/PlacementController.js";
import { PoseStabilizer } from "../ar/PoseStabilizer.js";
import { UIController } from "../ar/UIController.js";
import { GeoSceneManager } from "../ar/geo/GeoSceneManager.js";
import {
  THREE_RUNTIME_FILES,
  THREE_VERSION
} from "../../scripts/prepare-three-runtime.mjs";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Three.js ist exakt versioniert und ausschließlich lokal aufgelöst", async () => {
  const [html, packageJson, packageLock] = await Promise.all([
    readFile(path.join(frontendRoot, "index.html"), "utf8"),
    readFile(path.join(frontendRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(frontendRoot, "package-lock.json"), "utf8").then(JSON.parse)
  ]);

  assert.equal(packageJson.dependencies.three, THREE_VERSION);
  assert.equal(packageLock.packages["node_modules/three"].version, THREE_VERSION);
  assert.equal(
    Object.keys(packageLock.packages).filter((key) => /(?:^|\/)node_modules\/three$/.test(key)).length,
    1
  );
  assert.doesNotMatch(html, /(?:https?:)?\/\/[^\s"']*three(?:@|\/)/i);

  const importMapMatch = html.match(
    /<script\b[^>]*\btype\s*=\s*["']importmap["'][^>]*>([\s\S]*?)<\/script>/i
  );
  assert.ok(importMapMatch, "Import Map fehlt");
  const imports = JSON.parse(importMapMatch[1]).imports;
  assert.deepEqual(imports, {
    three: "./vendor/three/build/three.module.js",
    "three/addons/controls/OrbitControls.js": "./vendor/three/examples/jsm/controls/OrbitControls.js",
    "three/addons/loaders/GLTFLoader.js": "./vendor/three/examples/jsm/loaders/GLTFLoader.js"
  });
});

test("lokale Three.js-Laufzeitdateien entsprechen dem installierten Paket", async () => {
  for (const relativeFile of THREE_RUNTIME_FILES) {
    const [installed, prepared] = await Promise.all([
      readFile(path.join(frontendRoot, "node_modules", "three", relativeFile)),
      readFile(path.join(frontendRoot, "vendor", "three", relativeFile))
    ]);
    assert.deepEqual(prepared, installed, relativeFile);
  }
});

test("Hit-Test-Pose bleibt mit Three.js 0.172.0 kompatibel", async () => {
  let cancelled = false;
  const viewerSpace = { type: "viewer" };
  const hitTestSource = { cancel: () => { cancelled = true; } };
  const manager = new HitTestManager();

  await manager.initialize({
    requestReferenceSpace: async (type) => {
      assert.equal(type, "viewer");
      return viewerSpace;
    },
    requestHitTestSource: async ({ space }) => {
      assert.equal(space, viewerSpace);
      return hitTestSource;
    }
  });

  const result = manager.update({
    getHitTestResults: (source) => {
      assert.equal(source, hitTestSource);
      return [{
        getPose: () => ({
          transform: {
            position: { x: 1, y: 2, z: 3 },
            orientation: { x: 0, y: 0, z: 0, w: 1 }
          }
        })
      }];
    }
  }, { type: "local" });

  assert.equal(result.hasHit, true);
  assert.ok(result.pose.position instanceof THREE.Vector3);
  assert.ok(result.pose.quaternion instanceof THREE.Quaternion);
  assert.deepEqual(result.pose.position.toArray(), [1, 2, 3]);

  manager.dispose();
  assert.equal(cancelled, true);
});

test("Reticle und freie Platzierung bleiben mit der lokalen Three.js-Version funktionsfähig", () => {
  const scene = new THREE.Scene();
  const controller = new PlacementController({ scene });
  const pose = {
    position: new THREE.Vector3(1, 0, -2),
    quaternion: new THREE.Quaternion()
  };

  controller.enterARMode();
  controller.updateSurfaceState({
    displayPose: pose,
    surfaceDetected: true,
    isStable: true
  });

  assert.equal(controller.reticle.visible, true);
  assert.ok(controller.reticle.userData.materials.every((material) => material.color.getHex() === 0x19815c));
  assert.equal(controller.placeAtStablePose(pose), true);
  assert.equal(controller.isPlaced(), true);
  assert.equal(controller.reticle.visible, false);

  controller.dispose();
});

test("Stabiler Cursor wird nach zwei Sekunden grün und nach vier Sekunden platzierbar", () => {
  const stabilizer = new PoseStabilizer({
    ...APP_CONFIG.stabilizer,
    stabilityWindowSize: 2,
    stableFramesRequired: 1,
    unstableGraceSeconds: 0.75,
    unstableProgressDecayPerSecond: 1
  });
  const pose = {
    position: new THREE.Vector3(0, 0, -1),
    quaternion: new THREE.Quaternion()
  };

  stabilizer.update(pose, 0);
  stabilizer.update(pose, 0);

  let state = null;
  for (let sample = 0; sample < 3; sample += 1) {
    state = stabilizer.update(pose, 0.5);
  }
  assert.equal(state.isStable, false);
  assert.equal(state.canPlace, false);

  state = stabilizer.update(pose, 0.5);
  assert.equal(state.isStable, true);
  assert.equal(state.canPlace, false);

  for (let sample = 0; sample < 3; sample += 1) {
    state = stabilizer.update(pose, 0.5);
  }
  assert.equal(state.canPlace, false);

  state = stabilizer.update(pose, 0.5);
  assert.equal(state.isStable, true);
  assert.equal(state.canPlace, true);

  const movedPose = {
    position: new THREE.Vector3(0.2, 0, -1),
    quaternion: new THREE.Quaternion()
  };
  state = stabilizer.update(movedPose, 0.5);
  assert.equal(state.isStable, true);
  assert.equal(state.canPlace, true);
  assert.equal(state.stableDurationSeconds, 4);

  state = stabilizer.update({
    position: new THREE.Vector3(0.4, 0, -1),
    quaternion: new THREE.Quaternion()
  }, 0.5);
  assert.equal(state.isStable, false);
  assert.equal(state.canPlace, false);
  assert.equal(state.stableDurationSeconds, 3.5);
});

test("iOS-Flächenfreigabe bleibt nach dem ersten stabilen Backend-Signal erhalten", () => {
  const stabilizer = new PoseStabilizer({
    ...APP_CONFIG.stabilizer,
    stabilityWindowSize: 2,
    stableFramesRequired: 1,
    reticleGreenAfterSeconds: 0.5,
    autoPlaceAfterSeconds: 1
  });
  const pose = {
    position: new THREE.Vector3(0, 0, -1),
    quaternion: new THREE.Quaternion()
  };

  stabilizer.update(pose, 0, false);
  let state = stabilizer.update(pose, 0.5, false);
  assert.equal(state.stableDurationSeconds, 0);

  state = stabilizer.update(pose, 0.5, true);
  assert.equal(state.isStable, true);
  assert.equal(state.canPlace, false);

  state = stabilizer.update(pose, 0.5, false);
  assert.equal(state.isStable, true);
  assert.equal(state.canPlace, true);
});

test("Platzierung nutzt unabhängig von der Backend-Flächenrotation dieselbe Blickausrichtung", () => {
  const cameraState = {
    position: new THREE.Vector3(0, 1.6, 0),
    direction: new THREE.Vector3(1, -0.3, -1).normalize()
  };
  const poses = [
    new THREE.Quaternion(),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, Math.PI / 3, 0))
  ];
  const placedQuaternions = [];

  for (const quaternion of poses) {
    const controller = new PlacementController({ scene: new THREE.Scene() });
    controller.enterARMode();
    controller.placeAtStablePose(
      { position: new THREE.Vector3(0, 0, -1), quaternion },
      cameraState
    );
    placedQuaternions.push(controller.objectRoot.quaternion.clone());
    controller.dispose();
  }

  assert.ok(placedQuaternions[0].angleTo(placedQuaternions[1]) < 1e-8);
  const expectedDirection = cameraState.direction.clone().setY(0).normalize();
  const placedDirection = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(placedQuaternions[0])
    .normalize();
  assert.ok(placedDirection.angleTo(expectedDirection) < 1e-8);
});

test("Geo-Local richtet die Szene an Referenzrichtung und Kalibrierung aus", () => {
  const controller = new PlacementController({ scene: new THREE.Scene() });
  controller.enterARMode();
  controller.setGeoOrigin({ x: 0, y: 0, z: 0 });
  controller.setGeoReferenceDirection(new THREE.Vector3(1, 0, 0));
  controller.setGeoCalibration({ yawDeg: 30 });
  controller.setGeoObjects([{ id: "scene", offset: { x: 0, y: 0, z: 0 } }]);

  const floorPose = {
    position: new THREE.Vector3(0, 0, -1),
    quaternion: new THREE.Quaternion()
  };
  const computation = controller.computeGeoPosition(floorPose);
  assert.equal(computation.status, "ready");
  assert.equal(controller.placeGeoAtPose(computation.pose), true);

  const instance = controller.geoInstancesRoot.children[0];
  const expectedDirection = new THREE.Vector3(0, 0, -1)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-60));
  const placedDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(instance.quaternion);
  assert.ok(placedDirection.angleTo(expectedDirection) < 1e-8);
  controller.dispose();
});

test("iPhone-Geo-Fallback übernimmt dieselbe Szenentransformation", async () => {
  const scene = new THREE.Scene();
  const manager = new GeoSceneManager({ scene });
  await manager.loadSite({
    id: "test",
    orientation: { yawDeg: 10 },
    scene: null,
    objects: [],
    infoBoards: [],
    placement: {
      calibration: { yawDeg: 20 },
      transform: {
        position: { x: 1, y: -2, z: 3 },
        scaleFactor: 1.32,
        rotationDeg: 15,
        preserveSourceScale: true
      }
    }
  }, { loadSceneAsset: false });

  assert.deepEqual(manager.sceneTransformRoot.position.toArray(), [1, -2, 3]);
  assert.deepEqual(manager.sceneTransformRoot.scale.toArray(), [1.32, 1.32, 1.32]);
  assert.ok(Math.abs(manager.sceneTransformRoot.rotation.y - THREE.MathUtils.degToRad(15)) < 1e-8);
  assert.ok(Math.abs(manager.root.rotation.y - THREE.MathUtils.degToRad(210)) < 1e-8);
  manager.dispose();
});

test("Gruppierte Einzelobjekte werden gemeinsam zur Bearbeitung angeboten", () => {
  const scene = new THREE.Scene();
  const controller = new PlacementController({ scene });
  const wrapper = new THREE.Group();
  const model = new THREE.Group();
  wrapper.add(model);

  for (const name of ["Gras", "Gras001", "Steinplatte"]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.name = name;
    model.add(mesh);
  }

  controller.setAsset(wrapper);
  controller.setEditableObjectNodes([
    { nodes: ["Gras", "Gras001"], label: "Gras" },
    { node: "Steinplatte", label: "Steinplatte" }
  ]);

  assert.deepEqual(controller.getEditableObjectNodes(), [
    {
      nodePath: "group:0|1",
      nodePaths: ["0", "1"],
      nodeNames: ["Gras", "Gras001"],
      name: "Gras",
      depth: 1
    },
    {
      nodePath: "2",
      nodePaths: ["2"],
      nodeNames: ["Steinplatte"],
      name: "Steinplatte",
      depth: 1
    }
  ]);

  controller.dispose();
});

test("Eine Gruppenbearbeitung erzeugt identische Transformationen für alle Knoten", () => {
  const ui = Object.create(UIController.prototype);
  ui.objectTransformTargets = [{
    nodePath: "group:11|12",
    nodePaths: ["11", "12"],
    nodeNames: ["Plane", "Plane002"],
    name: "Rasen und Bordsteinkante"
  }];
  ui.selectedObjectTransformPath = "group:11|12";
  ui.objectTransformDrafts = [];
  ui.objectTransformRefs = {
    xRange: { value: "1.25" },
    yRange: { value: "-0.50" },
    zRange: { value: "2.00" },
    scaleRange: { value: "1.40" },
    rotationRange: { value: "35" }
  };

  ui.updateSelectedObjectTransformDraft();

  assert.deepEqual(ui.getObjectTransformDrafts(), [
    {
      nodePath: "11",
      node: "Plane",
      position: { x: 1.25, y: -0.5, z: 2 },
      scaleFactor: 1.4,
      rotationDeg: 35
    },
    {
      nodePath: "12",
      node: "Plane002",
      position: { x: 1.25, y: -0.5, z: 2 },
      scaleFactor: 1.4,
      rotationDeg: 35
    }
  ]);
});
