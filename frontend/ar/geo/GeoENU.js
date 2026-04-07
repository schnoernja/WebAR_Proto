import * as THREE from "three";

const METERS_PER_DEGREE = 111320;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function toNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeWgs84Coord(coord) {
  if (!coord) {
    return null;
  }

  const lat = toNumber(coord.lat ?? coord.latitude, Number.NaN);
  const lon = toNumber(coord.lon ?? coord.longitude, Number.NaN);
  const h = toNumber(coord.h ?? coord.altitude ?? coord.height, 0);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon, h };
}

export function wgs84ToEnu(targetCoord, originCoord) {
  const origin = normalizeWgs84Coord(originCoord);
  const target = normalizeWgs84Coord(targetCoord);
  if (!origin || !target) {
    return null;
  }

  const deltaLat = target.lat - origin.lat;
  const deltaLon = target.lon - origin.lon;
  const north = deltaLat * METERS_PER_DEGREE;
  const east = deltaLon * Math.cos(THREE.MathUtils.degToRad(origin.lat)) * METERS_PER_DEGREE;
  const up = target.h - origin.h;

  return { e: east, n: north, u: up };
}

export function enuToVector3(enu) {
  if (!enu) {
    return null;
  }

  return new THREE.Vector3(toNumber(enu.e), toNumber(enu.u), toNumber(enu.n));
}

export function wgs84ToEnuVector3(targetCoord, originCoord) {
  return enuToVector3(wgs84ToEnu(targetCoord, originCoord));
}

export function rotateEnuVectorByYaw(vector, yawDeg) {
  if (!vector) {
    return null;
  }

  return vector.clone().applyAxisAngle(WORLD_UP, THREE.MathUtils.degToRad(toNumber(yawDeg)));
}
