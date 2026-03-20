function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function buildCandidateKeys(selectedTee) {
  const raw = normalizeText(selectedTee);
  if (!raw) return [];
  const keys = new Set([raw]);
  if (raw.includes('blue')) keys.add('blue');
  if (raw.includes('white')) keys.add('white');
  if (raw.includes('red')) keys.add('red');
  if (raw.includes('black')) keys.add('black');
  if (raw.includes('gold')) keys.add('gold');
  if (raw.includes('yellow')) keys.add('yellow');
  return [...keys];
}

export function extractTeeCoordinates(holeData) {
  const pois = Array.isArray(holeData?.pois) ? holeData.pois : [];
  const teePois = pois.filter((poi) => {
    const poiName = normalizeText(poi?.POI || poi?.name || '');
    const poiType = normalizeText(poi?.type || poi?.poi_type || '');
    return poiType === 'tee' || poiName.includes('tee');
  });

  if (!teePois.length) return null;

  const teeCoords = {};
  teePois.forEach((poi) => {
    const lat = Number(poi?.Latitude ?? poi?.lat);
    const lng = Number(poi?.Longitude ?? poi?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const keys = [
      normalizeText(poi?.teeColor),
      normalizeText(poi?.name),
    ].filter(Boolean);

    keys.forEach((key) => {
      teeCoords[key] = { lat, lng };
    });
  });

  return Object.keys(teeCoords).length ? teeCoords : null;
}

export function getSelectedTeeCoordinates(holeData, selectedTee) {
  const teeCoords = extractTeeCoordinates(holeData);
  if (!teeCoords || !selectedTee) return null;

  const candidateKeys = buildCandidateKeys(selectedTee);
  for (const key of candidateKeys) {
    if (teeCoords[key]) return teeCoords[key];
  }

  return null;
}
