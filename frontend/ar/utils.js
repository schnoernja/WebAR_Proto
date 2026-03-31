import * as THREE from "three";

function disposeMaterial(material) {
  if (!material) {
    return;
  }

  for (const value of Object.values(material)) {
    if (value && typeof value === "object" && value.isTexture) {
      value.dispose();
    }
  }

  material.dispose();
}

export function clonePose(pose) {
  return {
    position: pose.position.clone(),
    quaternion: pose.quaternion.clone()
  };
}

export function applyPose(object3D, pose) {
  object3D.position.copy(pose.position);
  object3D.quaternion.copy(pose.quaternion);
}

export function smoothFactor(speed, deltaSeconds) {
  if (speed <= 0) {
    return 1;
  }

  const clampedDelta = Math.max(deltaSeconds, 0);
  return 1 - Math.exp(-speed * clampedDelta);
}

export function quaternionAngle(a, b) {
  const dot = THREE.MathUtils.clamp(Math.abs(a.dot(b)), -1, 1);
  return 2 * Math.acos(dot);
}

export function averageQuaternion(samples, targetQuaternion) {
  if (!samples.length) {
    return targetQuaternion.identity();
  }

  const reference = samples[0].quaternion;
  const accumulator = new THREE.Vector4(0, 0, 0, 0);

  for (const sample of samples) {
    const weight = reference.dot(sample.quaternion) >= 0 ? 1 : -1;
    accumulator.x += sample.quaternion.x * weight;
    accumulator.y += sample.quaternion.y * weight;
    accumulator.z += sample.quaternion.z * weight;
    accumulator.w += sample.quaternion.w * weight;
  }

  if (accumulator.lengthSq() < 1e-8) {
    return targetQuaternion.copy(reference);
  }

  targetQuaternion.set(accumulator.x, accumulator.y, accumulator.z, accumulator.w);
  return targetQuaternion.normalize();
}

export function disposeObject3D(root) {
  root.traverse((node) => {
    if (node.geometry) {
      node.geometry.dispose();
    }

    if (Array.isArray(node.material)) {
      for (const material of node.material) {
        disposeMaterial(material);
      }
      return;
    }

    if (node.material) {
      disposeMaterial(node.material);
    }
  });
}
