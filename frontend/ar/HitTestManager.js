import * as THREE from "three";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const MIN_GROUND_NORMAL_Y = Math.cos(THREE.MathUtils.degToRad(30));

function toGroundPose(xrPose) {
  if (!xrPose || !xrPose.transform) {
    return null;
  }

  const orientation = xrPose.transform.orientation;
  const quaternion = new THREE.Quaternion(
    orientation.x,
    orientation.y,
    orientation.z,
    orientation.w
  );
  const surfaceNormal = WORLD_UP.clone().applyQuaternion(quaternion);

  // A hit-test pose uses its local Y axis as the surface normal. Geo
  // placement needs a floor pose, so walls and steep surfaces must not
  // contribute their (often eye-level) Y position as the ground height.
  if (surfaceNormal.dot(WORLD_UP) < MIN_GROUND_NORMAL_Y) {
    return null;
  }

  return {
    position: new THREE.Vector3(
      xrPose.transform.position.x,
      xrPose.transform.position.y,
      xrPose.transform.position.z
    ),
    quaternion
  };
}

export class HitTestManager {
  constructor() {
    this.session = null;
    this.viewerSpace = null;
    this.hitTestSource = null;
  }

  async initialize(session) {
    this.dispose();
    this.session = session;
    this.viewerSpace = await session.requestReferenceSpace("viewer");
    this.hitTestSource = await session.requestHitTestSource({
      space: this.viewerSpace
    });
  }

  update(frame, referenceSpace) {
    if (!frame || !referenceSpace || !this.hitTestSource) {
      return {
        hasHit: false,
        pose: null
      };
    }

    const hitResults = frame.getHitTestResults(this.hitTestSource);
    for (const hitResult of hitResults) {
      const pose = toGroundPose(hitResult.getPose(referenceSpace));
      if (pose) {
        return {
          hasHit: true,
          pose
        };
      }
    }

    return {
      hasHit: false,
      pose: null
    };
  }

  dispose() {
    if (this.hitTestSource && typeof this.hitTestSource.cancel === "function") {
      this.hitTestSource.cancel();
    }

    this.hitTestSource = null;
    this.viewerSpace = null;
    this.session = null;
  }
}
