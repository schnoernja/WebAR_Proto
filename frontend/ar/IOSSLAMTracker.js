import * as THREE from "three";
import { AlvaAR } from "./alva/alva_ar.js";
import { AlvaARConnectorTHREE } from "./alva/alva_ar_three.js";
import { IMU } from "./alva/imu.js";

const DEFAULT_CAMERA_CONFIG = Object.freeze({
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 }
  },
  audio: false
});

// Optimierte Arbeitsauflösung für flüssige Wasm-SLAM-Verarbeitung (30-60 FPS auf iPhones)
const TARGET_PROCESSING_WIDTH = 480;
const ESTIMATED_CAMERA_HEIGHT_METERS = 1.35; // Typische Smartphone-Haltehöhe über dem Boden

function toErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unbekannter Kamera- oder Sensorfehler";
}

export class IOSSLAMTracker {
  constructor({ sceneManager } = {}) {
    this.sceneManager = sceneManager || null;
    this.videoElement = null;
    this.mediaStream = null;
    this.canvas = document.createElement("canvas");
    this.ctx = null;
    this.alva = null;
    this.imu = null;
    this.applyPose = null;

    this.active = false;
    this.tracking = false;
    this.consecutiveTrackedFrames = 0;
    this.lostFrames = 0;

    this.processingWidth = 480;
    this.processingHeight = 640;

    // Boden-Ebene: Normalenvektor nach oben (0, 1, 0), Abstand 1.35m unter der Startkamera
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), ESTIMATED_CAMERA_HEIGHT_METERS);
    this.tempCameraDirection = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.intersectionPoint = new THREE.Vector3();

    this.lastHitPose = null;
    this.lastCameraPose = null;
  }

  async start({ videoElement } = {}) {
    if (this.active) {
      return true;
    }

    if (!window.isSecureContext) {
      throw new Error("Kamerazugriff erfordert eine sichere Verbindung (HTTPS oder localhost).");
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("getUserMedia wird von diesem Browser nicht unterstützt.");
    }

    this.videoElement = videoElement || (this.sceneManager ? this.sceneManager.cameraVideo : null);
    if (!this.videoElement) {
      throw new Error("Kein Videoelement für den Kamerastream verfügbar.");
    }

    // 1. IMU initialisieren (iOS Motion & Orientation)
    try {
      this.imu = await IMU.Initialize();
      console.info("[IOSSLAMTracker] IMU erfolgreich initialisiert.");
    } catch (imuError) {
      console.warn("[IOSSLAMTracker] IMU nicht verfügbar oder Berechtigung abgelehnt, fahre rein optisch fort:", imuError);
      this.imu = null;
    }

    // 2. Kamera-Stream anfordern
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia(DEFAULT_CAMERA_CONFIG);
      this.videoElement.srcObject = this.mediaStream;
      this.videoElement.setAttribute("playsinline", "true");
      this.videoElement.muted = true;
      this.videoElement.hidden = false;
      await this.videoElement.play();

      // Warten bis erste Videoframes decodiert sind
      await new Promise((resolve) => {
        if (this.videoElement.readyState >= 2 && this.videoElement.videoWidth > 0) {
          resolve();
        } else {
          const onLoaded = () => {
            this.videoElement.removeEventListener("loadeddata", onLoaded);
            resolve();
          };
          this.videoElement.addEventListener("loadeddata", onLoaded);
          // Timeout Fallback
          setTimeout(resolve, 500);
        }
      });
    } catch (camError) {
      this.stop();
      throw new Error(`Kamerazugriff fehlgeschlagen: ${toErrorMessage(camError)}`);
    }

    // 3. Verarbeitungs-Canvas einrichten mit korrekter Aspect Ratio
    const videoW = this.videoElement.videoWidth || 1280;
    const videoH = this.videoElement.videoHeight || 720;
    const aspectRatio = videoW / Math.max(videoH, 1);

    this.processingWidth = TARGET_PROCESSING_WIDTH;
    this.processingHeight = Math.round(TARGET_PROCESSING_WIDTH / aspectRatio);

    // Auf gerade Pixelmaße runden
    if (this.processingHeight % 2 !== 0) {
      this.processingHeight += 1;
    }

    this.canvas.width = this.processingWidth;
    this.canvas.height = this.processingHeight;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true, alpha: false });

    // 4. AlvaAR Wasm initialisieren
    try {
      this.alva = await AlvaAR.Initialize(this.processingWidth, this.processingHeight);
      this.applyPose = AlvaARConnectorTHREE.Initialize(THREE);
      console.info("[IOSSLAMTracker] AlvaAR Wasm SLAM initialisiert.", {
        width: this.processingWidth,
        height: this.processingHeight,
        aspectRatio: aspectRatio.toFixed(3)
      });
    } catch (alvaError) {
      this.stop();
      throw new Error(`SLAM-Engine konnte nicht initialisiert werden: ${toErrorMessage(alvaError)}`);
    }

    this.active = true;
    this.tracking = false;
    this.consecutiveTrackedFrames = 0;
    this.lostFrames = 0;
    this.lastHitPose = null;
    this.lastCameraPose = null;

    return true;
  }

  update(deltaSeconds, camera) {
    if (!this.active || !this.alva || !this.videoElement || this.videoElement.readyState < 2) {
      return {
        tracking: false,
        surfaceDetected: false,
        isStable: false,
        pose: null,
        cameraPose: null
      };
    }

    // 1. Frame auf Canvas zeichnen & Pixeldaten extrahieren
    this.ctx.drawImage(this.videoElement, 0, 0, this.processingWidth, this.processingHeight);
    const frame = this.ctx.getImageData(0, 0, this.processingWidth, this.processingHeight);

    // 2. Pose berechnen (mit IMU falls vorhanden)
    let rawPose = null;
    if (this.imu && this.imu.orientation && Array.isArray(this.imu.motion) && this.imu.motion.length > 0) {
      rawPose = this.alva.findCameraPoseWithIMU(frame, this.imu.orientation, this.imu.motion);
      this.imu.clear(); // Wichtig: Puffer nach jedem Frame leeren!
    } else {
      rawPose = this.alva.findCameraPose(frame);
      if (this.imu && typeof this.imu.clear === "function") {
        this.imu.clear();
      }
    }

    if (rawPose) {
      this.consecutiveTrackedFrames += 1;
      this.lostFrames = 0;
      this.tracking = true;

      // 3. Three.js Kamera aktualisieren
      if (camera) {
        camera.matrixAutoUpdate = false;
        this.applyPose(rawPose, camera.quaternion, camera.position);
        camera.updateMatrix();
        camera.updateMatrixWorld(true);

        this.lastCameraPose = {
          position: camera.position.clone(),
          quaternion: camera.quaternion.clone()
        };
      }

      // 4. Den Blickstrahl mit der geschätzten Bodenebene schneiden.
      // AlvaAR.findPlane() liefert eine beliebige dominante Ebene aus den
      // aktuellen Feature-Punkten. Der Aufruf ist RANSAC-basiert, teuer und
      // kann pro Frame zwischen Wand, Tisch und Boden wechseln. Das machte
      // die Bodenpose unstetig und verhinderte die nachgelagerte Stabilisierung.
      let hitPose = null;
      let planeDetected = false;

      if (camera) {
        camera.getWorldDirection(this.tempCameraDirection);
        this.raycaster.set(camera.position, this.tempCameraDirection);

        const intersect = this.raycaster.ray.intersectPlane(this.groundPlane, this.intersectionPoint);
        const distanceToCam = intersect ? intersect.distanceTo(camera.position) : 0;

        if (intersect && distanceToCam >= 0.5 && distanceToCam <= 12.0) {
          hitPose = {
            position: this.intersectionPoint.clone(),
            quaternion: new THREE.Quaternion()
          };
          planeDetected = true;
        }
      }

      // Stabilität: Nach 3 aufeinanderfolgenden Frames gilt die Fläche als stabil
      const isStable = this.consecutiveTrackedFrames >= 3;
      this.lastHitPose = hitPose;

      return {
        tracking: true,
        surfaceDetected: planeDetected,
        isStable: isStable,
        pose: hitPose,
        cameraPose: this.lastCameraPose
      };
    }

    // Tracking für diesen Frame kurz verloren -> Grace Frames nutzen, um Flackern zu verhindern
    this.lostFrames += 1;
    if (this.lostFrames <= 6 && this.lastHitPose) {
      return {
        tracking: true,
        surfaceDetected: true,
        isStable: this.consecutiveTrackedFrames >= 3,
        pose: this.lastHitPose,
        cameraPose: this.lastCameraPose
      };
    }

    if (this.lostFrames > 10) {
      this.tracking = false;
      this.consecutiveTrackedFrames = 0;
    }

    return {
      tracking: this.tracking,
      surfaceDetected: false,
      isStable: false,
      pose: null,
      cameraPose: this.lastCameraPose
    };
  }

  reset() {
    if (this.alva && typeof this.alva.reset === "function") {
      try {
        this.alva.reset();
      } catch (_) {
        // ignore
      }
    }
    if (this.imu && typeof this.imu.clear === "function") {
      this.imu.clear();
    }
    this.tracking = false;
    this.consecutiveTrackedFrames = 0;
    this.lostFrames = 0;
    this.lastHitPose = null;
  }

  stop() {
    this.active = false;
    this.tracking = false;
    this.consecutiveTrackedFrames = 0;
    this.lostFrames = 0;

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        try {
          track.stop();
        } catch (_) {
          // ignore
        }
      }
      this.mediaStream = null;
    }

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement.hidden = true;
    }

    if (this.alva && typeof this.alva.reset === "function") {
      try {
        this.alva.reset();
      } catch (_) {
        // ignore
      }
    }
    this.alva = null;
    this.imu = null;
    this.lastHitPose = null;
    this.lastCameraPose = null;
  }

  isActive() {
    return this.active;
  }

  isTracking() {
    return this.tracking;
  }

  dispose() {
    this.stop();
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.ctx = null;
  }
}
