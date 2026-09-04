export const ARLaunchMode = Object.freeze({
  WEBXR: "webxr",
  IOS_SLAM: "ios-slam",
  IOS_QUICK_LOOK: "ios-quick-look",
  UNSUPPORTED: "unsupported"
});

function isIOSDevice(navigatorRef) {
  const userAgent = navigatorRef.userAgent || "";
  const platform = navigatorRef.platform || "";
  const isClassicIOS = /iPad|iPhone|iPod/i.test(userAgent);
  const isIPadDesktopMode = platform === "MacIntel" && navigatorRef.maxTouchPoints > 1;
  return isClassicIOS || isIPadDesktopMode;
}

function isSafariBrowser(navigatorRef) {
  const userAgent = navigatorRef.userAgent || "";
  return /Safari/i.test(userAgent) && !/(CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium)/i.test(userAgent);
}

function supportsQuickLook(documentRef) {
  const link = documentRef.createElement("a");
  return Boolean(link.relList && typeof link.relList.supports === "function" && link.relList.supports("ar"));
}

export class ArCapabilityDetector {
  constructor({
    navigatorRef = window.navigator,
    documentRef = window.document,
    windowRef = window,
    sessionMode = "immersive-ar"
  } = {}) {
    this.navigator = navigatorRef;
    this.document = documentRef;
    this.window = windowRef;
    this.sessionMode = sessionMode;
    this.lastResult = null;
  }

  async detect() {
    const isIOS = isIOSDevice(this.navigator);
    const isSafari = isSafariBrowser(this.navigator);
    const quickLookSupported = isIOS && supportsQuickLook(this.document);
    let webXRSupported = false;
    let webXRError = null;

    if (
      this.window.isSecureContext &&
      this.navigator.xr &&
      typeof this.navigator.xr.isSessionSupported === "function"
    ) {
      try {
        webXRSupported = await this.navigator.xr.isSessionSupported(this.sessionMode);
      } catch (error) {
        webXRError = error;
      }
    }

    let mode = ARLaunchMode.UNSUPPORTED;
    let message = "Dieses Geraet unterstuetzt keinen bekannten AR-Modus.";

    if (webXRSupported) {
      mode = ARLaunchMode.WEBXR;
      message = "WebXR immersive-ar ist verfuegbar.";
    } else if (isIOS) {
      mode = ARLaunchMode.IOS_SLAM;
      message = "iPhone erkannt: In-Browser AR mit Boden-SLAM ist verfuegbar.";
    } else if (quickLookSupported) {
      mode = ARLaunchMode.IOS_QUICK_LOOK;
      message = "WebXR nicht verfuegbar, iOS erkannt: Quick-Look-Fallback ist verfuegbar.";
    }

    this.lastResult = {
      mode,
      message,
      webXRSupported,
      quickLookSupported,
      isIOS,
      isSafari,
      webXRError
    };

    return this.lastResult;
  }

  getLastResult() {
    return this.lastResult;
  }
}
