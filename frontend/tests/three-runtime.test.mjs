import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { HitTestManager } from "../ar/HitTestManager.js";
import { PlacementController } from "../ar/PlacementController.js";
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
