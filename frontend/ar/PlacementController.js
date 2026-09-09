import * as THREE from "three";
import { APP_CONFIG } from "./config.js";
import { InfoBoardManager } from "./InfoBoard.js?v=info-board-scenes-20260909";
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
  const position = source && source.position && typeof source.position === "object" ? source.position : {};
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
  const scaleFactor = clamp(scaleSource, 0.1, 3);
  const normalizedRotationDeg = ((rotationSource % 360) + 360) % 360;

  return {
    position: {
      x: Number.isFinite(position.x) ? clamp(position.x, -20, 20) : 0,
      y: Number.isFinite(position.y) ? clamp(position.y, -20, 20) : 0,
      z: Number.isFinite(position.z) ? clamp(position.z, -20, 20) : 0
    },
    scaleFactor,
    rotationDeg: normalizedRotationDeg,
    rotationRad: THREE.MathUtils.degToRad(normalizedRotationDeg),
    preserveSourceScale: Boolean(source && source.preserveSourceScale === true)
  };
}

function normalizeObjectTransforms(transforms) {
  if (!Array.isArray(transforms)) {
    return [];
  }

  const nodePaths = new Set();
  return transforms.reduce((normalized, transform) => {
    if (!transform || typeof transform !== "object") {
      return normalized;
    }

    const nodePath = typeof transform.nodePath === "string" ? transform.nodePath.trim() : "";
    if (!nodePath || nodePaths.has(nodePath)) {
      return normalized;
    }

    const position = transform.position && typeof transform.position === "object" ? transform.position : {};
    const scaleSource = Number.isFinite(transform.scaleFactor) ? transform.scaleFactor : transform.scale;
    const rotationSource = Number.isFinite(transform.rotationDeg) ? transform.rotationDeg : transform.rotation;
    nodePaths.add(nodePath);
    normalized.push({
      nodePath,
      node: typeof transform.node === "string" && transform.node.trim() ? transform.node.trim() : null,
      position: {
        x: Number.isFinite(position.x) ? position.x : 0,
        y: Number.isFinite(position.y) ? position.y : 0,
        z: Number.isFinite(position.z) ? position.z : 0
      },
      scaleFactor: Number.isFinite(scaleSource) && scaleSource > 0 ? scaleSource : 1,
      rotationDeg: Number.isFinite(rotationSource) ? rotationSource : 0
    });
    return normalized;
  }, []);
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

function toInfoBoardRenderConfig(config) {
  return {
    id: config.id,
    text: config.text,
    position: config.offset,
    widthMeters: config.widthMeters,
    scaleFactor: config.scaleFactor,
    rotationDeg: config.rotationDeg,
    billboard: config.billboard,
    style: config.style
  };
}

export class PlacementController {
  constructor({ scene, infoBoardManager = null }) {
    this.scene = scene;
    this.objectRoot = new THREE.Group();
    this.transformRoot = new THREE.Group();
    this.geoInstancesRoot = new THREE.Group();
    this.geoInstancesRoot.name = "geo-local-instances";
    this.infoBoardManagerOwned = !infoBoardManager;
    this.infoBoardStagingRoot = infoBoardManager ? infoBoardManager.parent : new THREE.Group();
    this.infoBoardStagingRoot.name = "info-board-staging-root";
    this.infoBoardManager = infoBoardManager || new InfoBoardManager({ parent: this.infoBoardStagingRoot });
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
    this.objectTransforms = [];
    this.editableObjectNodes = null;
    this.geoReferenceForward = null;
    this.geoReferenceRight = null;
    this.localObjects = cloneLocalObjectConfigs(null);

    this.reticle = this.createReticle();
    this.reticle.visible = false;

    this.scene.add(this.objectRoot);
    this.scene.add(this.reticle);

    this.asset = null;
    this.animationClips = [];
    this.assetMixer = null;
    this.geoInstanceMixers = [];
    this.currentSurfaceState = null;
    this.inARMode = false;
    this.placed = false;
    this.textInputActive = false;
    this.presentationVisible = true;
    this.trackingVisible = true;
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

  setAsset(asset, animationClips = [], { preservePlacement = false } = {}) {
    const previousPlacement = preservePlacement && this.placed
      ? {
          objectPose: {
            position: this.objectRoot.position.clone(),
            quaternion: this.objectRoot.quaternion.clone()
          },
          geoPoses: this.geoInstancesRoot.children.map((slot) => ({
            position: slot.position.clone(),
            quaternion: slot.quaternion.clone()
          })),
          isGeoPlacement: this.transformRoot.visible === false
        }
      : null;

    this.stopAssetMixer();
    this.clearGeoInstances();

    if (this.asset) {
      this.infoBoardManager.setParent(this.infoBoardStagingRoot);
      this.transformRoot.remove(this.asset);
      disposeObject3D(this.asset);
    }

    this.asset = asset;
    this.animationClips = Array.isArray(animationClips) ? animationClips : [];
    this.initializeEditableObjectNodes(this.asset);
    this.transformRoot.add(this.asset);
    const assetContentRoot = this.asset.children && this.asset.children.length ? this.asset.children[0] : this.asset;
    this.infoBoardManager.setParent(assetContentRoot);
    this.assetMixer = this.createAnimationMixer(this.asset);
    this.applyObjectTransformsToAsset(this.asset);
    this.applyPlacementTransform();

    if (!previousPlacement) {
      if (this.inARMode) {
        this.resetPlacement();
        return;
      }
      this.showFallbackPreview();
      return;
    }

    this.placed = true;
    if (previousPlacement.isGeoPlacement) {
      this.transformRoot.visible = false;
      for (const pose of previousPlacement.geoPoses) {
        this.addGeoInstance(pose.position, pose.quaternion);
      }
    } else {
      this.transformRoot.visible = true;
      applyPose(this.objectRoot, previousPlacement.objectPose);
    }
    this.objectRoot.visible = this.presentationVisible && this.trackingVisible;
    this.reticle.visible = false;
  }

  addGeoInstance(position, quaternion = null) {
    const slot = new THREE.Group();
    slot.name = "geo-scenario-instance";
    slot.position.copy(position);
    if (quaternion) {
      slot.quaternion.copy(quaternion);
    }

    const instance = this.asset ? this.asset.clone(true) : null;
    if (instance) {
      this.infoBoardManager.removeUnmanagedClones(instance);
      this.applyObjectTransformsToAsset(instance);
      this.applyPlacementTransformToInstance(instance);
      slot.add(instance);
      const instanceContentRoot = instance.children && instance.children.length ? instance.children[0] : instance;
      this.infoBoardManager.addInstanceParent(instanceContentRoot);
      slot.userData.infoBoardParent = instanceContentRoot;
      const mixer = this.createAnimationMixer(instance);
      if (mixer) {
        this.geoInstanceMixers.push({ mixer, root: instance });
      }
    }

    this.geoInstancesRoot.add(slot);
  }

  createAnimationMixer(root) {
    if (!root || !this.animationClips.length) {
      return null;
    }

    const mixer = new THREE.AnimationMixer(root);
    for (const clip of this.animationClips) {
      mixer.clipAction(clip).play();
    }
    return mixer;
  }

  stopAssetMixer() {
    if (!this.assetMixer) {
      return;
    }

    this.assetMixer.stopAllAction();
    if (this.asset) {
      this.assetMixer.uncacheRoot(this.asset);
    }
    this.assetMixer = null;
  }

  updateAnimations(deltaSeconds) {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(deltaSeconds, 0) : 0;
    if (this.assetMixer && this.transformRoot.visible) {
      this.assetMixer.update(delta);
    }
    for (const entry of this.geoInstanceMixers) {
      entry.mixer.update(delta);
    }
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
    this.trackingVisible = true;
    this.clearGeoOrigin();
    this.clearGeoReferenceDirection();
    this.resetPlacement();
  }

  exitARMode() {
    this.inARMode = false;
    this.trackingVisible = true;
    this.clearGeoOrigin();
    this.clearGeoReferenceDirection();
    this.resetPlacement();
    this.showFallbackPreview();
  }

  updateSurfaceState(surfaceState) {
    this.currentSurfaceState = surfaceState;

    if (
      !this.presentationVisible ||
      !this.trackingVisible ||
      this.textInputActive ||
      !this.inARMode ||
      this.placed ||
      !surfaceState.displayPose
    ) {
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
      position: { ...this.placementTransform.position },
      scaleFactor: this.placementTransform.scaleFactor,
      rotationDeg: this.placementTransform.rotationDeg,
      preserveSourceScale: this.placementTransform.preserveSourceScale
    };
  }

  initializeEditableObjectNodes(asset) {
    if (!asset) {
      return;
    }

    const root = asset.children && asset.children.length ? asset.children[0] : null;
    if (!root) {
      return;
    }

    const visit = (node, path, depth) => {
      node.userData.placementNodePath = path.join("/");
      node.userData.placementNodeBase = {
        position: [node.position.x, node.position.y, node.position.z],
        scale: [node.scale.x, node.scale.y, node.scale.z],
        quaternion: [node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w]
      };
      node.userData.placementNodeDepth = depth;
      node.children.forEach((child, index) => visit(child, [...path, index], depth + 1));
    };

    visit(root, [], 0);
  }

  getEditableObjectNodes() {
    if (!this.asset) {
      return [];
    }

    const targets = [];
    this.asset.traverse((node) => {
      const nodePath = node.userData && node.userData.placementNodePath;
      if (!nodePath || !node.name || (!node.isMesh && node.children.length === 0)) {
        return;
      }

      targets.push({
        nodePath,
        name: node.name,
        depth: Number.isFinite(node.userData.placementNodeDepth) ? node.userData.placementNodeDepth : 0
      });
    });
    if (!Array.isArray(this.editableObjectNodes)) {
      return targets;
    }

    const targetsByName = new Map(targets.map((target) => [target.name, target]));
    return this.editableObjectNodes.reduce((filtered, definition) => {
      const memberTargets = definition.nodes.map((nodeName) => targetsByName.get(nodeName));
      if (memberTargets.every(Boolean)) {
        const nodePaths = memberTargets.map((target) => target.nodePath);
        filtered.push({
          nodePath: nodePaths.length === 1 ? nodePaths[0] : `group:${nodePaths.join("|")}`,
          nodePaths,
          nodeNames: memberTargets.map((target) => target.name),
          name: definition.label,
          depth: 1
        });
      }
      return filtered;
    }, []);
  }

  setEditableObjectNodes(nodes) {
    this.editableObjectNodes = Array.isArray(nodes)
      ? nodes.map((entry) => {
          const nodeNames = Array.isArray(entry.nodes) ? entry.nodes : [entry.node];
          return {
            nodes: nodeNames,
            label: entry.label || nodeNames.join(" + ")
          };
        })
      : null;
    return this.getEditableObjectNodes();
  }

  setInfoBoards(configs, { reset = false } = {}) {
    if (reset) {
      this.infoBoardManager.clear();
    }
    const activeConfigs = Array.isArray(configs)
      ? configs
          .filter((config) => config && config.active !== false)
          .map(toInfoBoardRenderConfig)
      : [];
    return this.infoBoardManager.setBoards(activeConfigs);
  }

  updateInfoBoard(config) {
    if (!config || typeof config.id !== "string" || !config.id.trim()) {
      return false;
    }
    const id = config.id.trim();
    if (config.active === false) {
      this.infoBoardManager.removeBoard(id);
      return true;
    }
    const renderConfig = toInfoBoardRenderConfig({ ...config, id });
    if (this.infoBoardManager.boards.has(id)) {
      this.infoBoardManager.updateBoard(id, renderConfig);
    } else {
      this.infoBoardManager.createBoard(renderConfig);
    }
    return true;
  }

  updateInfoBoardBillboards(cameraOrState) {
    this.infoBoardManager.updateBillboards(cameraOrState);
  }

  getInfoBoardCount() {
    return this.infoBoardManager.boards.size;
  }

  setObjectTransforms(transforms) {
    this.objectTransforms = normalizeObjectTransforms(transforms);
    this.applyObjectTransformsToAsset(this.asset);
    for (const slot of this.geoInstancesRoot.children) {
      const instance = slot.children && slot.children.length ? slot.children[0] : null;
      this.applyObjectTransformsToAsset(instance);
    }
    return this.getObjectTransforms();
  }

  getObjectTransforms() {
    return this.objectTransforms.map((transform) => ({
      nodePath: transform.nodePath,
      node: transform.node,
      position: { ...transform.position },
      scaleFactor: transform.scaleFactor,
      rotationDeg: transform.rotationDeg
    }));
  }

  applyObjectTransformsToAsset(asset) {
    if (!asset) {
      return;
    }

    const nodesByPath = new Map();
    asset.traverse((node) => {
      const base = node.userData && node.userData.placementNodeBase;
      const nodePath = node.userData && node.userData.placementNodePath;
      if (!base || !nodePath) {
        return;
      }

      node.position.set(base.position[0], base.position[1], base.position[2]);
      node.scale.set(base.scale[0], base.scale[1], base.scale[2]);
      node.quaternion.set(base.quaternion[0], base.quaternion[1], base.quaternion[2], base.quaternion[3]);
      nodesByPath.set(nodePath, node);
    });

    for (const transform of this.objectTransforms) {
      const node = nodesByPath.get(transform.nodePath);
      if (!node) {
        continue;
      }

      const base = node.userData.placementNodeBase;
      node.position.set(
        base.position[0] + transform.position.x,
        base.position[1] + transform.position.y,
        base.position[2] + transform.position.z
      );
      node.scale.set(
        base.scale[0] * transform.scaleFactor,
        base.scale[1] * transform.scaleFactor,
        base.scale[2] * transform.scaleFactor
      );
      node.quaternion
        .set(base.quaternion[0], base.quaternion[1], base.quaternion[2], base.quaternion[3])
        .multiply(new THREE.Quaternion().setFromAxisAngle(WORLD_UP, THREE.MathUtils.degToRad(transform.rotationDeg)));
    }
  }

  applyPlacementTransform() {
    if (!this.transformRoot) {
      return;
    }

    this.transformRoot.scale.setScalar(this.placementTransform.scaleFactor);
    this.transformRoot.position.set(
      this.placementTransform.position.x,
      this.placementTransform.position.y,
      this.placementTransform.position.z
    );
    this.transformRoot.rotation.set(0, this.placementTransform.rotationRad, 0);

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
    instance.position.set(
      this.placementTransform.position.x,
      this.placementTransform.position.y,
      this.placementTransform.position.z
    );
    instance.rotation.set(0, this.placementTransform.rotationRad, 0);
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

  placeAtStablePose(surfacePose, cameraState = null) {
    return this.placeAtPose(surfacePose, cameraState);
  }

  placeAtPose(pose, cameraState = null) {
    if (this.textInputActive || !this.inARMode || this.placed || !pose) {
      return false;
    }

    this.clearGeoInstances();
    this.transformRoot.visible = true;
    this.objectRoot.position.copy(pose.position);
    this.objectRoot.quaternion.copy(this.createViewAlignedQuaternion(cameraState));
    this.objectRoot.visible = this.presentationVisible && this.trackingVisible;
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
    const placementQuaternion = this.createGeoPlacementQuaternion(cameraState);

    for (const placement of placements) {
      this.addGeoInstance(placement.worldPosition, placementQuaternion);
    }

    this.objectRoot.visible = this.presentationVisible && this.trackingVisible;
    this.reticle.visible = false;
    this.placed = true;
    return true;
  }

  createViewAlignedQuaternion(cameraState = null) {
    const groundedDirection =
      projectDirectionToGround(cameraState && cameraState.direction) ||
      DEFAULT_GEO_FORWARD.clone();
    const yaw = Math.atan2(-groundedDirection.x, -groundedDirection.z);
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  }

  createGeoPlacementQuaternion(cameraState = null) {
    const groundedDirection =
      (this.geoReferenceForward ? this.geoReferenceForward.clone() : null) ||
      projectDirectionToGround(cameraState && cameraState.direction) ||
      DEFAULT_GEO_FORWARD.clone();
    const yaw = Math.atan2(-groundedDirection.x, -groundedDirection.z) + this.geoCalibration.yawRad;
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
    for (const entry of this.geoInstanceMixers) {
      entry.mixer.stopAllAction();
      entry.mixer.uncacheRoot(entry.root);
    }
    this.geoInstanceMixers = [];

    for (const child of [...this.geoInstancesRoot.children]) {
      if (child.userData.infoBoardParent) {
        this.infoBoardManager.removeInstanceParent(child.userData.infoBoardParent);
      }
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
      this.objectRoot.visible = this.trackingVisible && this.placed;
      if (this.currentSurfaceState) {
        this.updateSurfaceState(this.currentSurfaceState);
      }
      return;
    }

    this.showFallbackPreview();
  }

  setTrackingVisible(visible) {
    this.trackingVisible = Boolean(visible);

    if (!this.inARMode) {
      return;
    }

    if (!this.trackingVisible) {
      this.reticle.visible = false;
      this.objectRoot.visible = false;
      return;
    }

    this.objectRoot.visible = this.presentationVisible && this.placed;
    if (this.currentSurfaceState) {
      this.updateSurfaceState(this.currentSurfaceState);
    }
  }

  dispose() {
    this.stopAssetMixer();
    this.clearGeoInstances();
    this.infoBoardManager.setParent(this.infoBoardStagingRoot);
    if (this.infoBoardManagerOwned) {
      this.infoBoardManager.dispose();
    }
    this.scene.remove(this.objectRoot);
    this.scene.remove(this.reticle);

    disposeObject3D(this.reticle);
    disposeObject3D(this.objectRoot);
  }
}
