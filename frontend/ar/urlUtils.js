export function getAppBaseUrl(locationRef = window.location) {
  return new URL(".", locationRef.href);
}

export function resolveAppUrl(url, locationRef = window.location) {
  if (typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  const hasProtocol = /^([a-z]+:)?\/\//i.test(trimmed);
  if (hasProtocol) {
    return trimmed;
  }

  const baseUrl = getAppBaseUrl(locationRef);
  if (trimmed.startsWith("/")) {
    return new URL(trimmed.slice(1), baseUrl).toString();
  }

  return new URL(trimmed, baseUrl).toString();
}
