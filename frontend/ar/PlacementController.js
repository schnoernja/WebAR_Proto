import * as THREE from "three";
import { APP_CONFIG } from "./config.js";
import { applyPose, disposeObject3D } from "./utils.js";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_GEO_FORWARD = new THREE.Vector3(0, 0, -1);
const DEFAULT_LOCAL_OBJECTS = Object.freeze([
  {
    id: "object-1",
    offset: Object.freeze({ x: 0, y: 0, z: 0 })
  }
]);

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

function cloneAnchorPosition(position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
    return null;
  }

  if (position instanceof THREE.Vector3) {
    return position.clone();
  }

  return new THREE.Vector3(position.x, position.y, position.z);
}

function normalizeGeoCalibration(calibration) {
  const source = calibration && typeof calibration === "object" ? calibration : null;
  const eastMeters = source && Number.isFinite(source.eastMeters) ? source.eastMeters : 0;
  const northMeters = source && Number.isFinite(source.northMeters) ? source.northMeters : 0;
  const yawDeg = source && Number.isFinite(source.yawDeg) ? source.yawDeg : 0;
  const yawRad = THREE.MathUtils.degToRad(yawDeg);

  return {
    eastMeters,
    northMeters,
    yawDeg,
    yawRad
  };
}

function normalizePlacementTransform(transform) {
  const source = transform && typeof transform === "object" ? transform : null;
  const scaleSource =
    source && Number.isFinite(source.scaleFactor)
      ? source.scaleFactor
      : source && Number.isFinite(source.scale)
        ? source.scale
        : 1;
  const rotationSource =
    source && Number.isFinite(source.rotationDeg)
      ? source.rotationDeg
      : source && Number.isFinite(source.rotation)
        ? source.rotation
        : 0;
  const scaleFactor = clamp(scaleSource, 1, 3);
  const normalizedRotationDeg = ((rotationSource % 360) + 360) % 360;

  return {
    scaleFactor,
    rotationDeg: normalizedRotationDeg,
    rotationRad: THREE.MathUtils.degToRad(normalizedRotationDeg)
  };
}

function cloneLocalObjectConfig(objectConfig) {
  if (!objectConfig || typeof objectConfig !== "object") {
    return null;
  }

  const offset = objectConfig.offset && typeof objectConfig.offset === "object" ? objectConfig.offset : null;
  if (!offset) {
    return null;
  }

  const id =
    typeof objectConfig.id === "string" && objectConfig.id.trim()
      ? objectConfig.id.trim()
      : null;
  const anchor =
    typeof objectConfig.anchor === "string" && objectConfig.anchor.trim() === "viewer-forward"
      ? "viewer-forward"
      : "origin";

  return {
    id,
    asset:
      typeof objectConfig.asset === "string" && objectConfig.asset.trim()
        ? objectConfig.asset.trim()
        : null,
    anchor,
    offset: {
      x: Number.isFinite(offset.x) ? offset.x : 0,
      y: Number.isFinite(offset.y) ? offset.y : 0,
      z: Number.isFinite(offset.z) ? offset.z : 0
    }
  };
}

function cloneLocalObjectConfigs(objectConfigs) {
  if (!Array.isArray(objectConfigs) || objectConfigs.length === 0) {
    return DEFAULT_LOCAL_OBJECTS.map((entry) => ({
      id: entry.id,
      asset: null,
      anchor: "origin",
      offset: { ...entry.offset }
    }));
  }

  const normalized = [];
  for (let index = 0; index < objectConfigs.length; index += 1) {
    const cloned = cloneLocalObjectConfig(objectConfigs[index]);
    if (!cloned) {
      continue;
    }

    if (!cloned.id) {
      cloned.id = `object-${index + 1}`;
    }

    normalized.push(cloned);
  }

  if (!normalized.length) {
    return DEFAULT_LOCAL_OBJECTS.map((entry) => ({
      id: entry.id,
      asset: null,
      anchor: "origin",
      offset: { ...entry.offset }
    }));
  }

  return normalized;
}

function cloneGeoPlacement(placement) {
  if (!placement || !placement.worldPosition || !placement.offset) {
    return null;
  }

  return {
    id: placement.id,
    asset: placement.asset || null,
    offset: {
      x: placement.offset.x,
      y: placement.offset.y,
      z: placement.offset.z
    },
    worldPosition: placement.worldPosition.clone(),
    pose: clonePose(placement.pose)
  };
}

function cloneGeoPlacements(placements) {
  if (!Array.isArray(placements)) {
    return [];
  }

  return placements.map((placement) => cloneGeoPlacement(placement)).filter((placement) => placement !== null);
}

function alignBottomToParentGround(object) {
  if (!object || !object.parent) {
    return;
  }

  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.y)) {
    return;
  }

  const parentPosition = new THREE.Vector3();
  const parentScale = new THREE.Vector3();
  object.parent.updateMatrixWorld(true);
  object.parent.getWorldPosition(parentPosition);
  object.parent.getWorldScale(parentScale);

  const scaleY = Math.abs(parentScale.y) > 1e-6 ? parentScale.y : 1;
  object.position.y -= (box.min.y - parentPosition.y) / scaleY;
  object.updateMatrixWorld(true);
}

export class PlacementController {
  constructor({ scene }) {
    this.scene = scene;
    this.objectRoot = new THREE.Group();
    this.transformRoot = new THREE.Group();
    this.geoInstancesRoot = new THREE.Group();
    this.geoInstancesRoot.name = "geo-local-instances";
    this.objectRoot.visible = true;
    this.objectRoot.add(this.transformRoot);
    this.objectRoot.add(this.geoInstancesRoot);

    this.mode = isValidMode(APP_CONFIG.placement.defaultMode)
      ? APP_CONFIG.placement.defaultMode
      : PlacementMode.FREE;
    this.geoTarget = { ...APP_CONFIG.placement.defaultGeoTarget };
    this.geoOrigin = null;
    this.geoOriginAnchor = null;
    this.geoCalibration = normalizeGeoCalibration(null);
    this.placementTransform = normalizePlacementTransform(null);
    this.geoReferenceForward = null;
    this.geoReferenceRight = null;
    this.localObjects = cloneLocalObjectConfigs(null);

    this.reticle = this.createReticle();
    this.reticle.visible = false;

    this.scene.add(this.objectRoot);
    this.scene.add(this.reticle);

    this.asset = null;
    this.currentSurfaceState = null;
    this.inARMode = false;
    this.placed = false;
    this.textInputActive = false;
    this.presentationVisible = true;
    this.lastGeoComputation = this.createGeoDebugSnapshot("idle");

    this.showFallbackPreview();
  }

  createGeoDebugSnapshot(status, overrides = {}) {
    return {
      status,
      originLatitude: this.geoOriginAnchor ? this.geoOriginAnchor.x : null,
      originLongitude: this.geoOriginAnchor ? this.geoOriginAnchor.z : null,
      targetLatitude: null,
      targetLongitude: null,
      deltaLatitude: null,
      deltaLongitude: null,
      xMeters: null,
      zMeters: null,
      distanceMeters: null,
      distanceOverLimit: false,
      debugClamped: false,
      objectBehindCamera: false,
      pose: null,
      placements: [],
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
      this.transformRoot.remove(this.asset);
      disposeObject3D(this.asset);
    }

    this.asset = asset;
    this.transformRoot.add(this.asset);
    this.applyPlacementTransform();
    this.showFallbackPreview();
  }

  setGeoObjects(objectConfigs) {
    this.localObjects = cloneLocalObjectConfigs(objectConfigs);
    this.clearGeoComputation();
    return true;
  }

  getGeoObjects() {
    return this.localObjects.map((objectConfig) => ({
      id: objectConfig.id,
      asset: objectConfig.asset,
      offset: { ...objectConfig.offset }
    }));
  }

  enterARMode() {
    this.inARMode = true;
    this.clearGeoOrigin();
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

    if (!this.presentationVisible || this.textInputActive || !this.inARMode || this.placed || !surfaceState.displayPose) {
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

  setGeoCalibration(calibration) {
    this.geoCalibration = normalizeGeoCalibration(calibration);
    this.clearGeoComputation();
    return true;
  }

  getGeoCalibration() {
    return { ...this.geoCalibration };
  }

  setPlacementTransform(transform) {
    this.placementTransform = normalizePlacementTransform(transform);
    this.applyPlacementTransform();
    return true;
  }

  getPlacementTransform() {
    return {
      scaleFactor: this.placementTransform.scaleFactor,
      rotationDeg: this.placementTransform.rotationDeg
    };
  }

  applyPlacementTransform() {
    if (!this.transformRoot) {
      return;
    }

    this.transformRoot.scale.setScalar(this.placementTransform.scaleFactor);
    this.transformRoot.rotation.set(0, this.placementTransform.rotationRad, 0);
    if (this.asset) {
      alignBottomToParentGround(this.asset);
    }

    for (const slot of this.geoInstancesRoot.children) {
      const instance = slot.children && slot.children.length ? slot.children[0] : null;
      if (!instance) {
        continue;
      }

      this.applyPlacementTransformToInstance(instance);
    }
  }

  applyPlacementTransformToInstance(instance) {
    if (!instance) {
      return;
    }

    instance.scale.setScalar(this.placementTransform.scaleFactor);
    instance.rotation.set(0, this.placementTransform.rotationRad, 0);
    alignBottomToParentGround(instance);
  }

  setGeoOrigin(coord) {
    let anchorPosition = null;
    if (coord && typeof coord === "object") {
      if (coord.anchorPose && coord.anchorPose.position) {
        anchorPosition = coord.anchorPose.position;
      } else if (coord.anchorPosition) {
        anchorPosition = coord.anchorPosition;
      } else if (Number.isFinite(coord.x) && Number.isFinite(coord.y) && Number.isFinite(coord.z)) {
        anchorPosition = coord;
      }
    }

    const clonedAnchor = cloneAnchorPosition(anchorPosition);
    if (!clonedAnchor) {
      return false;
    }

    this.geoOriginAnchor = clonedAnchor;
    this.geoOrigin = {
      x: clonedAnchor.x,
      y: clonedAnchor.y,
      z: clonedAnchor.z
    };
    this.clearGeoComputation();
    return true;
  }

  setGeoReferenceDirection(direction, { headingRad = null, requireHeading = false } = {}) {
    const groundedDirection = projectDirectionToGround(direction);
    if (!groundedDirection) {
      return false;
    }

    if (requireHeading) {
      if (!Number.isFinite(headingRad)) {
        return false;
      }

      this.geoReferenceForward = groundedDirection.clone().applyAxisAngle(WORLD_UP, -headingRad).normalize();
    } else {
      this.geoReferenceForward = groundedDirection;
    }

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
    return this.geoOriginAnchor !== null;
  }

  getGeoOrigin() {
    return this.geoOrigin ? { ...this.geoOrigin } : null;
  }

  clearGeoOrigin() {
    this.geoOrigin = null;
    this.geoOriginAnchor = null;
    this.clearGeoComputation();
  }

  clearGeoReferenceDirection() {
    this.geoReferenceForward = null;
    this.geoReferenceRight = null;
    this.clearGeoComputation();
  }

  computeGeoPosition(floorPose, cameraState = null) {
    if (!floorPose || !floorPose.position) {
      this.lastGeoComputation = this.createGeoDebugSnapshot("missing-floor");
      return this.getLastGeoComputation();
    }

    if (!this.geoOriginAnchor) {
      this.lastGeoComputation = this.createGeoDebugSnapshot("missing-origin");
      return this.getLastGeoComputation();
    }

    if (!this.hasGeoReferenceDirection()) {
      this.lastGeoComputation = this.createGeoDebugSnapshot("missing-reference");
      return this.getLastGeoComputation();
    }

    const floorY = floorPose.position.y;
    const placements = [];
    let maxDistanceMeters = 0;

    for (const objectConfig of this.localObjects) {
      const offsetX = objectConfig.offset.x + this.geoCalibration.eastMeters;
      const offsetZ = objectConfig.offset.z + this.geoCalibration.northMeters;
      const offsetY = objectConfig.offset.y;
      const offset = this.geoReferenceRight
        .clone()
        .multiplyScalar(offsetX)
        .add(this.geoReferenceForward.clone().multiplyScalar(offsetZ));
      const usesViewerForwardAnchor = objectConfig.anchor === "viewer-forward" && cameraState && cameraState.position;
      const anchorPosition = usesViewerForwardAnchor
        ? cameraState.position
        : this.geoOriginAnchor;
      const worldPosition = new THREE.Vector3(
        anchorPosition.x + offset.x,
        floorY + offsetY,
        anchorPosition.z + offset.z
      );
      const distanceMeters = Math.hypot(offsetX, offsetZ);
      maxDistanceMeters = Math.max(maxDistanceMeters, distanceMeters);

      placements.push({
        id: objectConfig.id,
        asset: objectConfig.asset || null,
        offset: {
          x: objectConfig.offset.x,
          y: objectConfig.offset.y,
          z: objectConfig.offset.z
        },
        worldPosition,
        pose: {
          position: worldPosition.clone(),
          quaternion: new THREE.Quaternion()
        }
      });
    }

    if (!placements.length) {
      this.lastGeoComputation = this.createGeoDebugSnapshot("missing-target");
      return this.getLastGeoComputation();
    }

    const firstPlacement = placements[0];
    const pose = {
      position: firstPlacement.worldPosition.clone(),
      quaternion: new THREE.Quaternion()
    };
    const visibilityDebug = this.computeVisibilityDebug(cameraState, firstPlacement.worldPosition);

    this.lastGeoComputation = this.createGeoDebugSnapshot("ready", {
      targetLatitude: firstPlacement.offset.x,
      targetLongitude: firstPlacement.offset.z,
      deltaLatitude: firstPlacement.offset.x,
      deltaLongitude: firstPlacement.offset.z,
      xMeters: firstPlacement.worldPosition.x,
      zMeters: firstPlacement.worldPosition.z,
      distanceMeters: maxDistanceMeters,
      distanceOverLimit: false,
      objectBehindCamera: visibilityDebug.objectBehindCamera,
      pose: clonePose(pose),
      placements: cloneGeoPlacements(placements)
    });

    return {
      status: "ready",
      distanceMeters: maxDistanceMeters,
      pose,
      placements: cloneGeoPlacements(placements)
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
      pose: clonePose(this.lastGeoComputation.pose),
      placements: cloneGeoPlacements(this.lastGeoComputation.placements)
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
    if (this.textInputActive || !this.inARMode || this.placed || !pose) {
      return false;
    }

    this.clearGeoInstances();
    this.transformRoot.visible = true;
    applyPose(this.objectRoot, pose);
    this.objectRoot.visible = this.presentationVisible;
    this.reticle.visible = false;
    this.placed = true;
    return true;
  }

  placeGeoAtPose(pose, cameraState = null) {
    if (this.textInputActive || !this.inARMode || this.placed || !pose) {
      return false;
    }

    const computation = this.getLastGeoComputation();
    const placements = Array.isArray(computation.placements) ? computation.placements : [];
    if (!placements.length) {
      return false;
    }

    this.clearGeoInstances();
    this.transformRoot.visible = false;
    this.objectRoot.position.set(0, 0, 0);
    this.objectRoot.quaternion.identity();
    void cameraState;

    for (const placement of placements) {
      const slot = new THREE.Group();
      slot.name = `geo-offset-${placement.id}`;
      slot.position.copy(placement.worldPosition);
      this.geoInstancesRoot.add(slot);

      const instance = this.asset ? this.asset.clone(true) : null;
      if (instance) {
        slot.add(instance);
        this.applyPlacementTransformToInstance(instance);
      }
    }

    this.objectRoot.visible = this.presentationVisible;
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

  getPrimaryPlacedPosition() {
    if (this.geoInstancesRoot.children.length > 0) {
      return this.geoInstancesRoot.children[0].position.clone();
    }

    return this.placed ? this.objectRoot.position.clone() : null;
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
      : this.lastGeoComputation.pose
        ? this.lastGeoComputation.pose.position.clone()
        : this.getPrimaryPlacedPosition();

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

  clearGeoInstances() {
    for (const child of [...this.geoInstancesRoot.children]) {
      this.geoInstancesRoot.remove(child);
      disposeObject3D(child);
    }
  }

  resetPlacement() {
    this.placed = false;
    this.currentSurfaceState = null;
    this.reticle.visible = false;
    this.clearGeoInstances();
    this.transformRoot.visible = true;
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
    this.clearGeoInstances();
    this.transformRoot.visible = true;
    this.objectRoot.visible = this.presentationVisible;
    this.objectRoot.position.set(0, 0, 0);
    this.objectRoot.quaternion.identity();
    this.applyPlacementTransform();
  }

  isPlaced() {
    return this.placed;
  }

  setTextInputActive(active) {
    this.textInputActive = Boolean(active);

    if (this.textInputActive) {
      this.reticle.visible = false;
      return;
    }

    if (this.currentSurfaceState) {
      this.updateSurfaceState(this.currentSurfaceState);
    }
  }

  setPresentationVisible(visible) {
    this.presentationVisible = Boolean(visible);

    if (!this.presentationVisible) {
      this.reticle.visible = false;
      this.objectRoot.visible = false;
      return;
    }

    if (this.inARMode) {
      this.objectRoot.visible = this.placed;
      if (this.currentSurfaceState) {
        this.updateSurfaceState(this.currentSurfaceState);
      }
      return;
    }

    this.showFallbackPreview();
  }

  dispose() {
    this.scene.remove(this.objectRoot);
    this.scene.remove(this.reticle);

    disposeObject3D(this.reticle);
    disposeObject3D(this.objectRoot);
  }
}
