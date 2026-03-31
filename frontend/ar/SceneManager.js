import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { APP_CONFIG } from "./config.js";
import { disposeObject3D } from "./utils.js";

function setTransparentGrid(grid) {
  const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const material of materials) {
    material.transparent = true;
    material.opacity = 0.18;
  }
}

export class SceneManager {
  constructor({ container }) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      APP_CONFIG.renderer.cameraFov,
      1,
      APP_CONFIG.renderer.near,
      APP_CONFIG.renderer.far
    );
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    this.controls = null;
    this.fallbackStage = null;
    this.isARMode = false;
    this.handleResize = this.handleResize.bind(this);
  }

  async initialize() {
    if (!this.container) {
      throw new Error("Render container '#render-root' wurde nicht gefunden.");
    }

    this.renderer.xr.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, APP_CONFIG.renderer.pixelRatioCap));
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(this.createLights());
    this.fallbackStage = this.createFallbackStage();
    this.scene.add(this.fallbackStage);

    this.camera.position.set(
      APP_CONFIG.fallback.cameraPosition.x,
      APP_CONFIG.fallback.cameraPosition.y,
      APP_CONFIG.fallback.cameraPosition.z
    );

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(
      APP_CONFIG.fallback.controlsTarget.x,
      APP_CONFIG.fallback.controlsTarget.y,
      APP_CONFIG.fallback.controlsTarget.z
    );
    this.controls.minDistance = 1.1;
    this.controls.maxDistance = 5.5;
    this.controls.maxPolarAngle = Math.PI * 0.48;

    window.addEventListener("resize", this.handleResize);
    this.handleResize();
  }

  createLights() {
    const lightRig = new THREE.Group();

    const hemi = new THREE.HemisphereLight(0xfff5e3, 0x3a4e49, 1.35);
    lightRig.add(hemi);

    const key = new THREE.DirectionalLight(0xfff7ea, 1.1);
    key.position.set(2.4, 3.2, 1.6);
    lightRig.add(key);

    const fill = new THREE.DirectionalLight(0x99d2ca, 0.55);
    fill.position.set(-1.4, 1.1, -2.8);
    lightRig.add(fill);

    return lightRig;
  }

  createFallbackStage() {
    const stage = new THREE.Group();

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(
        APP_CONFIG.fallback.platformRadius,
        APP_CONFIG.fallback.platformRadius * 1.06,
        0.08,
        56
      ),
      new THREE.MeshStandardMaterial({
        color: 0xe7dbc3,
        roughness: 0.93,
        metalness: 0.04
      })
    );
    platform.position.y = -0.04;
    stage.add(platform);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(APP_CONFIG.fallback.platformRadius * 0.92, 0.012, 18, 72),
      new THREE.MeshStandardMaterial({
        color: 0x0e7c74,
        roughness: 0.38,
        metalness: 0.18,
        emissive: 0x0a3d3a,
        emissiveIntensity: 0.22
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.002;
    stage.add(ring);

    const grid = new THREE.GridHelper(4.4, 22, 0x0e7c74, 0xbba98f);
    grid.position.y = 0.001;
    setTransparentGrid(grid);
    stage.add(grid);

    return stage;
  }

  async createPlacementAsset() {
    const loader = new GLTFLoader();
    const candidates = [
      {
        url: APP_CONFIG.model.primaryUrl,
        label: "tree.glb"
      },
      {
        url: APP_CONFIG.model.fallbackUrl,
        label: "Fallback-Modell"
      }
    ];

    let lastError = null;

    for (const candidate of candidates) {
      try {
        const gltf = await loader.loadAsync(candidate.url);
        const asset = this.normalizeAsset(gltf.scene);
        return {
          object: asset,
          label: candidate.label,
          sourceUrl: candidate.url,
          usedPlaceholder: false
        };
      } catch (error) {
        lastError = error;
      }
    }

    const placeholder = this.createPlaceholderModel();
    return {
      object: placeholder,
      label: "Platzhalter",
      sourceUrl: "placeholder",
      usedPlaceholder: true,
      error: lastError
    };
  }

  normalizeAsset(assetRoot) {
    const wrapper = new THREE.Group();
    wrapper.name = "placement-asset";
    wrapper.add(assetRoot);

    assetRoot.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = false;
        node.receiveShadow = false;
      }
    });

    assetRoot.updateMatrixWorld(true);
    const rawBox = new THREE.Box3().setFromObject(assetRoot);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const measuredHeight = Math.max(rawSize.y, 0.0001);
    const uniformScale = APP_CONFIG.model.targetHeightMeters / measuredHeight;

    assetRoot.scale.multiplyScalar(uniformScale);
    assetRoot.updateMatrixWorld(true);

    const normalizedBox = new THREE.Box3().setFromObject(assetRoot);
    const center = normalizedBox.getCenter(new THREE.Vector3());
    const minY = normalizedBox.min.y;

    assetRoot.position.x -= center.x;
    assetRoot.position.y -= minY;
    assetRoot.position.z -= center.z;
    assetRoot.updateMatrixWorld(true);

    return wrapper;
  }

  createPlaceholderModel() {
    const group = new THREE.Group();
    group.name = "procedural-placeholder";

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.11, 1.05, 18),
      new THREE.MeshStandardMaterial({
        color: 0x6d4a2f,
        roughness: 0.92,
        metalness: 0.02
      })
    );
    trunk.position.y = 0.525;
    group.add(trunk);

    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(0.72, 1.6, 24),
      new THREE.MeshStandardMaterial({
        color: 0x2d7a43,
        roughness: 0.86,
        metalness: 0.02
      })
    );
    canopy.position.y = 1.48;
    group.add(canopy);

    return group;
  }

  setAnimationLoop(callback) {
    this.renderer.setAnimationLoop(callback);
  }

  setARMode(isActive) {
    this.isARMode = isActive;
    this.fallbackStage.visible = !isActive;
    if (this.controls) {
      this.controls.enabled = !isActive;
    }
  }

  render() {
    if (!this.isARMode && this.controls) {
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
  }

  handleResize() {
    if (this.renderer.xr.isPresenting) {
      return;
    }

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, APP_CONFIG.renderer.pixelRatioCap));
  }

  getScene() {
    return this.scene;
  }

  getRenderer() {
    return this.renderer;
  }

  setCanvasPointerEvents(pointerEvents) {
    if (!this.renderer || !this.renderer.domElement) {
      return;
    }

    this.renderer.domElement.style.pointerEvents = pointerEvents;
  }

  dispose() {
    window.removeEventListener("resize", this.handleResize);
    this.renderer.setAnimationLoop(null);

    if (this.controls) {
      this.controls.dispose();
    }

    if (this.fallbackStage) {
      disposeObject3D(this.fallbackStage);
    }

    this.renderer.dispose();
  }
}
