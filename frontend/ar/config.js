export const APP_CONFIG = Object.freeze({
  model: {
    primaryUrl: "./models/tree.glb",
    fallbackUrl: "./models/fountain.glb",
    targetHeightMeters: 2.4
  },
  placement: {
    defaultMode: "free",
    defaultGeoTarget: {
      latitude: 50.984,
      longitude: 11.029
    },
    maxVisibleDistanceMeters: 100,
    debugClampDistanceMeters: 10
  },
  renderer: {
    pixelRatioCap: 2,
    cameraFov: 58,
    near: 0.01,
    far: 40
  },
  fallback: {
    cameraPosition: { x: 1.85, y: 1.15, z: 2.2 },
    controlsTarget: { x: 0, y: 0.24, z: 0 },
    platformRadius: 0.82
  },
  ar: {
    sessionMode: "immersive-ar",
    referenceSpaceType: "local-floor",
    requiredFeatures: ["local-floor", "hit-test"],
    optionalFeatures: ["dom-overlay"]
  },
  hitTest: {
    lostPoseGraceFrames: 6
  },
  stabilizer: {
    positionSmoothing: 14,
    rotationSmoothing: 12,
    positionDeadbandMeters: 0.0035,
    rotationDeadbandRad: 0.02617993877991494,
    stabilityWindowSize: 10,
    stableFramesRequired: 6,
    maxPositionDeviationMeters: 0.06,
    maxRotationDeviationRad: 0.2617993877991494,
    unstableGraceSeconds: 1.5,
    unstableProgressDecayPerSecond: 0.5,
    reticleGreenAfterSeconds: 2,
    autoPlaceAfterSeconds: 4
  },
  reticle: {
    ringRadius: 0.16,
    ringTube: 0.005,
    centerRadius: 0.018,
    hoverOffset: 0.002
  }
});
