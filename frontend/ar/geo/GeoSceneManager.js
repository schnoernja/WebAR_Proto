import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { InfoBoardManager } from "../InfoBoard.js?v=info-board-scenes-20260909";
import { disposeObject3D } from "../utils.js";
import { resolveAppUrl } from "../urlUtils.js";
import { enuToVector3 } from "./GeoENU.js";

function createMarkerMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.04,
    emissive: color,
    emissiveIntensity: 0.08
  });
}

function createObjectMarker(id) {
  const marker = new THREE.Group();
  marker.name = `geo-anchor-${id}`;

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 1.6, 18),
    createMarkerMaterial(0x0e7c74)
  );
  pillar.position.y = 0.8;
  marker.add(pillar);

  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 20, 20),
    createMarkerMaterial(0xd18d37)
  );
  cap.position.y = 1.62;
  marker.add(cap);

  return marker;
}

function toActiveInfoBoardConfigs(infoBoards) {
  return Array.isArray(infoBoards)
    ? infoBoards
        .filter((config) => config && config.active !== false)
        .map((config) => ({
          id: config.id,
          text: config.text,
          position: config.offset,
          widthMeters: config.widthMeters,
          scaleFactor: config.scaleFactor,
          rotationDeg: config.rotationDeg,
          billboard: config.billboard,
          style: config.style
        }))
    : [];
}

export class GeoSceneManager {
  constructor({ scene }) {
    this.scene = scene;
    this.loader = new GLTFLoader();
    this.root = new THREE.Group();
    this.root.name = "geo-global-root";
    this.root.visible = false;

    this.sceneAssetRoot = null;
    this.sceneAssetUrl = null;
    this.sceneAssetMixer = null;
    this.infoBoardStagingRoot = new THREE.Group();
    this.infoBoardStagingRoot.name = "geo-info-board-staging-root";
    this.infoBoardManager = new InfoBoardManager({ parent: this.infoBoardStagingRoot });
    this.objectMarkersRoot = new THREE.Group();
    this.objectMarkersRoot.name = "geo-global-markers";
    this.root.add(this.objectMarkersRoot);

    this.siteConfig = null;
    this.scene.add(this.root);
  }

  async loadSite(siteConfig, { loadSceneAsset = true } = {}) {
    this.clearSite();
    this.siteConfig = siteConfig || null;

    if (!this.siteConfig) {
      return null;
    }

    const yawDeg =
      this.siteConfig.orientation && Number.isFinite(this.siteConfig.orientation.yawDeg)
        ? this.siteConfig.orientation.yawDeg
        : 0;
    this.root.rotation.set(0, THREE.MathUtils.degToRad(yawDeg), 0);

    if (loadSceneAsset) {
      await this.ensureSceneAsset();
    }

    for (const objectConfig of this.siteConfig.objects) {
      const marker = createObjectMarker(objectConfig.id);
      const enu = objectConfig.enu
        ? objectConfig.enu
        : {
            e: objectConfig.offset && Number.isFinite(objectConfig.offset.x) ? objectConfig.offset.x : 0,
            n: objectConfig.offset && Number.isFinite(objectConfig.offset.z) ? objectConfig.offset.z : 0,
            u: objectConfig.offset && Number.isFinite(objectConfig.offset.y) ? objectConfig.offset.y : 0
          };
      marker.position.copy(enuToVector3(enu));
      this.objectMarkersRoot.add(marker);
    }

    return {
      siteId: this.siteConfig.id,
      assetUrl: this.siteConfig.scene && this.siteConfig.scene.asset ? this.siteConfig.scene.asset : null,
      objectCount: this.siteConfig.objects.length
    };
  }

  async ensureSceneAsset() {
    const asset = this.siteConfig && this.siteConfig.scene ? this.siteConfig.scene.asset : null;
    if (!asset) {
      return null;
    }

    const assetUrl = resolveAppUrl(asset);
    if (this.sceneAssetRoot && this.sceneAssetUrl === assetUrl) {
      return this.sceneAssetRoot;
    }

    if (this.sceneAssetRoot) {
      if (this.sceneAssetMixer) {
        this.sceneAssetMixer.stopAllAction();
        this.sceneAssetMixer.uncacheRoot(this.sceneAssetRoot);
        this.sceneAssetMixer = null;
      }
      this.root.remove(this.sceneAssetRoot);
      disposeObject3D(this.sceneAssetRoot);
      this.sceneAssetRoot = null;
      this.sceneAssetUrl = null;
    }

    const gltf = await this.loader.loadAsync(assetUrl);
    this.sceneAssetRoot = gltf.scene;
    this.sceneAssetRoot.name = `geo-site-${this.siteConfig.id}`;
    this.sceneAssetUrl = assetUrl;
    this.root.add(this.sceneAssetRoot);
    this.infoBoardManager.setParent(this.sceneAssetRoot);
    this.infoBoardManager.setBoards(toActiveInfoBoardConfigs(this.siteConfig.infoBoards));
    if (Array.isArray(gltf.animations) && gltf.animations.length) {
      this.sceneAssetMixer = new THREE.AnimationMixer(this.sceneAssetRoot);
      for (const clip of gltf.animations) {
        this.sceneAssetMixer.clipAction(clip).play();
      }
    }
    return this.sceneAssetRoot;
  }

  updateAnimations(deltaSeconds) {
    if (!this.sceneAssetMixer || !this.root.visible) {
      return;
    }

    const delta = Number.isFinite(deltaSeconds) ? Math.max(deltaSeconds, 0) : 0;
    this.sceneAssetMixer.update(delta);
  }

  updateInfoBoardBillboards(cameraOrState) {
    if (this.root.visible) {
      this.infoBoardManager.updateBillboards(cameraOrState);
    }
  }

  getInfoBoardCount() {
    return this.infoBoardManager.boards.size;
  }

  setInfoBoards(infoBoards) {
    if (!this.sceneAssetRoot) {
      return 0;
    }
    return this.infoBoardManager.setBoards(toActiveInfoBoardConfigs(infoBoards));
  }

  updateInfoBoard(config) {
    if (!this.sceneAssetRoot || !config || typeof config.id !== "string" || !config.id.trim()) {
      return false;
    }
    const id = config.id.trim();
    if (config.active === false) {
      this.infoBoardManager.removeBoard(id);
      return true;
    }
    const renderConfig = toActiveInfoBoardConfigs([{ ...config, id }])[0];
    if (this.infoBoardManager.boards.has(id)) {
      this.infoBoardManager.updateBoard(id, renderConfig);
    } else {
      this.infoBoardManager.createBoard(renderConfig);
    }
    return true;
  }

  setVisible(visible) {
    this.root.visible = Boolean(visible) && Boolean(this.siteConfig);
  }

  clearSite() {
    this.infoBoardManager.setParent(this.infoBoardStagingRoot);
    this.infoBoardManager.clear();
    if (this.sceneAssetRoot) {
      if (this.sceneAssetMixer) {
        this.sceneAssetMixer.stopAllAction();
        this.sceneAssetMixer.uncacheRoot(this.sceneAssetRoot);
        this.sceneAssetMixer = null;
      }
      this.root.remove(this.sceneAssetRoot);
      disposeObject3D(this.sceneAssetRoot);
      this.sceneAssetRoot = null;
      this.sceneAssetUrl = null;
    }

    for (const child of [...this.objectMarkersRoot.children]) {
      this.objectMarkersRoot.remove(child);
      disposeObject3D(child);
    }
  }

  dispose() {
    this.clearSite();
    this.infoBoardManager.dispose();
    this.scene.remove(this.root);
  }
}
