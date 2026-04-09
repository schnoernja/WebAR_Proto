import * as THREE from "three";
import { smoothFactor } from "../utils.js";
import { wgs84ToEnuVector3 } from "./GeoENU.js";

const WATCH_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 15000
};
const ORIENTATION_NOTIFY_THROTTLE_MS = 120;
const DEVICE_EULER = new THREE.Euler();
const DEVICE_Q0 = new THREE.Quaternion();
const DEVICE_Q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const DEVICE_Z = new THREE.Vector3(0, 0, 1);
const CAMERA_EULER = new THREE.Euler();

function normalizeDegrees(value) {
  let normalized = value % 360;
  if (normalized < 0) {
    normalized += 360;
  }

  return normalized;
}

function shortestAngleDeltaDegrees(fromDeg, toDeg) {
  let delta = normalizeDegrees(toDeg) - normalizeDegrees(fromDeg);
  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }

  return delta;
}

function lerpAngleDegrees(fromDeg, toDeg, factor) {
  return normalizeDegrees(fromDeg + shortestAngleDeltaDegrees(fromDeg, toDeg) * factor);
}

function extractHeadingDegrees(event) {
  if (!event) {
    return null;
  }

  if (Number.isFinite(event.webkitCompassHeading)) {
    return normalizeDegrees(event.webkitCompassHeading);
  }

  if (!Number.isFinite(event.alpha)) {
    return null;
  }

  const supportsAbsoluteHeading = event.type === "deviceorientationabsolute" || event.absolute === true;
  if (!supportsAbsoluteHeading) {
    return null;
  }

  return normalizeDegrees(360 - event.alpha);
}

function getScreenOrientationRad() {
  if (window.screen && window.screen.orientation && Number.isFinite(window.screen.orientation.angle)) {
    return THREE.MathUtils.degToRad(window.screen.orientation.angle);
  }

  if (Number.isFinite(window.orientation)) {
    return THREE.MathUtils.degToRad(window.orientation);
  }

  return 0;
}

function setDeviceQuaternion(targetQuaternion, alphaDeg, betaDeg, gammaDeg) {
  const alpha = THREE.MathUtils.degToRad(alphaDeg || 0);
  const beta = THREE.MathUtils.degToRad(betaDeg || 0);
  const gamma = THREE.MathUtils.degToRad(gammaDeg || 0);
  const screenOrientation = getScreenOrientationRad();

  DEVICE_EULER.set(beta, alpha, -gamma, "YXZ");
  targetQuaternion.setFromEuler(DEVICE_EULER);
  targetQuaternion.multiply(DEVICE_Q1);
  targetQuaternion.multiply(DEVICE_Q0.setFromAxisAngle(DEVICE_Z, -screenOrientation));
  return targetQuaternion;
}

function buildGeoCameraQuaternion(headingDeg, pitchRad, rollRad, targetQuaternion) {
  const headingRad = THREE.MathUtils.degToRad(headingDeg) + Math.PI;
  CAMERA_EULER.set(pitchRad, headingRad, rollRad, "YXZ");
  targetQuaternion.setFromEuler(CAMERA_EULER);
  return targetQuaternion;
}

function toGeoPosition(position) {
  return {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    h: Number.isFinite(position.coords.altitude) ? position.coords.altitude : null,
    accuracyMeters: position.coords.accuracy,
    timestamp: position.timestamp
  };
}

function toMessage(error, fallback) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createPositionSample(position) {
  return position
    ? {
        lat: position.lat,
        lon: position.lon,
        h: position.h,
        accuracyMeters: position.accuracyMeters,
        timestamp: position.timestamp
      }
    : null;
}

export class SensorFusion {
  constructor({
    windowRef = window,
    navigatorRef = navigator,
    positionSmoothing = 3.6,
    orientationSmoothing = 8.5,
    headingSmoothing = 0.18
  } = {}) {
    this.window = windowRef;
    this.navigator = navigatorRef;
    this.positionSmoothing = positionSmoothing;
    this.orientationSmoothing = orientationSmoothing;
    this.headingSmoothing = headingSmoothing;

    this.watchId = null;
    this.origin = null;
    this.running = false;
    this.issue = null;
    this.message = "Geo-Sensor-Modus ist bereit.";
    this.motionPermissionState = typeof DeviceOrientationEvent === "undefined" ? "unsupported" : "unknown";
    this.locationActive = false;
    this.lastPositionSample = null;
    this.filteredHeadingDeg = null;
    this.calibrationOffsetDeg = 0;
    this.pitchRad = 0;
    this.rollRad = 0;
    this.positionTarget = new THREE.Vector3();
    this.positionCurrent = new THREE.Vector3();
    this.cameraQuaternionTarget = new THREE.Quaternion();
    this.cameraQuaternionCurrent = new THREE.Quaternion();
    this.currentEuler = new THREE.Euler(0, Math.PI, 0, "YXZ");
    this.hasPosition = false;
    this.hasOrientation = false;
    this.lastOrientationNotifyAt = 0;
    this.subscribers = new Set();

    this.handleGeoSuccess = this.handleGeoSuccess.bind(this);
    this.handleGeoError = this.handleGeoError.bind(this);
    this.handleOrientation = this.handleOrientation.bind(this);
  }

  subscribe(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    this.subscribers.add(callback);
    callback(this.getSnapshot());
    return () => {
      this.subscribers.delete(callback);
    };
  }

  notify() {
    const snapshot = this.getSnapshot();
    for (const callback of this.subscribers) {
      callback(snapshot);
    }
  }

  setOrigin(origin) {
    this.origin = origin
      ? {
          lat: origin.lat,
          lon: origin.lon,
          h: Number.isFinite(origin.h) ? origin.h : 0
        }
      : null;

    if (this.lastPositionSample && this.origin) {
      this.updatePositionTarget(this.lastPositionSample);
    }

    this.notify();
  }

  async start({ origin } = {}) {
    if (origin) {
      this.setOrigin(origin);
    }

    if (!window.isSecureContext) {
      this.issue = "https-required";
      this.message = "Geo-Sensor-Modus benoetigt HTTPS oder localhost.";
      this.notify();
      return false;
    }

    if (!this.navigator.geolocation) {
      this.issue = "geolocation-unsupported";
      this.message = "Geolocation ist in diesem Browser nicht verfuegbar.";
      this.notify();
      return false;
    }

    const motionGranted = await this.requestMotionPermission();
    if (!motionGranted) {
      this.notify();
      return false;
    }

    this.attachOrientationListeners();
    const watchStarted = this.startGeolocationWatch();
    if (!watchStarted) {
      this.detachOrientationListeners();
      this.notify();
      return false;
    }
    this.issue = null;
    this.message = "Geo-Sensor-Modus aktiv. Warte auf GPS und IMU.";
    this.running = true;
    this.notify();
    return true;
  }

  stop() {
    this.running = false;
    this.locationActive = false;

    if (this.watchId !== null && this.navigator.geolocation) {
      this.navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;

    this.detachOrientationListeners();
    this.notify();
  }

  async requestMotionPermission() {
    if (typeof DeviceOrientationEvent === "undefined") {
      this.motionPermissionState = "unsupported";
      this.issue = "orientation-unsupported";
      this.message = "DeviceOrientation wird in diesem Browser nicht unterstuetzt.";
      return false;
    }

    const permissionRequester = DeviceOrientationEvent.requestPermission;
    if (typeof permissionRequester !== "function") {
      this.motionPermissionState = "granted";
      return true;
    }

    try {
      const permission = await permissionRequester.call(DeviceOrientationEvent);
      this.motionPermissionState = permission;
      if (permission !== "granted") {
        this.issue = "orientation-denied";
        this.message = "IMU-/Kompass-Zugriff wurde verweigert.";
        return false;
      }

      return true;
    } catch (error) {
      this.motionPermissionState = "denied";
      this.issue = "orientation-denied";
      this.message = `IMU-/Kompass-Zugriff fehlgeschlagen: ${toMessage(error, "unbekannter Fehler")}`;
      return false;
    }
  }

  attachOrientationListeners() {
    this.window.addEventListener("deviceorientationabsolute", this.handleOrientation);
    this.window.addEventListener("deviceorientation", this.handleOrientation);
  }

  detachOrientationListeners() {
    this.window.removeEventListener("deviceorientationabsolute", this.handleOrientation);
    this.window.removeEventListener("deviceorientation", this.handleOrientation);
  }

  startGeolocationWatch() {
    if (this.watchId !== null) {
      return true;
    }

    try {
      this.watchId = this.navigator.geolocation.watchPosition(
        this.handleGeoSuccess,
        this.handleGeoError,
        WATCH_OPTIONS
      );
      this.locationActive = true;
      return true;
    } catch (error) {
      this.issue = "geolocation-error";
      this.message = `GPS-Tracking konnte nicht gestartet werden: ${toMessage(error, "unbekannter Fehler")}`;
      return false;
    }
  }

  handleGeoSuccess(position) {
    this.issue = null;
    this.message = "GPS- und Sensordaten werden aktualisiert.";
    this.locationActive = true;
    this.lastPositionSample = toGeoPosition(position);
    this.updatePositionTarget(this.lastPositionSample);
    this.notify();
  }

  handleGeoError(error) {
    this.locationActive = false;

    switch (error ? error.code : null) {
      case 1:
        this.issue = "geolocation-denied";
        this.message = "Standortzugriff wurde verweigert.";
        break;
      case 2:
        this.issue = "geolocation-unavailable";
        this.message = "GPS-Position ist aktuell nicht verfuegbar.";
        break;
      case 3:
        this.issue = "geolocation-timeout";
        this.message = "GPS-Position konnte nicht rechtzeitig gelesen werden.";
        break;
      default:
        this.issue = "geolocation-error";
        this.message = "GPS-Tracking ist fehlgeschlagen.";
        break;
    }

    this.notify();
  }

  updatePositionTarget(positionSample) {
    if (!positionSample || !this.origin) {
      return;
    }

    const normalizedSample = {
      ...positionSample,
      h: Number.isFinite(positionSample.h) ? positionSample.h : this.origin.h
    };
    const nextPosition = wgs84ToEnuVector3(normalizedSample, this.origin);
    if (!nextPosition) {
      return;
    }

    if (!this.hasPosition) {
      this.positionTarget.copy(nextPosition);
      this.positionCurrent.copy(nextPosition);
      this.hasPosition = true;
      return;
    }

    const jumpDistance = this.positionTarget.distanceTo(nextPosition);
    const allowedJump = Math.max(positionSample.accuracyMeters * 1.25, 1.5);
    const acceptanceFactor = jumpDistance <= allowedJump ? 1 : clamp(allowedJump / jumpDistance, 0.08, 0.32);
    this.positionTarget.lerp(nextPosition, acceptanceFactor);
  }

  handleOrientation(event) {
    if (!event) {
      return;
    }

    const hasEulerAngles =
      Number.isFinite(event.alpha) || Number.isFinite(event.beta) || Number.isFinite(event.gamma);
    if (!hasEulerAngles) {
      return;
    }

    const headingDeg = extractHeadingDegrees(event);
    if (Number.isFinite(headingDeg)) {
      this.filteredHeadingDeg =
        this.filteredHeadingDeg === null
          ? headingDeg
          : lerpAngleDegrees(this.filteredHeadingDeg, headingDeg, this.headingSmoothing);
    }

    const deviceQuaternion = setDeviceQuaternion(
      new THREE.Quaternion(),
      event.alpha || 0,
      event.beta || 0,
      event.gamma || 0
    );
    const deviceEuler = new THREE.Euler().setFromQuaternion(deviceQuaternion, "YXZ");
    this.pitchRad = deviceEuler.x;
    this.rollRad = deviceEuler.z;

    if (this.filteredHeadingDeg !== null) {
      buildGeoCameraQuaternion(
        this.getCalibratedHeadingDeg(),
        this.pitchRad,
        this.rollRad,
        this.cameraQuaternionTarget
      );

      if (!this.hasOrientation) {
        this.cameraQuaternionCurrent.copy(this.cameraQuaternionTarget);
      }

      this.hasOrientation = true;
    }

    const now = Date.now();
    if (now - this.lastOrientationNotifyAt >= ORIENTATION_NOTIFY_THROTTLE_MS) {
      this.lastOrientationNotifyAt = now;
      this.notify();
    }
  }

  getCalibratedHeadingDeg() {
    if (this.filteredHeadingDeg === null) {
      return null;
    }

    return normalizeDegrees(this.filteredHeadingDeg + this.calibrationOffsetDeg);
  }

  calibrateHeading() {
    if (this.filteredHeadingDeg === null) {
      return false;
    }

    this.calibrationOffsetDeg = -this.filteredHeadingDeg;
    if (this.hasOrientation) {
      buildGeoCameraQuaternion(
        this.getCalibratedHeadingDeg(),
        this.pitchRad,
        this.rollRad,
        this.cameraQuaternionTarget
      );
    }
    this.message = "Ausrichtung kalibriert.";
    this.notify();
    return true;
  }

  update(deltaSeconds) {
    if (this.hasPosition) {
      const positionBlend = smoothFactor(this.positionSmoothing, deltaSeconds);
      this.positionCurrent.lerp(this.positionTarget, positionBlend);
    }

    if (this.hasOrientation) {
      const orientationBlend = smoothFactor(this.orientationSmoothing, deltaSeconds);
      this.cameraQuaternionCurrent.slerp(this.cameraQuaternionTarget, orientationBlend);
      this.currentEuler.setFromQuaternion(this.cameraQuaternionCurrent, "YXZ");
    }

    return this.getPose();
  }

  getPose() {
    if (!this.hasPosition || !this.hasOrientation) {
      return null;
    }

    return {
      position: this.positionCurrent.clone(),
      quaternion: this.cameraQuaternionCurrent.clone()
    };
  }

  getSnapshot() {
    const position = createPositionSample(this.lastPositionSample);
    return {
      running: this.running,
      ready: this.hasPosition && this.hasOrientation,
      issue: this.issue,
      message: this.message,
      motionPermissionState: this.motionPermissionState,
      locationActive: this.locationActive,
      position,
      enuPosition: this.hasPosition
        ? {
            e: this.positionCurrent.x,
            n: this.positionCurrent.z,
            u: this.positionCurrent.y
          }
        : null,
      headingDeg: this.getCalibratedHeadingDeg(),
      rawHeadingDeg: this.filteredHeadingDeg,
      pitchDeg: THREE.MathUtils.radToDeg(this.currentEuler.x),
      rollDeg: THREE.MathUtils.radToDeg(this.currentEuler.z),
      calibrationOffsetDeg: this.calibrationOffsetDeg
    };
  }
}
