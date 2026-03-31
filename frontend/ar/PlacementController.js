import * as THREE from "three";
import { APP_CONFIG } from "./config.js";
import { applyPose, disposeObject3D } from "./utils.js";

export class PlacementController {
  constructor({ scene }) {
    this.scene = scene;
    this.objectRoot = new THREE.Group();
    this.objectRoot.visible = true;
    this.targetCoordinate = new THREE.Vector3(
      APP_CONFIG.placement.targetCoordinate.x,
      APP_CONFIG.placement.targetCoordinate.y,
      APP_CONFIG.placement.targetCoordinate.z
    );

    this.reticle = this.createReticle();
    this.reticle.visible = false;

    this.scene.add(this.objectRoot);
    this.scene.add(this.reticle);

    this.asset = null;
    this.currentSurfaceState = null;
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

    if (!this.inARMode || !surfaceState.displayPose) {
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

  placeAtTargetCoordinate(originPose) {
    if (!this.inARMode || this.placed || !originPose) {
      return false;
    }

    const placementPose = {
      position: originPose.position.clone().add(this.targetCoordinate),
      quaternion: originPose.quaternion.clone()
    };

    applyPose(this.objectRoot, placementPose);
    this.objectRoot.visible = true;
    this.placed = true;
    return true;
  }

  resetPlacement() {
    this.placed = false;
    this.currentSurfaceState = null;
    this.reticle.visible = false;

    if (this.inARMode) {
      this.objectRoot.visible = false;
      return;
    }

    this.showFallbackPreview();
  }

  showFallbackPreview() {
    this.reticle.visible = false;
    this.objectRoot.visible = true;
    this.objectRoot.position.set(0, 0, 0);
    this.objectRoot.quaternion.identity();
  }

  getTargetCoordinate() {
    return {
      x: this.targetCoordinate.x,
      y: this.targetCoordinate.y,
      z: this.targetCoordinate.z
    };
  }

  setTargetCoord(coord) {
    if (
      !coord ||
      !Number.isFinite(coord.x) ||
      !Number.isFinite(coord.y) ||
      !Number.isFinite(coord.z)
    ) {
      return false;
    }

    this.targetCoordinate.set(coord.x, coord.y, coord.z);
    return true;
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
