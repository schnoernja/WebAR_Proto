import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { disposeObject3D } from "../utils.js";
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

export class GeoSceneManager {
  constructor({ scene }) {
    this.scene = scene;
    this.loader = new GLTFLoader();
    this.root = new THREE.Group();
    this.root.name = "geo-global-root";
    this.root.visible = false;

    this.sceneAssetRoot = null;
    this.objectMarkersRoot = new THREE.Group();
    this.objectMarkersRoot.name = "geo-global-markers";
    this.root.add(this.objectMarkersRoot);

    this.siteConfig = null;
    this.scene.add(this.root);
  }

  async loadSite(siteConfig) {
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

    if (this.siteConfig.scene && this.siteConfig.scene.asset) {
      const gltf = await this.loader.loadAsync(this.siteConfig.scene.asset);
      this.sceneAssetRoot = gltf.scene;
      this.sceneAssetRoot.name = `geo-site-${this.siteConfig.id}`;
      this.root.add(this.sceneAssetRoot);
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

  setVisible(visible) {
    this.root.visible = Boolean(visible) && Boolean(this.siteConfig);
  }

  clearSite() {
    if (this.sceneAssetRoot) {
      this.root.remove(this.sceneAssetRoot);
      disposeObject3D(this.sceneAssetRoot);
      this.sceneAssetRoot = null;
    }

    for (const child of [...this.objectMarkersRoot.children]) {
      this.objectMarkersRoot.remove(child);
      disposeObject3D(child);
    }
  }

  dispose() {
    this.clearSite();
    this.scene.remove(this.root);
  }
}
