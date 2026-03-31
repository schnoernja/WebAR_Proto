import * as THREE from "three";
import { APP_CONFIG } from "./config.js";
import { applyPose, disposeObject3D } from "./utils.js";

const METERS_PER_DEGREE_LAT = 111320;

export const PlacementMode = Object.freeze({
  FREE: "free",
  GEO: "geo"
});

function isValidMode(mode) {
  return mode === PlacementMode.FREE || mode === PlacementMode.GEO;
}

function isValidGeoCoord(coord) {
  return (
    coord &&
    Number.isFinite(coord.latitude) &&
    Number.isFinite(coord.longitude) &&
    coord.latitude >= -90 &&
    coord.latitude <= 90 &&
    coord.longitude >= -180 &&
    coord.longitude <= 180
  );
}

function clonePose(pose) {
  return pose
    ? {
        position: pose.position.clone(),
        quaternion: pose.quaternion.clone()
      }
    : null;
}

export class PlacementController {
  constructor({ scene }) {
    this.scene = scene;
    this.objectRoot = new THREE.Group();
    this.objectRoot.visible = true;

    this.mode = isValidMode(APP_CONFIG.placement.defaultMode)
      ? APP_CONFIG.placement.defaultMode
      : PlacementMode.FREE;
    this.geoTarget = { ...APP_CONFIG.placement.defaultGeoTarget };
    this.geoOrigin = null;
    this.maxVisibleDistanceMeters = APP_CONFIG.placement.maxVisibleDistanceMeters;

    this.reticle = this.createReticle();
    this.reticle.visible = false;

    this.scene.add(this.objectRoot);
    this.scene.add(this.reticle);

    this.asset = null;
    this.currentSurfaceState = null;
    this.inARMode = false;
    this.placed = false;
    this.lastGeoComputation = {
      status: "idle",
      distanceMeters: null,
      pose: null
    };

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
    this.clearGeoOrigin();
    this.resetPlacement();
    this.showFallbackPreview();
  }

  updateSurfaceState(surfaceState) {
    this.currentSurfaceState = surfaceState;

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

  setMode(mode) {
    if (!isValidMode(mode)) {
      return false;
    }

    this.mode = mode;
    return true;
  }

  getMode() {
    return this.mode;
  }

  setGeoTarget(coord) {
    if (!isValidGeoCoord(coord)) {
      return false;
    }

    this.geoTarget = {
      latitude: coord.latitude,
      longitude: coord.longitude
    };
    this.clearGeoComputation();
    return true;
  }

  getGeoTarget() {
    return { ...this.geoTarget };
  }

  setGeoOrigin(coord) {
    if (!isValidGeoCoord(coord)) {
      return false;
    }

    this.geoOrigin = {
      latitude: coord.latitude,
      longitude: coord.longitude
    };
    this.clearGeoComputation();
    return true;
  }

  hasGeoOrigin() {
    return this.geoOrigin !== null;
  }

  getGeoOrigin() {
    return this.geoOrigin ? { ...this.geoOrigin } : null;
  }

  clearGeoOrigin() {
    this.geoOrigin = null;
    this.clearGeoComputation();
  }

  computeGeoPosition(floorPose) {
    if (!floorPose) {
      this.lastGeoComputation = {
        status: "missing-floor",
        distanceMeters: null,
        pose: null
      };
      return this.getLastGeoComputation();
    }

    if (!this.geoOrigin || !this.geoTarget) {
      this.lastGeoComputation = {
        status: "missing-origin",
        distanceMeters: null,
        pose: null
      };
      return this.getLastGeoComputation();
    }

    const originLatRad = THREE.MathUtils.degToRad(this.geoOrigin.latitude);
    const metersPerDegreeLon = Math.cos(originLatRad) * METERS_PER_DEGREE_LAT;
    const deltaLat = this.geoTarget.latitude - this.geoOrigin.latitude;
    const deltaLon = this.geoTarget.longitude - this.geoOrigin.longitude;

    const x = deltaLon * metersPerDegreeLon;
    const z = -deltaLat * METERS_PER_DEGREE_LAT;
    const distanceMeters = Math.hypot(x, z);

    if (distanceMeters > this.maxVisibleDistanceMeters) {
      this.lastGeoComputation = {
        status: "too-far",
        distanceMeters,
        pose: null
      };
      return this.getLastGeoComputation();
    }

    const pose = {
      position: new THREE.Vector3(x, floorPose.position.y, z),
      quaternion: floorPose.quaternion.clone()
    };

    this.lastGeoComputation = {
      status: "ready",
      distanceMeters,
      pose: clonePose(pose)
    };

    return {
      status: "ready",
      distanceMeters,
      pose
    };
  }

  getLastGeoComputation() {
    return {
      status: this.lastGeoComputation.status,
      distanceMeters: this.lastGeoComputation.distanceMeters,
      pose: clonePose(this.lastGeoComputation.pose)
    };
  }

  placeAtStablePose(surfacePose) {
    return this.placeAtPose(surfacePose);
  }

  placeAtPose(pose) {
    if (!this.inARMode || this.placed || !pose) {
      return false;
    }

    applyPose(this.objectRoot, pose);
    this.objectRoot.visible = true;
    this.reticle.visible = false;
    this.placed = true;
    return true;
  }

  resetPlacement() {
    this.placed = false;
    this.currentSurfaceState = null;
    this.reticle.visible = false;
    this.clearGeoComputation();

    if (this.inARMode) {
      this.objectRoot.visible = false;
      return;
    }

    this.showFallbackPreview();
  }

  clearGeoComputation() {
    this.lastGeoComputation = {
      status: "idle",
      distanceMeters: null,
      pose: null
    };
  }

  showFallbackPreview() {
    this.reticle.visible = false;
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
