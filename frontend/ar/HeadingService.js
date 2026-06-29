function normalizeDegrees(value) {
  let normalizedValue = value % 360;
  if (normalizedValue < 0) {
    normalizedValue += 360;
  }

  return normalizedValue;
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
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

  const supportsAbsoluteHeading =
    event.type === "deviceorientationabsolute" ||
    event.absolute === true;

  if (!supportsAbsoluteHeading) {
    return null;
  }

  return normalizeDegrees(360 - event.alpha);
}

export class HeadingService {
  constructor(windowRef = window) {
    this.window = windowRef;
    this.headingRad = null;
    this.pendingHeadingResolvers = [];
    this.handleOrientation = this.handleOrientation.bind(this);

    if (this.window && typeof this.window.addEventListener === "function") {
      this.window.addEventListener("deviceorientationabsolute", this.handleOrientation);
      this.window.addEventListener("deviceorientation", this.handleOrientation);
    }
  }

  handleOrientation(event) {
    const headingDegrees = extractHeadingDegrees(event);
    if (!Number.isFinite(headingDegrees)) {
      return;
    }

    this.headingRad = degreesToRadians(headingDegrees);
    if (this.pendingHeadingResolvers.length > 0) {
      const resolvers = this.pendingHeadingResolvers.splice(0, this.pendingHeadingResolvers.length);
      for (const resolve of resolvers) {
        resolve(this.headingRad);
      }
    }
  }

  getHeadingRad() {
    return Number.isFinite(this.headingRad) ? this.headingRad : null;
  }

  async requestPermission() {
    const deviceOrientationEvent = this.window ? this.window.DeviceOrientationEvent : null;
    if (!deviceOrientationEvent || typeof deviceOrientationEvent.requestPermission !== "function") {
      return true;
    }

    const permissionState = await deviceOrientationEvent.requestPermission();
    return permissionState === "granted";
  }

  waitForHeading(timeoutMs = 0) {
    const headingRad = this.getHeadingRad();
    if (Number.isFinite(headingRad)) {
      return Promise.resolve(headingRad);
    }

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const resolver = (value) => {
        cleanup();
        resolve(value);
      };
      const timerHost =
        this.window && typeof this.window.setTimeout === "function"
          ? this.window
          : typeof globalThis !== "undefined"
            ? globalThis
            : null;
      const cleanup = () => {
        clearTimeout(timeoutId);
        const index = this.pendingHeadingResolvers.indexOf(resolver);
        if (index >= 0) {
          this.pendingHeadingResolvers.splice(index, 1);
        }
      };
      const timeoutId = timerHost
        ? timerHost.setTimeout(() => {
            cleanup();
            resolve(this.getHeadingRad());
          }, timeoutMs)
        : null;

      if (!timerHost) {
        cleanup();
        resolve(this.getHeadingRad());
        return;
      }

      this.pendingHeadingResolvers.push(resolver);
    });
  }

  dispose() {
    if (this.pendingHeadingResolvers.length > 0) {
      const resolvers = this.pendingHeadingResolvers.splice(0, this.pendingHeadingResolvers.length);
      for (const resolve of resolvers) {
        resolve(this.getHeadingRad());
      }
    }

    if (!this.window || typeof this.window.removeEventListener !== "function") {
      return;
    }

    this.window.removeEventListener("deviceorientationabsolute", this.handleOrientation);
    this.window.removeEventListener("deviceorientation", this.handleOrientation);
  }
}
