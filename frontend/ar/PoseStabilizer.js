import * as THREE from "three";
import { APP_CONFIG } from "./config.js?v=placement-timing-20260910";
import { averageQuaternion, clonePose, quaternionAngle, smoothFactor } from "./utils.js";

export class PoseStabilizer {
  constructor(config = APP_CONFIG.stabilizer) {
    this.config = config;
    this.samples = [];
    this.smoothedPose = null;
    this.displayPose = null;
    this.lastStablePose = null;
    this.stableFrameCount = 0;
    this.stableDurationSeconds = 0;
    this.unstableDurationSeconds = 0;
    this.missedFrames = 0;
    this.tmpMeanQuaternion = new THREE.Quaternion();
  }

  setConfig(config) {
    if (config && typeof config === "object") {
      this.config = { ...this.config, ...config };
    }
    this.reset();
  }

  reset() {
    this.samples.length = 0;
    this.smoothedPose = null;
    this.displayPose = null;
    this.lastStablePose = null;
    this.stableFrameCount = 0;
    this.stableDurationSeconds = 0;
    this.unstableDurationSeconds = 0;
    this.missedFrames = 0;
  }

  update(rawPose, deltaSeconds) {
    if (!rawPose) {
      this.missedFrames += 1;

      if (this.missedFrames > APP_CONFIG.hitTest.lostPoseGraceFrames) {
        this.samples.length = 0;
        this.stableFrameCount = 0;
        this.stableDurationSeconds = 0;
        this.unstableDurationSeconds = 0;
        this.lastStablePose = null;
        this.displayPose = null;
      }

      return this.buildState({
        surfaceDetected: Boolean(this.displayPose) && this.missedFrames <= APP_CONFIG.hitTest.lostPoseGraceFrames,
        isStable: false,
        canPlace: false
      });
    }

    this.missedFrames = 0;
    this.updateSmoothedPose(rawPose, deltaSeconds);
    this.pushSample(
      this.config.stabilityUsesSmoothedPose && this.smoothedPose
        ? this.smoothedPose
        : rawPose
    );

    const metrics = this.computeStabilityMetrics();
    const windowStable =
      metrics !== null &&
      metrics.maxPositionDeviation <= this.config.maxPositionDeviationMeters &&
      metrics.maxRotationDeviation <= this.config.maxRotationDeviationRad;

    this.stableFrameCount = windowStable ? this.stableFrameCount + 1 : 0;

    const motionStable = windowStable && this.stableFrameCount >= this.config.stableFramesRequired;
    const elapsedSeconds = Math.max(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0);

    if (motionStable) {
      this.unstableDurationSeconds = 0;
      this.stableDurationSeconds += elapsedSeconds;
    } else if (this.stableDurationSeconds > 0) {
      this.unstableDurationSeconds += elapsedSeconds;
      if (this.unstableDurationSeconds > this.config.unstableGraceSeconds) {
        this.stableDurationSeconds = Math.max(
          0,
          this.stableDurationSeconds - elapsedSeconds * this.config.unstableProgressDecayPerSecond
        );
      }
    }

    const holdStable =
      motionStable || (
        this.stableDurationSeconds > 0 &&
        this.unstableDurationSeconds <= this.config.unstableGraceSeconds
      );

    const isStable =
      holdStable &&
      this.stableDurationSeconds >= this.config.reticleGreenAfterSeconds;
    const canPlace =
      holdStable &&
      this.stableDurationSeconds >= this.config.autoPlaceAfterSeconds;

    if (motionStable && metrics) {
      this.lastStablePose = clonePose(metrics.meanPose);
    } else if (!holdStable) {
      this.lastStablePose = null;
    }

    const targetPose =
      motionStable && metrics && metrics.meanPose
        ? metrics.meanPose
        : this.smoothedPose;

    this.updateDisplayPose(targetPose, deltaSeconds);

    return this.buildState({
      surfaceDetected: true,
      isStable,
      canPlace,
      motionStable
    });
  }

  pushSample(rawPose) {
    this.samples.push(clonePose(rawPose));

    if (this.samples.length > this.config.stabilityWindowSize) {
      this.samples.shift();
    }
  }

  updateSmoothedPose(rawPose, deltaSeconds) {
    if (!this.smoothedPose) {
      this.smoothedPose = clonePose(rawPose);
      return;
    }

    const positionDistance = this.smoothedPose.position.distanceTo(rawPose.position);
    if (positionDistance > this.config.positionDeadbandMeters) {
      const positionAlpha = smoothFactor(this.config.positionSmoothing, deltaSeconds);
      this.smoothedPose.position.lerp(rawPose.position, positionAlpha);
    }

    const rotationDelta = quaternionAngle(this.smoothedPose.quaternion, rawPose.quaternion);
    if (rotationDelta > this.config.rotationDeadbandRad) {
      const rotationAlpha = smoothFactor(this.config.rotationSmoothing, deltaSeconds);
      this.smoothedPose.quaternion.slerp(rawPose.quaternion, rotationAlpha);
    }
  }

  updateDisplayPose(targetPose, deltaSeconds) {
    if (!targetPose) {
      return;
    }

    if (!this.displayPose) {
      this.displayPose = clonePose(targetPose);
      return;
    }

    const positionAlpha = smoothFactor(this.config.positionSmoothing, deltaSeconds);
    const rotationAlpha = smoothFactor(this.config.rotationSmoothing, deltaSeconds);

    this.displayPose.position.lerp(targetPose.position, positionAlpha);
    this.displayPose.quaternion.slerp(targetPose.quaternion, rotationAlpha);
  }

  computeStabilityMetrics() {
    if (this.samples.length < this.config.stabilityWindowSize) {
      return null;
    }

    const meanPosition = new THREE.Vector3();
    for (const sample of this.samples) {
      meanPosition.add(sample.position);
    }
    meanPosition.multiplyScalar(1 / this.samples.length);

    averageQuaternion(this.samples, this.tmpMeanQuaternion);

    let maxPositionDeviation = 0;
    let maxRotationDeviation = 0;

    for (const sample of this.samples) {
      maxPositionDeviation = Math.max(
        maxPositionDeviation,
        sample.position.distanceTo(meanPosition)
      );
      maxRotationDeviation = Math.max(
        maxRotationDeviation,
        quaternionAngle(sample.quaternion, this.tmpMeanQuaternion)
      );
    }

    return {
      meanPose: {
        position: meanPosition,
        quaternion: this.tmpMeanQuaternion.clone()
      },
      maxPositionDeviation,
      maxRotationDeviation
    };
  }

  buildState({ surfaceDetected, isStable, canPlace, motionStable = false }) {
    return {
      surfaceDetected,
      isStable,
      canPlace,
      motionStable,
      stableDurationSeconds: this.stableDurationSeconds,
      displayPose: this.displayPose ? clonePose(this.displayPose) : null,
      stablePose: this.lastStablePose ? clonePose(this.lastStablePose) : null
    };
  }
}
