const QUICK_LOOK_POSTER = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

export class IOSQuickLookLauncher {
  constructor({
    documentRef = window.document,
    fetchImpl = window.fetch.bind(window),
    windowRef = window
  } = {}) {
    this.document = documentRef;
    this.fetchImpl = fetchImpl;
    this.window = windowRef;
    this.assetAvailability = new Map();
  }

  async checkAsset(url) {
    if (!url) {
      return false;
    }

    try {
      const response = await this.fetchImpl(url, {
        method: "HEAD",
        cache: "no-cache"
      });
      const available = response.ok;
      this.assetAvailability.set(url, available);
      return available;
    } catch (error) {
      console.warn(`[Quick Look] USDZ-Pruefung fehlgeschlagen (${url}):`, error);
      this.assetAvailability.set(url, false);
      return false;
    }
  }

  isAssetAvailable(url) {
    return Boolean(url && this.assetAvailability.get(url));
  }

  open(url) {
    if (!url || !this.isAssetAvailable(url)) {
      console.warn("[Quick Look] iOS-Fallback nicht moeglich: USDZ-Datei fehlt.", url || "kein Pfad");
      return {
        started: false,
        reason: "missing-usdz",
        url
      };
    }

    const link = this.document.createElement("a");
    const preview = this.document.createElement("img");
    link.rel = "ar";
    link.href = url;
    link.setAttribute("aria-label", "Modell in AR Quick Look oeffnen");
    link.style.position = "fixed";
    link.style.width = "1px";
    link.style.height = "1px";
    link.style.opacity = "0";
    link.style.pointerEvents = "none";
    preview.alt = "";
    preview.src = QUICK_LOOK_POSTER;
    link.appendChild(preview);
    this.document.body.appendChild(link);
    link.click();
    this.window.setTimeout(() => link.remove(), 0);

    console.info("[Quick Look] AR Quick Look Link wurde geoeffnet.");
    return {
      started: true,
      url
    };
  }
}
