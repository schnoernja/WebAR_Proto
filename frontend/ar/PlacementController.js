import * as THREE from "three";
import { APP_CONFIG } from "./config.js";
import { applyPose, disposeObject3D } from "./utils.js";

const METERS_PER_DEGREE_LAT = 111320;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_GEO_FORWARD = new THREE.Vector3(0, 0, -1);

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function projectDirectionToGround(direction) {
  if (!direction) {
    return null;
  }

  const groundedDirection = direction.clone();
  groundedDirection.y = 0;

  if (groundedDirection.lengthSq() < 1e-6) {
    return null;
  }

  groundedDirection.normalize();
  return groundedDirection;
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
    this.geoReferenceForward = null;
    this.geoReferenceRight = null;
    this.maxVisibleDistanceMeters = APP_CONFIG.placement.maxVisibleDistanceMeters;
    this.debugClampDistanceMeters = APP_CONFIG.placement.debugClampDistanceMeters;

    this.reticle = this.createReticle();
    this.reticle.visible = false;

    this.scene.add(this.objectRoot);
    this.scene.add(this.reticle);

    this.asset = null;
    this.currentSurfaceState = null;
    this.inARMode = false;
    this.placed = false;
    this.lastGeoComputation = this.createGeoDebugSnapshot("idle");

    this.showFallbackPreview();
  }

  createGeoDebugSnapshot(status, overrides = {}) {
    return {
      status,
      originLatitude: this.geoOrigin ? this.geoOrigin.latitude : null,
      originLongitude: this.geoOrigin ? this.geoOrigin.longitude : null,
      targetLatitude: this.geoTarget ? this.geoTarget.latitude : null,
      targetLongitude: this.geoTarget ? this.geoTarget.longitude : null,
      deltaLatitude: null,
      deltaLongitude: null,
      xMeters: null,
      zMeters: null,
      distanceMeters: null,
      distanceOverLimit: false,
      debugClamped: false,
      objectBehindCamera: false,
      pose: null,
      ...overrides
    };
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
    this.clearGeoReferenceDirection();
    this.resetPlacement();
  }

  exitARMode() {
    this.inARMode = false;
    this.clearGeoOrigin();
    this.clearGeoReferenceDirection();
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

  setGeoReferenceDirection(direction) {
    const groundedDirection = projectDirectionToGround(direction);
    if (!groundedDirection) {
      return false;
    }

    this.geoReferenceForward = groundedDirection;
    this.geoReferenceRight = new THREE.Vector3()
      .crossVectors(this.geoReferenceForward, WORLD_UP)
      .normalize();
    this.clearGeoComputation();
    return true;
  }

  hasGeoReferenceDirection() {
    return this.geoReferenceForward !== null && this.geoReferenceRight !== null;
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

  clearGeoReferenceDirection() {
    this.geoReferenceForward = null;
    this.geoReferenceRight = null;
    this.clearGeoComputation();
  }

  computeGeoPosition(floorPose, cameraState = null) {
    if (!floorPose) {
      this.lastGeoComputation = this.createGeoDebugSnapshot("missing-floor");
      return this.getLastGeoComputation();
    }

    if (!this.geoOrigin || !this.geoTarget) {
      this.lastGeoComputation = this.createGeoDebugSnapshot("missing-origin");
      return this.getLastGeoComputation();
    }

    if (!this.hasGeoReferenceDirection()) {
      this.lastGeoComputation = this.createGeoDebugSnapshot("missing-reference");
      return this.getLastGeoComputation();
    }

    const originLatRad = THREE.MathUtils.degToRad(this.geoOrigin.latitude);
    const metersPerDegreeLon = Math.cos(originLatRad) * METERS_PER_DEGREE_LAT;
    const deltaLat = this.geoTarget.latitude - this.geoOrigin.latitude;
    const deltaLon = this.geoTarget.longitude - this.geoOrigin.longitude;
    const eastMeters = deltaLon * metersPerDegreeLon;
    const northMeters = deltaLat * METERS_PER_DEGREE_LAT;
    const distanceMeters = Math.hypot(eastMeters, northMeters);

    if (distanceMeters > this.maxVisibleDistanceMeters) {
      this.lastGeoComputation = this.createGeoDebugSnapshot("too-far", {
        deltaLatitude: deltaLat,
        deltaLongitude: deltaLon,
        distanceMeters,
        distanceOverLimit: true
      });
      return this.getLastGeoComputation();
    }

    const clampedEastMeters = clamp(eastMeters, -this.debugClampDistanceMeters, this.debugClampDistanceMeters);
    const clampedNorthMeters = clamp(northMeters, -this.debugClampDistanceMeters, this.debugClampDistanceMeters);
    const offset = this.geoReferenceRight
      .clone()
      .multiplyScalar(clampedEastMeters)
      .add(this.geoReferenceForward.clone().multiplyScalar(clampedNorthMeters));

    const pose = {
      position: new THREE.Vector3(offset.x, floorPose.position.y, offset.z),
      quaternion: new THREE.Quaternion()
    };

    const visibilityDebug = this.computeVisibilityDebug(cameraState, pose.position);

    this.lastGeoComputation = this.createGeoDebugSnapshot("ready", {
      deltaLatitude: deltaLat,
      deltaLongitude: deltaLon,
      xMeters: pose.position.x,
      zMeters: pose.position.z,
      distanceMeters,
      distanceOverLimit: false,
      debugClamped: clampedEastMeters !== eastMeters || clampedNorthMeters !== northMeters,
      objectBehindCamera: visibilityDebug.objectBehindCamera,
      pose: clonePose(pose)
    });

    return {
      status: "ready",
      distanceMeters,
      pose
    };
  }

  getLastGeoComputation() {
    return {
      status: this.lastGeoComputation.status,
      originLatitude: this.lastGeoComputation.originLatitude,
      originLongitude: this.lastGeoComputation.originLongitude,
      targetLatitude: this.lastGeoComputation.targetLatitude,
      targetLongitude: this.lastGeoComputation.targetLongitude,
      deltaLatitude: this.lastGeoComputation.deltaLatitude,
      deltaLongitude: this.lastGeoComputation.deltaLongitude,
      xMeters: this.lastGeoComputation.xMeters,
      zMeters: this.lastGeoComputation.zMeters,
      distanceMeters: this.lastGeoComputation.distanceMeters,
      distanceOverLimit: this.lastGeoComputation.distanceOverLimit,
      debugClamped: this.lastGeoComputation.debugClamped,
      objectBehindCamera: this.lastGeoComputation.objectBehindCamera,
      pose: clonePose(this.lastGeoComputation.pose)
    };
  }

  getGeoDebugSnapshot() {
    return this.getLastGeoComputation();
  }

  getPlacementDebugSnapshot({ hasStableSurface = false, cameraState = null } = {}) {
    const visibilityDebug = this.computeVisibilityDebug(cameraState);

    return {
      objectPlaced: this.placed,
      distanceOverLimit: Boolean(this.lastGeoComputation.distanceOverLimit),
      hasStableSurface: Boolean(hasStableSurface),
      objectBehindCamera: visibilityDebug.objectBehindCamera
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

  placeGeoAtPose(pose, cameraState = null) {
    if (!this.inARMode || this.placed || !pose) {
      return false;
    }

    this.objectRoot.position.copy(pose.position);
    this.objectRoot.quaternion.copy(this.createGeoPlacementQuaternion(cameraState));
    this.objectRoot.visible = true;
    this.reticle.visible = false;
    this.placed = true;
    return true;
  }

  createGeoPlacementQuaternion(cameraState = null) {
    const groundedDirection =
      projectDirectionToGround(cameraState && cameraState.direction) ||
      (this.geoReferenceForward ? this.geoReferenceForward.clone() : null) ||
      DEFAULT_GEO_FORWARD.clone();
    const yaw = Math.atan2(groundedDirection.x, -groundedDirection.z);
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  }

  computeVisibilityDebug(cameraState, targetPosition = null) {
    if (!cameraState || !cameraState.position || !cameraState.direction) {
      return {
        objectBehindCamera: false,
        dot: null
      };
    }

    const referencePosition = targetPosition
      ? targetPosition.clone()
      : this.placed
        ? this.objectRoot.position.clone()
        : this.lastGeoComputation.pose
          ? this.lastGeoComputation.pose.position.clone()
          : null;

    if (!referencePosition) {
      return {
        objectBehindCamera: false,
        dot: null
      };
    }

    const toObject = new THREE.Vector3().subVectors(referencePosition, cameraState.position);
    if (toObject.lengthSq() < 1e-6) {
      return {
        objectBehindCamera: false,
        dot: 1
      };
    }

    toObject.normalize();
    const dot = cameraState.direction.dot(toObject);
    return {
      objectBehindCamera: dot < 0,
      dot
    };
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
    this.lastGeoComputation = this.createGeoDebugSnapshot("idle");
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
