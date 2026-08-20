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

const DEFAULT_PROCESSING_WIDTH = 480;
const DEFAULT_PROCESSING_HEIGHT = 640;

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
    this.lastTrackingTime = 0;
    this.consecutiveTrackedFrames = 0;
    this.lostFrames = 0;

    this.processingWidth = DEFAULT_PROCESSING_WIDTH;
    this.processingHeight = DEFAULT_PROCESSING_HEIGHT;

    // Wiederverwendbare Three.js-Objekte zur Vermeidung von GC-Last im Frame-Loop
    this.tempPlaneQuaternion = new THREE.Quaternion();
    this.tempPlanePosition = new THREE.Vector3();
    this.tempCameraDirection = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
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
    } catch (camError) {
      this.stop();
      throw new Error(`Kamerazugriff fehlgeschlagen: ${toErrorMessage(camError)}`);
    }

    // 3. Verarbeitungs-Canvas einrichten
    const videoW = this.videoElement.videoWidth || 1280;
    const videoH = this.videoElement.videoHeight || 720;
    const aspectRatio = videoW / Math.max(videoH, 1);

    if (aspectRatio < 1) {
      // Portrait
      this.processingWidth = DEFAULT_PROCESSING_WIDTH;
      this.processingHeight = Math.round(DEFAULT_PROCESSING_WIDTH / aspectRatio);
    } else {
      // Landscape or general
      this.processingHeight = DEFAULT_PROCESSING_HEIGHT;
      this.processingWidth = Math.round(DEFAULT_PROCESSING_HEIGHT * aspectRatio);
    }

    this.canvas.width = this.processingWidth;
    this.canvas.height = this.processingHeight;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true, alpha: false });

    // 4. AlvaAR Wasm initialisieren
    try {
      this.alva = await AlvaAR.Initialize(this.processingWidth, this.processingHeight);
      this.applyPose = AlvaARConnectorTHREE.Initialize(THREE);
      console.info("[IOSSLAMTracker] AlvaAR Wasm SLAM erfolgreich initialisiert.", {
        width: this.processingWidth,
        height: this.processingHeight
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

    // 2. Pose mit IMU oder rein optisch berechnen
    let rawPose = null;
    if (this.imu && this.imu.orientation && Array.isArray(this.imu.motion)) {
      rawPose = this.alva.findCameraPoseWithIMU(frame, this.imu.orientation, this.imu.motion);
    } else {
      rawPose = this.alva.findCameraPose(frame);
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

      // 4. Bodenebene (Plane) oder Hit-Test ermitteln
      let hitPose = null;
      let planeDetected = false;

      // Versuche primär explizite Plane Estimation aus AlvaAR
      const rawPlane = typeof this.alva.findPlane === "function" ? this.alva.findPlane() : null;
      if (rawPlane && rawPlane.length >= 16) {
        this.applyPose(rawPlane, this.tempPlaneQuaternion, this.tempPlanePosition);
        hitPose = {
          position: this.tempPlanePosition.clone(),
          quaternion: this.tempPlaneQuaternion.clone()
        };
        planeDetected = true;
      } else if (camera) {
        // Fallback: Raycast entlang der Blickrichtung auf die Bodenebene
        camera.getWorldDirection(this.tempCameraDirection);
        this.raycaster.set(camera.position, this.tempCameraDirection);

        const intersect = this.raycaster.ray.intersectPlane(this.groundPlane, this.intersectionPoint);
        if (intersect && intersect.distanceTo(camera.position) > 0.4 && intersect.distanceTo(camera.position) < 8.0) {
          hitPose = {
            position: this.intersectionPoint.clone(),
            quaternion: new THREE.Quaternion()
          };
          planeDetected = true;
        } else {
          // Standardposition vor der Kamera auf dem Boden
          const forwardGround = new THREE.Vector3(this.tempCameraDirection.x, 0, this.tempCameraDirection.z).normalize();
          const targetPos = camera.position.clone().addScaledVector(forwardGround, 1.8);
          targetPos.y = 0;
          hitPose = {
            position: targetPos,
            quaternion: new THREE.Quaternion()
          };
          planeDetected = true;
        }
      }

      const isStable = this.consecutiveTrackedFrames >= 4;
      this.lastHitPose = hitPose;

      return {
        tracking: true,
        surfaceDetected: planeDetected,
        isStable: isStable,
        pose: hitPose,
        cameraPose: this.lastCameraPose
      };
    }

    // Tracking verloren
    this.lostFrames += 1;
    if (this.lostFrames > 12) {
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
      this.alva.reset();
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
