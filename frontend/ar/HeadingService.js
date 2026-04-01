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
  }

  getHeadingRad() {
    return Number.isFinite(this.headingRad) ? this.headingRad : null;
  }

  dispose() {
    if (!this.window || typeof this.window.removeEventListener !== "function") {
      return;
    }

    this.window.removeEventListener("deviceorientationabsolute", this.handleOrientation);
    this.window.removeEventListener("deviceorientation", this.handleOrientation);
  }
}
