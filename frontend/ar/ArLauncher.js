import { ARLaunchMode } from "./ArCapabilityDetector.js";

export class ArLauncher {
  constructor({ capabilityDetector, iosQuickLookLauncher }) {
    this.capabilityDetector = capabilityDetector;
    this.iosQuickLookLauncher = iosQuickLookLauncher;
  }

  detectCapabilities() {
    return this.capabilityDetector.detect();
  }

  async launch({ startWebXR, quickLookAssetUrl }) {
    const capability = this.capabilityDetector.getLastResult();

    if (!capability) {
      return {
        mode: ARLaunchMode.UNSUPPORTED,
        started: false,
        reason: "capabilities-not-checked"
      };
    }

    if (capability.mode === ARLaunchMode.WEBXR) {
      console.info("[AR] WebXR immersive-ar verfuegbar: WebXR-Flow wird gestartet.");
      return {
        mode: capability.mode,
        started: await startWebXR()
      };
    }

    if (capability.mode === ARLaunchMode.IOS_QUICK_LOOK) {
      console.info("[AR] WebXR nicht verfuegbar, iOS erkannt: Quick-Look-Fallback wird gestartet.");
      return {
        mode: capability.mode,
        ...this.iosQuickLookLauncher.open(quickLookAssetUrl)
      };
    }

    return {
      mode: ARLaunchMode.UNSUPPORTED,
      started: false,
      reason: "unsupported"
    };
  }
}
