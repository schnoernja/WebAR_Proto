import * as THREE from "three";
import { APP_CONFIG } from "./config.js";
import { applyPose, clonePose, disposeObject3D } from "./utils.js";

export class PlacementController {
  constructor({ scene }) {
    this.scene = scene;
    this.objectRoot = new THREE.Group();
    this.objectRoot.visible = true;

    this.reticle = this.createReticle();
    this.reticle.visible = false;

    this.scene.add(this.objectRoot);
    this.scene.add(this.reticle);

    this.asset = null;
    this.currentSurfaceState = null;
    this.placeablePose = null;
    this.inARMode = false;
    this.placed = false;

    this.showFallbackPreview();
  }

  createReticle() {
    const reticle = new THREE.Group();

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xd18d37,
      transparent: true,
      opacity: 0.88,
      depthWrite: false
    });
    const centerMaterial = new THREE.MeshBasicMaterial({
      color: 0xd18d37,
      transparent: true,
      opacity: 0.78,
      depthWrite: false
    });

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(APP_CONFIG.reticle.ringRadius, APP_CONFIG.reticle.ringTube, 16, 64),
      ringMaterial
    );
    ring.rotation.x = Math.PI / 2;
    reticle.add(ring);

    const center = new THREE.Mesh(
      new THREE.CircleGeometry(APP_CONFIG.reticle.centerRadius, 32),
      centerMaterial
    );
    center.rotation.x = -Math.PI / 2;
    reticle.add(center);

    reticle.userData.materials = [ringMaterial, centerMaterial];
    return reticle;
  }

  setAsset(asset) {
    if (this.asset) {
      this.objectRoot.remove(this.asset);
      disposeObject3D(this.asset);
    }

    this.asset = asset;
    this.objectRoot.add(this.asset);
    this.showFallbackPreview();
  }

  enterARMode() {
    this.inARMode = true;
    this.resetPlacement();
  }

  exitARMode() {
    this.inARMode = false;
    this.resetPlacement();
    this.showFallbackPreview();
  }

  updateSurfaceState(surfaceState) {
    this.currentSurfaceState = surfaceState;
    this.placeablePose = surfaceState.canPlace && surfaceState.stablePose
      ? clonePose(surfaceState.stablePose)
      : null;

    if (!this.inARMode || this.placed || !surfaceState.displayPose) {
      this.reticle.visible = false;
      return;
    }

    applyPose(this.reticle, surfaceState.displayPose);
    this.reticle.translateY(APP_CONFIG.reticle.hoverOffset);
    this.reticle.visible = surfaceState.surfaceDetected;
    this.setReticleTone(surfaceState.isStable);
  }

  setReticleTone(isStable) {
    const color = isStable ? 0x19815c : 0xd18d37;
    for (const material of this.reticle.userData.materials) {
      material.color.setHex(color);
    }
  }

  placeCurrent() {
    if (!this.inARMode || !this.placeablePose) {
      return false;
    }

    applyPose(this.objectRoot, this.placeablePose);
    this.objectRoot.visible = true;
    this.reticle.visible = false;
    this.placed = true;
    return true;
  }

  resetPlacement() {
    this.placed = false;
    this.placeablePose = null;
    this.currentSurfaceState = null;
    this.reticle.visible = false;

    if (this.inARMode) {
      this.objectRoot.visible = false;
      return;
    }

    this.showFallbackPreview();
  }

  showFallbackPreview() {
    this.objectRoot.visible = true;
    this.objectRoot.position.set(0, 0, 0);
    this.objectRoot.quaternion.identity();
  }

  isPlaced() {
    return this.placed;
  }

  dispose() {
    this.scene.remove(this.objectRoot);
    this.scene.remove(this.reticle);

    disposeObject3D(this.reticle);
    disposeObject3D(this.objectRoot);
  }
}
