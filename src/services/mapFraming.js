import { bearingDeg } from './haversine';

const DEFAULT_NATIVE_PADDING = {
  top: 80,
  right: 90,
  bottom: 280,
  left: 90,
};

const DEFAULT_WEB_PADDING_RATIO = {
  top: 0.08,
  right: 0.1,
  bottom: 0.12,
  left: 0.1,
};

const PAR_ZOOM_BOOST = {
  4: 0.28,
  5: 0.52,
};

const PAR_NATIVE_PADDING_SCALE = {
  4: 0.9,
  5: 0.82,
};

const MIN_WORLD_SPAN = 1e-6;

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function toWorldX(lng) {
  return (lng + 180) / 360;
}

function toWorldY(lat) {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clampedLat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

function fromWorldLng(x) {
  return x * 360 - 180;
}

function fromWorldLat(y) {
  const n = Math.PI * (1 - 2 * y);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function normalizePoiName(poi) {
  return String(poi?.POI || '').trim().toLowerCase();
}

function normalizePoiLocation(poi) {
  return String(poi?.Location || '').trim().toUpperCase();
}

function isFramingPoi(poi) {
  const name = normalizePoiName(poi);
  const location = normalizePoiLocation(poi);
  if (name === 'tee back' || name === 'tee front' || name === 'tee middle') return true;
  if (name === 'green' && (location === 'F' || location === 'C' || location === 'B')) return true;
  if (name === 'dogleg') return true;
  return false;
}

function getHolePar(hole) {
  const par = Number(hole?.par);
  return Number.isFinite(par) ? par : null;
}

function getHoleZoomBoost(hole) {
  const par = getHolePar(hole);
  return par != null ? (PAR_ZOOM_BOOST[par] || 0) : 0;
}

function getNativePaddingForHole(hole, padding) {
  const par = getHolePar(hole);
  const scale = par != null ? (PAR_NATIVE_PADDING_SCALE[par] || 1) : 1;
  return {
    top: Math.max(40, Math.round(padding.top * scale)),
    right: Math.max(50, Math.round(padding.right * scale)),
    bottom: Math.max(180, Math.round(padding.bottom * scale)),
    left: Math.max(50, Math.round(padding.left * scale)),
  };
}

function getCoordFromPoi(poi) {
  if (!poi) return null;
  const lng = poi.Longitude;
  const lat = poi.Latitude;
  if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) return null;
  return [lng, lat];
}

export function getHoleKeyPois(hole) {
  return (hole?.pois || []).filter(isFramingPoi);
}

export function getHoleFramingCoords(hole, userPos = null, options = {}) {
  const { includeUser = false } = options;
  const coords = getHoleKeyPois(hole)
    .map(getCoordFromPoi)
    .filter(Boolean);

  if (includeUser && userPos && isFiniteNumber(userPos.lng) && isFiniteNumber(userPos.lat)) {
    coords.push([userPos.lng, userPos.lat]);
  }

  return coords;
}

export function getBoundsFromCoords(coords) {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  const lngs = coords.map((coord) => coord[0]);
  const lats = coords.map((coord) => coord[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lngPad = (maxLng - minLng) * 0.15;
  const latPad = (maxLat - minLat) * 0.15;
  return {
    ne: [maxLng + lngPad, maxLat + latPad],
    sw: [minLng - lngPad, minLat - latPad],
  };
}

export function getHoleBearing(hole) {
  const tee =
    (hole?.pois || []).find((poi) => normalizePoiName(poi) === 'tee back' && normalizePoiLocation(poi) === 'C') ||
    (hole?.pois || []).find((poi) => normalizePoiName(poi) === 'tee front' && normalizePoiLocation(poi) === 'C');
  const green =
    (hole?.pois || []).find((poi) => normalizePoiName(poi) === 'green' && normalizePoiLocation(poi) === 'C');

  if (!tee || !green) return 0;
  return bearingDeg(tee.Latitude, tee.Longitude, green.Latitude, green.Longitude);
}

export function isCoordWithinBounds(coord, bounds, bufferRatio = 0.08) {
  if (!coord || !bounds) return false;
  const [lng, lat] = coord;
  const [neLng, neLat] = bounds.ne;
  const [swLng, swLat] = bounds.sw;
  const lngSpan = Math.max(neLng - swLng, MIN_WORLD_SPAN);
  const latSpan = Math.max(neLat - swLat, MIN_WORLD_SPAN);
  const lngPad = lngSpan * bufferRatio;
  const latPad = latSpan * bufferRatio;
  return (
    lng >= swLng + lngPad &&
    lng <= neLng - lngPad &&
    lat >= swLat + latPad &&
    lat <= neLat - latPad
  );
}

export function getNativeHoleCameraConfig(hole, userPos = null, options = {}) {
  const { includeUser = false, padding = DEFAULT_NATIVE_PADDING } = options;
  const coords = getHoleFramingCoords(hole, userPos, { includeUser });
  const bounds = getBoundsFromCoords(coords);
  if (!bounds) return null;
  return {
    bounds,
    heading: getHoleBearing(hole),
    padding: getNativePaddingForHole(hole, padding),
    animationDuration: 600,
    animationMode: 'easeTo',
  };
}

export function getStaticMapCameraConfig(hole, imageWidth, imageHeight, options = {}) {
  const coords = getHoleFramingCoords(hole, null, { includeUser: false });
  if (!coords.length || !isFiniteNumber(imageWidth) || !isFiniteNumber(imageHeight)) return null;

  const paddingRatio = { ...DEFAULT_WEB_PADDING_RATIO, ...(options.paddingRatio || {}) };
  const left = imageWidth * paddingRatio.left;
  const right = imageWidth * paddingRatio.right;
  const top = imageHeight * paddingRatio.top;
  const bottom = imageHeight * paddingRatio.bottom;
  const availableWidth = Math.max(1, imageWidth - left - right);
  const availableHeight = Math.max(1, imageHeight - top - bottom);

  const worldPoints = coords.map(([lng, lat]) => ({ x: toWorldX(lng), y: toWorldY(lat) }));
  const minX = Math.min(...worldPoints.map((point) => point.x));
  const maxX = Math.max(...worldPoints.map((point) => point.x));
  const minY = Math.min(...worldPoints.map((point) => point.y));
  const maxY = Math.max(...worldPoints.map((point) => point.y));
  const spanX = Math.max(maxX - minX, MIN_WORLD_SPAN);
  const spanY = Math.max(maxY - minY, MIN_WORLD_SPAN);
  const expandedSpanX = spanX * (imageWidth / availableWidth);
  const expandedSpanY = spanY * (imageHeight / availableHeight);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const zoomX = Math.log2(1 / expandedSpanX);
  const zoomY = Math.log2(1 / expandedSpanY);
  const zoom = Math.max(13.8, Math.min(19.3, Math.min(zoomX, zoomY) + getHoleZoomBoost(hole)));

  return {
    centerLng: fromWorldLng(centerX),
    centerLat: fromWorldLat(centerY),
    zoom,
    heading: getHoleBearing(hole),
    pixelWidth: Math.round(imageWidth),
    pixelHeight: Math.round(imageHeight),
  };
}
