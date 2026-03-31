import * as THREE from "three";

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
    if (!hitResults.length) {
      return {
        hasHit: false,
        pose: null
      };
    }

    const pose = hitResults[0].getPose(referenceSpace);
    if (!pose) {
      return {
        hasHit: false,
        pose: null
      };
    }

    return {
      hasHit: true,
      pose: {
        position: new THREE.Vector3(
          pose.transform.position.x,
          pose.transform.position.y,
          pose.transform.position.z
        ),
        quaternion: new THREE.Quaternion(
          pose.transform.orientation.x,
          pose.transform.orientation.y,
          pose.transform.orientation.z,
          pose.transform.orientation.w
        )
      }
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
