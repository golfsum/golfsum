import { haversineYards } from './haversine';

function toPoint(poi, kind = 'poi') {
  if (!poi || !Number.isFinite(poi.Latitude) || !Number.isFinite(poi.Longitude)) return null;
  return { lat: poi.Latitude, lng: poi.Longitude, kind };
}

function projectMeters(origin, point) {
  const latScale = 111_320;
  const lngScale = Math.cos((origin.lat * Math.PI) / 180) * 111_320;
  return {
    x: (point.lng - origin.lng) * lngScale,
    y: (point.lat - origin.lat) * latScale,
  };
}

function unprojectMeters(origin, point) {
  const latScale = 111_320;
  const lngScale = Math.cos((origin.lat * Math.PI) / 180) * 111_320;
  return {
    lat: origin.lat + (point.y / latScale),
    lng: origin.lng + (point.x / lngScale),
  };
}

function interpolatePoint(start, end, ratio) {
  return {
    lat: start.lat + ((end.lat - start.lat) * ratio),
    lng: start.lng + ((end.lng - start.lng) * ratio),
  };
}

function midpoint(a, b) {
  return {
    lat: (a.lat + b.lat) / 2,
    lng: (a.lng + b.lng) / 2,
  };
}

function getPolylineSegments(points) {
  const segments = [];
  let totalYards = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const yards = haversineYards(start.lat, start.lng, end.lat, end.lng);
    if (!Number.isFinite(yards) || yards <= 0) continue;
    segments.push({ start, end, yards, startYards: totalYards, endYards: totalYards + yards });
    totalYards += yards;
  }
  return { segments, totalYards };
}

function interpolateAlongPolylineFromGreen(points, yardsFromGreen) {
  if (!Array.isArray(points) || points.length < 2 || !Number.isFinite(yardsFromGreen) || yardsFromGreen <= 0) return null;
  const reversed = [...points].reverse();
  const { segments, totalYards } = getPolylineSegments(reversed);
  if (!segments.length || yardsFromGreen >= totalYards) return null;

  let remaining = yardsFromGreen;
  for (const segment of segments) {
    if (remaining <= segment.yards) {
      const ratio = remaining / segment.yards;
      return interpolatePoint(segment.start, segment.end, ratio);
    }
    remaining -= segment.yards;
  }
  return null;
}

function isRouteWaypointReasonable(tee, green, point) {
  const a = { x: 0, y: 0 };
  const b = projectMeters(tee, green);
  const p = projectMeters(tee, point);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = (abx * abx) + (aby * aby);
  if (ab2 === 0) return false;
  const t = ((apx * abx) + (apy * aby)) / ab2;
  const proj = { x: a.x + (abx * t), y: a.y + (aby * t) };
  const dx = p.x - proj.x;
  const dy = p.y - proj.y;
  const corridorDistance = Math.sqrt((dx * dx) + (dy * dy));
  return t >= 0.12 && t <= 0.95 && corridorDistance <= 45;
}

function getFairwayMarkerGroups(hole) {
  const grouped = new Map();
  (hole?.pois || []).forEach((poi) => {
    const match = String(poi?.POI || '').match(/(\d{2,3})\s*marker/i);
    const yds = match ? Number(match[1]) : NaN;
    if (!Number.isFinite(yds) || !Number.isFinite(poi?.Latitude) || !Number.isFinite(poi?.Longitude)) return;
    const key = String(yds);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(poi);
  });

  return [...grouped.entries()]
    .map(([key, pois]) => {
      const yds = Number(key);
      const leftPoi = pois.find((poi) => String(poi?.SideOfFairway || '').toUpperCase() === 'L');
      const rightPoi = pois.find((poi) => String(poi?.SideOfFairway || '').toUpperCase() === 'R');
      const centerPoi = pois.find((poi) => String(poi?.SideOfFairway || '').toUpperCase() === 'C');
      const midpoint = leftPoi && rightPoi
        ? {
            lat: (leftPoi.Latitude + rightPoi.Latitude) / 2,
            lng: (leftPoi.Longitude + rightPoi.Longitude) / 2,
          }
        : null;

      if (centerPoi || leftPoi || rightPoi || midpoint) {
        return {
          yds,
          left: leftPoi ? { lat: leftPoi.Latitude, lng: leftPoi.Longitude } : null,
          right: rightPoi ? { lat: rightPoi.Latitude, lng: rightPoi.Longitude } : null,
          center: centerPoi
            ? { lat: centerPoi.Latitude, lng: centerPoi.Longitude }
            : midpoint,
        };
      }

      return {
        yds,
        left: null,
        right: null,
        center: {
          lat: pois.reduce((sum, poi) => sum + poi.Latitude, 0) / pois.length,
          lng: pois.reduce((sum, poi) => sum + poi.Longitude, 0) / pois.length,
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.yds - a.yds);
}

function getCenteredMarkerGroups(hole) {
  return getFairwayMarkerGroups(hole)
    .map((group) => {
      if (!group?.center) return null;
      return {
        yds: group.yds,
        lat: group.center.lat,
        lng: group.center.lng,
        kind: 'center-marker',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.yds - a.yds);
}

function getAimPointFromMarkerGroup(group, aimBias) {
  if (!group) return null;
  const center = group.center || (group.left && group.right ? interpolatePoint(group.left, group.right, 0.5) : null);
  if (!center || !aimBias || aimBias === 'center') return center;

  if (aimBias === 'left-center') {
    if (group.left) return interpolatePoint(center, group.left, 0.55);
    if (group.right) return interpolatePoint(center, group.right, 0.25);
    return center;
  }

  if (aimBias === 'right-center') {
    if (group.right) return interpolatePoint(center, group.right, 0.55);
    if (group.left) return interpolatePoint(center, group.left, 0.25);
    return center;
  }

  return center;
}

function getFairwayMarkerAimPoint(hole, yardsToGreen, aimBias) {
  if (!Number.isFinite(yardsToGreen)) return null;
  const markerGroup = getFairwayMarkerGroups(hole)
    .filter((group) => group?.center)
    .sort((a, b) => Math.abs(a.yds - yardsToGreen) - Math.abs(b.yds - yardsToGreen))[0];

  if (!markerGroup) return null;
  if (Math.abs(markerGroup.yds - yardsToGreen) > 35) return null;
  return getAimPointFromMarkerGroup(markerGroup, aimBias);
}

function getDisplayPointForLayup(hole, routePoints, point, yardsToGreen, aimBias) {
  const markerAimPoint = getFairwayMarkerAimPoint(hole, yardsToGreen, aimBias);
  if (markerAimPoint) {
    const markerProjection = projectPointOntoRoute(markerAimPoint, routePoints);
    if (markerProjection && markerProjection.distance <= 28) {
      return markerAimPoint;
    }
  }

  const routeProjection = projectPointOntoRoute(point, routePoints);
  return applyAimBiasToPoint(routeProjection, aimBias) || point;
}

function getHazardDisplayPoint(cluster, routePoints, totalRouteYards) {
  const projections = cluster.points
    .map(({ point, poi }) => ({
      point,
      poi,
      projection: projectPointOntoRoute(point, routePoints),
    }))
    .filter((entry) => entry.projection)
    .sort((a, b) => a.projection.alongYards - b.projection.alongYards);

  if (!projections.length) {
    return { point: cluster.center, side: null, yardsToGreen: null };
  }

  const sides = cluster.points
    .map(({ poi }) => normalizeFairwaySide(poi?.SideOfFairway || poi?.Location))
    .filter(Boolean);
  const leftCount = sides.filter((value) => value === 'left').length;
  const rightCount = sides.filter((value) => value === 'right').length;
  const side = leftCount === rightCount ? null : (leftCount > rightCount ? 'left' : 'right');
  const centerProjection = projections[Math.floor(projections.length / 2)];
  const yardsToGreen = Number.isFinite(totalRouteYards)
    ? Math.max(0, Math.round(totalRouteYards - centerProjection.projection.alongYards))
    : null;

  if (cluster.poiName === 'Green Bunker' && projections.length >= 2) {
    if (side === 'left') {
      return { point: midpoint(projections[0].point, centerProjection.point), side, yardsToGreen };
    }
    if (side === 'right') {
      return { point: midpoint(projections[projections.length - 1].point, centerProjection.point), side, yardsToGreen };
    }
  }

  return { point: centerProjection.point, side, yardsToGreen };
}

function getHazardLabel(cluster, side, yardsToGreen) {
  if (cluster.poiName === 'Water') return 'Water';
  if (cluster.poiName === 'Fairway Bunker') {
    if (side === 'left') return 'Left FW Bkr';
    if (side === 'right') return 'Right FW Bkr';
    return 'FW Bkr';
  }
  if (cluster.poiName === 'Green Bunker') {
    if (Number.isFinite(yardsToGreen) && yardsToGreen <= 18) return 'Front Green Bkr';
    if (side === 'left') return 'Left Green Bkr';
    if (side === 'right') return 'Right Green Bkr';
    return 'Green Bkr';
  }
  return cluster.poiName;
}

function getHazardPriority(kind, yardsToGreen) {
  if (kind === 'water') return 0;
  if (kind === 'fairway-bunker') return 1;
  if (kind === 'green-bunker') {
    return Number.isFinite(yardsToGreen) && yardsToGreen <= 25 ? 3 : 2;
  }
  return 4;
}

function getAimBiasOrder(preferredMissSide, firstLandingHazard) {
  const baseBias = getAimBiasFromHazardSide(firstLandingHazard?.side || null);
  if (!preferredMissSide || firstLandingHazard?.side !== preferredMissSide) return [baseBias];
  return baseBias === 'center' ? ['center'] : [baseBias, 'center'];
}

function getLikelyTeeShotYards(options = {}) {
  const likely = Number(options.likelyTeeShotYards);
  if (Number.isFinite(likely) && likely > 80) return likely;
  const max = Number(options.maxTeeShotYards);
  if (Number.isFinite(max) && max > 0) return Math.round(max * 0.88);
  return null;
}

function getLikelyAdvanceYards(options = {}) {
  const likely = Number(options.likelyAdvanceYards);
  if (Number.isFinite(likely) && likely > 80) return likely;
  const max = Number(options.maxTeeShotYards);
  if (Number.isFinite(max) && max > 0) return Math.max(150, Math.round(max * 0.8));
  return null;
}

function getReachWindow(yards, likelyYards, maxYards) {
  if (!Number.isFinite(yards)) return 'unknown';
  if (Number.isFinite(likelyYards) && yards <= likelyYards + 8) return 'likely';
  if (Number.isFinite(maxYards) && yards <= maxYards + 12) return 'stretch';
  return 'unreachable';
}

function chooseLayupTargetCandidate(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const modePriority = {
    safety: 0,
    'second-layup': 1,
    preferred: 2,
    go: 3,
    'tee-ball': 4,
  };
  const existingPriority = modePriority[existing.mode] ?? 99;
  const incomingPriority = modePriority[incoming.mode] ?? 99;
  if (incomingPriority !== existingPriority) {
    return incomingPriority < existingPriority ? incoming : existing;
  }
  return (incoming.teeYards || 0) < (existing.teeYards || 0) ? incoming : existing;
}

function buildLayupTarget(hole, routePoints, totalRouteYards, yardsToGreen, mode, adjustedForHazard, aimBias) {
  if (!Number.isFinite(yardsToGreen) || yardsToGreen <= 30 || yardsToGreen >= totalRouteYards - 20) return null;
  const point = interpolateAlongPolylineFromGreen(routePoints, yardsToGreen);
  if (!point) return null;
  const displayPoint = getDisplayPointForLayup(hole, routePoints, point, yardsToGreen, aimBias);
  return makeLayupTarget(
    displayPoint,
    Math.max(0, Math.round(totalRouteYards - yardsToGreen)),
    Math.round(yardsToGreen),
    mode,
    adjustedForHazard,
    aimBias
  );
}

function finalizeLayupTargets(targets, options = {}) {
  const {
    maxTeeShotYards = null,
    likelyTeeShotYards = null,
    tournamentMode = false,
  } = options;

  const distinctTargets = [];
  targets.filter(Boolean).forEach((target) => {
    const duplicateIndex = distinctTargets.findIndex((existing) => !areLayupTargetsDistinct(existing, target));
    if (duplicateIndex === -1) {
      distinctTargets.push(target);
      return;
    }
    distinctTargets[duplicateIndex] = chooseLayupTargetCandidate(distinctTargets[duplicateIndex], target);
  });

  let filteredTargets = distinctTargets.filter((target) => {
    if (target.mode === 'safety' || target.mode === 'second-layup') return true;
    return getReachWindow(target.teeYards, likelyTeeShotYards, maxTeeShotYards) !== 'unreachable';
  });

  filteredTargets = filteredTargets.map((target) => ({
    ...target,
    reachWindow: getReachWindow(target.teeYards, likelyTeeShotYards, maxTeeShotYards),
  }));

  filteredTargets.sort((a, b) => {
    const modePriority = {
      safety: 0,
      'second-layup': 1,
      preferred: 2,
      go: 3,
      'tee-ball': 4,
    };
    const modeDelta = (modePriority[a.mode] ?? 99) - (modePriority[b.mode] ?? 99);
    if (modeDelta !== 0) return modeDelta;
    return (a.teeYards || 0) - (b.teeYards || 0);
  });

  if (tournamentMode) {
    const saferTargets = filteredTargets.filter((target) => target.mode === 'safety' || target.mode === 'second-layup' || target.mode === 'tee-ball');
    return saferTargets.slice(0, 1);
  }

  return filteredTargets.slice(0, 3);
}

function dedupeWaypoints(points) {
  const deduped = [];
  points.forEach((point) => {
    const last = deduped[deduped.length - 1];
    if (!last) {
      deduped.push(point);
      return;
    }
    const closeInYards = haversineYards(last.lat, last.lng, point.lat, point.lng);
    if (closeInYards <= 8) return;
    deduped.push(point);
  });
  return deduped;
}

function estimateCarryPadding(poiName) {
  if (poiName === 'Fairway Bunker') return 16;
  if (poiName === 'Green Bunker') return 10;
  if (poiName === 'Water') return 14;
  return 12;
}

function getHazardColor(poiName) {
  return poiName === 'Water' ? '#60A5FA' : '#FBBF24';
}

function getLayupBufferBeforeHazard(poiName) {
  if (poiName === 'Water') return 18;
  if (poiName === 'Fairway Bunker') return 14;
  if (poiName === 'Green Bunker') return 10;
  return 12;
}

function normalizeFairwaySide(value) {
  const side = String(value || '').trim().toUpperCase();
  if (side === 'L' || side === 'LEFT') return 'left';
  if (side === 'R' || side === 'RIGHT') return 'right';
  return null;
}

function getAimBiasFromHazardSide(side) {
  if (side === 'left') return 'right-center';
  if (side === 'right') return 'left-center';
  return 'center';
}

function clusterPois(pois) {
  const clusters = [];
  pois.forEach((poi) => {
    const point = toPoint(poi);
    if (!point) return;
    const cluster = clusters.find((entry) => (
      entry.poiName === poi.POI &&
      haversineYards(entry.center.lat, entry.center.lng, point.lat, point.lng) <= 28
    ));
    if (cluster) {
      cluster.points.push({ poi, point });
      cluster.center = {
        lat: cluster.points.reduce((sum, entry) => sum + entry.point.lat, 0) / cluster.points.length,
        lng: cluster.points.reduce((sum, entry) => sum + entry.point.lng, 0) / cluster.points.length,
      };
      return;
    }
    clusters.push({
      poiName: poi.POI,
      points: [{ poi, point }],
      center: { lat: point.lat, lng: point.lng },
    });
  });
  return clusters;
}

function projectPointOntoRoute(point, routePoints) {
  if (!point || !Array.isArray(routePoints) || routePoints.length < 2) return null;
  const { segments } = getPolylineSegments(routePoints);
  let best = null;

  segments.forEach((segment) => {
    const a = { lat: segment.start.lat, lng: segment.start.lng };
    const b = { lat: segment.end.lat, lng: segment.end.lng };
    const ab = projectMeters(a, b);
    const ap = projectMeters(a, point);
    const ab2 = (ab.x * ab.x) + (ab.y * ab.y);
    if (ab2 === 0) return;
    const t = Math.max(0, Math.min(1, ((ap.x * ab.x) + (ap.y * ab.y)) / ab2));
    const projected = interpolatePoint(segment.start, segment.end, t);
    const distance = haversineYards(point.lat, point.lng, projected.lat, projected.lng);
    const alongYards = segment.startYards + (segment.yards * t);
    if (!best || distance < best.distance) {
      best = { distance, alongYards, point: projected, segment, t };
    }
  });

  return best;
}

function applyAimBiasToPoint(routeProjection, aimBias) {
  if (!routeProjection || !routeProjection.segment || !aimBias || aimBias === 'center') {
    return routeProjection?.point || null;
  }
  const side = aimBias.startsWith('left') ? 'left' : aimBias.startsWith('right') ? 'right' : null;
  if (!side) return routeProjection.point;

  const offsetYards = aimBias.includes('center') ? 10 : 14;
  const offsetMeters = offsetYards * 0.9144;
  const origin = { lat: routeProjection.segment.start.lat, lng: routeProjection.segment.start.lng };
  const startMeters = { x: 0, y: 0 };
  const endMeters = projectMeters(origin, routeProjection.segment.end);
  const projectedMeters = projectMeters(origin, routeProjection.point);
  const dx = endMeters.x - startMeters.x;
  const dy = endMeters.y - startMeters.y;
  const length = Math.sqrt((dx * dx) + (dy * dy));
  if (!Number.isFinite(length) || length <= 0) return routeProjection.point;

  const normal = side === 'left'
    ? { x: -dy / length, y: dx / length }
    : { x: dy / length, y: -dx / length };

  return unprojectMeters(origin, {
    x: projectedMeters.x + (normal.x * offsetMeters),
    y: projectedMeters.y + (normal.y * offsetMeters),
  });
}

function parseBandMidpoint(label) {
  const match = String(label || '').match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return Math.round((min + max) / 2);
}

export function getPreferredLeaveYards({ holeSuggestion, bestDistanceBand }) {
  if (Number.isFinite(holeSuggestion?.bestLeaveMin) && Number.isFinite(holeSuggestion?.bestLeaveMax)) {
    return Math.round((holeSuggestion.bestLeaveMin + holeSuggestion.bestLeaveMax) / 2);
  }
  const fromBand = parseBandMidpoint(bestDistanceBand?.label);
  if (Number.isFinite(fromBand)) return fromBand;
  return null;
}

function makeLayupTarget(point, teeYards, yardsToGreen, mode, adjustedForHazard, aimBias = 'center') {
  const baseTag = mode === 'safety'
    ? 'SAFE'
    : mode === 'tee-ball'
      ? 'TEE BALL'
      : mode === 'second-layup'
        ? 'SECOND LAYUP'
        : mode === 'go'
          ? 'GO'
          : 'BEST LEAVE';
  const tag = aimBias && aimBias !== 'center' ? `${baseTag} ${aimBias.toUpperCase()}` : baseTag;
  return {
    id: `layup-${mode}`,
    lat: point.lat,
    lng: point.lng,
    teeYards,
    yardsToGreen,
    tag,
    label: `${teeYards}y | ${yardsToGreen} in`,
    color: '#34D399',
    adjustedForHazard,
    mode,
    aimBias,
  };
}

function areLayupTargetsDistinct(a, b) {
  if (!a || !b) return false;
  return Math.abs((a.teeYards || 0) - (b.teeYards || 0)) >= 18;
}

export function buildHoleStrategyModel(hole, teePoi, greenPoi, preferredLeaveYards = null, options = {}) {
  if (!hole || !teePoi || !greenPoi) {
    return {
      routePoints: [],
      routeLabels: [],
      yardageMarkers: [],
      layupTarget: null,
      layupTargets: [],
      strategyLinePoints: [],
      totalRouteYards: 0,
    };
  }

  const tee = toPoint(teePoi, 'tee');
  const green = toPoint(greenPoi, 'green');
  if (!tee || !green) {
    return {
      routePoints: [],
      routeLabels: [],
      yardageMarkers: [],
      layupTarget: null,
      layupTargets: [],
      strategyLinePoints: [],
      totalRouteYards: 0,
    };
  }

  const centerMarkers = getCenteredMarkerGroups(hole)
    .filter((point) => isRouteWaypointReasonable(tee, green, point))
    .map((point) => ({ ...point, yardsToGreen: point.yds }));

  const doglegs = (hole.pois || [])
    .filter((poi) => poi?.POI === 'Dogleg' && Number.isFinite(poi?.Latitude) && Number.isFinite(poi?.Longitude))
    .map((poi) => ({
      lat: poi.Latitude,
      lng: poi.Longitude,
      kind: 'dogleg',
      yardsToGreen: Math.round(haversineYards(poi.Latitude, poi.Longitude, green.lat, green.lng)),
    }))
    .filter((point) => isRouteWaypointReasonable(tee, green, point));

  const routeWaypoints = dedupeWaypoints(
    [...centerMarkers, ...doglegs].sort((a, b) => b.yardsToGreen - a.yardsToGreen)
  );
  const routePoints = [{ ...tee }, ...routeWaypoints, { ...green }];
  const { totalYards: totalRouteYards } = getPolylineSegments(routePoints);
  const routeHazards = clusterPois(
    (hole.pois || []).filter((poi) => (
      poi?.POI === 'Fairway Bunker' || poi?.POI === 'Green Bunker' || poi?.POI === 'Water'
    ))
  ).map((cluster, index) => {
    const projections = cluster.points
      .map(({ point }) => ({ point, projection: projectPointOntoRoute(point, routePoints) }))
      .filter((entry) => entry.projection)
      .sort((a, b) => a.projection.alongYards - b.projection.alongYards);
    if (!projections.length) return null;
    return {
      id: `${cluster.poiName}-${index}`,
      poiName: cluster.poiName,
      frontFromTee: projections[0].projection.alongYards,
      carryFromTee: projections[projections.length - 1].projection.alongYards,
      side: (() => {
        const sides = cluster.points
          .map(({ poi }) => normalizeFairwaySide(poi?.SideOfFairway || poi?.Location))
          .filter(Boolean);
        if (!sides.length) return null;
        const leftCount = sides.filter((value) => value === 'left').length;
        const rightCount = sides.filter((value) => value === 'right').length;
        if (leftCount === rightCount) return null;
        return leftCount > rightCount ? 'left' : 'right';
      })(),
    };
  }).filter(Boolean);

  const colorMap = { 100: '#F87171', 150: '#FFFFFF', 250: '#60A5FA' };
  const yardageMarkers = hole.par === 3
    ? []
    : [250, 150, 100]
        .map((yds) => {
          const point = interpolateAlongPolylineFromGreen(routePoints, yds);
          if (!point) return null;
          return {
            id: `marker-${yds}`,
            yds,
            color: colorMap[yds] || '#E5E7EB',
            lat: point.lat,
            lng: point.lng,
            synthetic: true,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.yds - a.yds);

  const routeLabels = routeWaypoints
    .filter((point) => point.kind === 'dogleg')
    .map((point, index) => ({
      id: `route-${index}`,
      lat: point.lat,
      lng: point.lng,
      yardsToGreen: point.yardsToGreen,
    }));

  const maxTeeShotYards = Number.isFinite(options.maxTeeShotYards) ? Number(options.maxTeeShotYards) : null;
  const likelyTeeShotYards = getLikelyTeeShotYards(options);
  const likelyAdvanceYards = getLikelyAdvanceYards(options);
  const tournamentMode = Boolean(options.tournamentMode);
  const preferredMissSide = options.preferredMissSide === 'left' || options.preferredMissSide === 'right'
    ? options.preferredMissSide
    : null;

  let layupTarget = null;
  let firstLandingHazard = null;
  let layupTargets = [];
  if (hole.par >= 4) {
    const landingHazards = routeHazards
      .filter((hazard) => hazard.poiName === 'Fairway Bunker' || hazard.poiName === 'Water')
      .sort((a, b) => a.frontFromTee - b.frontFromTee);
    firstLandingHazard = landingHazards[0] || null;

    const aimBiases = getAimBiasOrder(preferredMissSide, firstLandingHazard);
    const preferredFromGreen = Number.isFinite(preferredLeaveYards) && preferredLeaveYards > 30 && preferredLeaveYards < totalRouteYards - 40
      ? Math.round(preferredLeaveYards)
      : null;

    if (firstLandingHazard) {
      const safeFromTee = Math.max(80, Math.round(firstLandingHazard.frontFromTee - getLayupBufferBeforeHazard(firstLandingHazard.poiName)));
      const safeFromGreen = Math.round(totalRouteYards - safeFromTee);
      aimBiases.forEach((aimBias) => {
        const safetyTarget = buildLayupTarget(hole, routePoints, totalRouteYards, safeFromGreen, 'safety', true, aimBias);
        if (safetyTarget) layupTargets.push(safetyTarget);
      });
    }

    if (preferredFromGreen) {
      const preferredFromTee = totalRouteYards - preferredFromGreen;
      const preferredHazard = landingHazards.find((hazard) => (
        hazard.frontFromTee - 6 <= preferredFromTee && preferredFromTee <= hazard.carryFromTee + 8
      ));
      const preferredTarget = buildLayupTarget(
        hole,
        routePoints,
        totalRouteYards,
        preferredFromGreen,
        'preferred',
        Boolean(preferredHazard),
        aimBiases[0] || 'center'
      );
      if (preferredTarget) layupTargets.push(preferredTarget);
    }

    if (hole.par === 5 && landingHazards.length > 1) {
      const secondLandingHazard = landingHazards[1];
      const secondLayupFromTee = Math.max(110, Math.round(secondLandingHazard.frontFromTee - getLayupBufferBeforeHazard(secondLandingHazard.poiName)));
      const secondLayupFromGreen = Math.round(totalRouteYards - secondLayupFromTee);
      const secondLayupTarget = buildLayupTarget(
        hole,
        routePoints,
        totalRouteYards,
        secondLayupFromGreen,
        'second-layup',
        true,
        aimBiases[0] || 'center'
      );
      if (secondLayupTarget) layupTargets.push(secondLayupTarget);
    }

    if (hole.par === 5 && landingHazards.length) {
      const goHazard = [...landingHazards].reverse()[0];
      const goCarryFromTee = Math.round(goHazard.carryFromTee + getLayupBufferBeforeHazard(goHazard.poiName));
      const goFromGreen = Math.round(totalRouteYards - goCarryFromTee);
      if (getReachWindow(goCarryFromTee, likelyTeeShotYards, maxTeeShotYards) !== 'unreachable') {
        const goTarget = buildLayupTarget(hole, routePoints, totalRouteYards, goFromGreen, 'go', true, 'center');
        if (goTarget) layupTargets.push(goTarget);
      }
    }

    if (!layupTargets.length && likelyTeeShotYards && totalRouteYards > likelyTeeShotYards + 35) {
      const teeBallFromTee = Math.max(80, Math.round(likelyTeeShotYards - 8));
      const teeBallFromGreen = Math.round(totalRouteYards - teeBallFromTee);
      const teeBallTarget = buildLayupTarget(hole, routePoints, totalRouteYards, teeBallFromGreen, 'tee-ball', false, 'center');
      if (teeBallTarget) layupTargets.push(teeBallTarget);
    }
  }

  layupTargets = finalizeLayupTargets(layupTargets, {
    maxTeeShotYards,
    likelyTeeShotYards,
    tournamentMode,
  });

  if (!layupTargets.length && hole.par >= 4 && maxTeeShotYards !== null && totalRouteYards > maxTeeShotYards + 35) {
    const safeReachFromTee = Math.max(70, Math.round(maxTeeShotYards - 8));
    const safeReachFromGreen = Math.round(totalRouteYards - safeReachFromTee);
    const reachPoint = interpolateAlongPolylineFromGreen(routePoints, safeReachFromGreen);
    if (reachPoint) {
      const projectedReachPoint = projectPointOntoRoute(reachPoint, routePoints);
      const displayReachPoint = applyAimBiasToPoint(projectedReachPoint, 'center') || reachPoint;
      layupTargets = [
        makeLayupTarget(displayReachPoint, safeReachFromTee, safeReachFromGreen, 'tee-ball', false),
      ];
    }
  }

  layupTargets = layupTargets.map((target, index) => ({
    ...target,
    stackIndex: index,
    labelOffsetY: index * -10,
    nextShotYards: hole.par === 5 && likelyAdvanceYards && target.mode !== 'go'
      ? Math.max(0, Math.round(target.yardsToGreen - likelyAdvanceYards))
      : target.nextShotYards ?? null,
  }));

  layupTarget = layupTargets[0] || null;
  const lineTargets = [];
  if (layupTarget) lineTargets.push(layupTarget);
  layupTargets
    .filter((target) => target.mode === 'second-layup')
    .forEach((target) => {
      if (!lineTargets.find((existing) => existing.id === target.id)) lineTargets.push(target);
    });

  return {
    routePoints,
    routeLabels,
    yardageMarkers,
    layupTarget,
    layupTargets,
    strategyLinePoints: lineTargets.length
      ? [tee, ...lineTargets.map((target) => ({ lat: target.lat, lng: target.lng })), green]
      : routePoints,
    totalRouteYards,
    routeHazards,
  };
}

export function buildHazardCarryModel({
  hole,
  userPos,
  weather,
  shotBearingDeg,
  elevationYards = 0,
  centerYards = null,
  routePoints = [],
}) {
  if (!hole || !userPos) return [];
  const hazardPois = (hole.pois || []).filter((poi) => (
    poi?.POI === 'Fairway Bunker' || poi?.POI === 'Green Bunker' || poi?.POI === 'Water'
  ));
  const clusters = clusterPois(hazardPois);
  if (!clusters.length) return [];
  const { totalYards: totalRouteYards } = getPolylineSegments(routePoints);
  const userProjection = projectPointOntoRoute(userPos, routePoints);

  const windTempAdjustment = (yards) => {
    const tempAdj = Number.isFinite(weather?.tempF) ? Math.round((70 - weather.tempF) * 0.35) : 0;
    let windAdj = 0;
    if (Number.isFinite(weather?.windMph) && Number.isFinite(weather?.windDegrees) && Number.isFinite(shotBearingDeg)) {
      const raw = Math.abs((((weather.windDegrees - shotBearingDeg) % 360) + 360) % 360);
      const windToShot = Math.min(raw, 360 - raw);
      if (windToShot <= 45) windAdj = Math.round(weather.windMph * 0.6);
      else if (windToShot >= 135) windAdj = Math.round(weather.windMph * -0.45);
      else windAdj = Math.round(weather.windMph * 0.1);
    }
    const elevAdj = Number.isFinite(elevationYards) && Number.isFinite(centerYards) && centerYards > 0
      ? Math.round(elevationYards * (yards / centerYards))
      : 0;
    return Math.round(yards + tempAdj + windAdj + elevAdj);
  };

  const hazards = clusters.map((cluster, index) => {
    const projections = cluster.points
      .map(({ point }) => ({
        point,
        projection: projectPointOntoRoute(point, routePoints),
      }))
      .filter((entry) => entry.projection);

    const sortedByRoute = projections.sort((a, b) => a.projection.alongYards - b.projection.alongYards);
    const frontEntry = sortedByRoute[0] || projections[0] || cluster.points[0];
    const carryEntry = sortedByRoute[sortedByRoute.length - 1] || projections[0] || cluster.points[0];
    const frontPoint = frontEntry.point || frontEntry;
    const carryPoint = carryEntry.point || carryEntry;

    let front = haversineYards(userPos.lat, userPos.lng, frontPoint.lat, frontPoint.lng);
    let carry = haversineYards(userPos.lat, userPos.lng, carryPoint.lat, carryPoint.lng);
    if (!sortedByRoute.length || carry <= front) {
      carry = front + estimateCarryPadding(cluster.poiName);
    }

    const display = getHazardDisplayPoint(cluster, routePoints, totalRouteYards);
    const kind = cluster.poiName === 'Water'
      ? 'water'
      : cluster.poiName === 'Green Bunker'
        ? 'green-bunker'
        : 'fairway-bunker';

    return {
      id: `${cluster.poiName}-${index}`,
      kind,
      label: getHazardLabel(cluster, display.side, display.yardsToGreen),
      lat: display.point.lat,
      lng: display.point.lng,
      actual: Math.max(1, Math.round(front)),
      front: Math.max(1, Math.round(front)),
      carry: Math.max(1, Math.round(carry)),
      frontFromTee: sortedByRoute[0]?.projection?.alongYards ?? null,
      carryFromTee: sortedByRoute[sortedByRoute.length - 1]?.projection?.alongYards ?? null,
      frontAdj: windTempAdjustment(front),
      carryAdj: windTempAdjustment(carry),
      color: getHazardColor(cluster.poiName),
      side: display.side,
      yardsToGreen: display.yardsToGreen,
    };
  });

  const upcoming = hazards
    .filter((hazard) => {
      if (!userProjection || !Number.isFinite(hazard.carryFromTee)) return true;
      return hazard.carryFromTee >= (userProjection.alongYards - 8);
    })
    .sort((a, b) => {
      const frontDelta = (a.front || 0) - (b.front || 0);
      if (Math.abs(frontDelta) > 10) return frontDelta;
      return getHazardPriority(a.kind, a.yardsToGreen) - getHazardPriority(b.kind, b.yardsToGreen);
    });

  const deduped = [];
  upcoming.forEach((hazard) => {
    const duplicate = deduped.find((existing) => (
      existing.kind === hazard.kind &&
      existing.side === hazard.side &&
      Math.abs((existing.front || 0) - (hazard.front || 0)) <= 14
    ));
    if (!duplicate) {
      deduped.push(hazard);
      return;
    }

    const existingPriority = getHazardPriority(duplicate.kind, duplicate.yardsToGreen);
    const nextPriority = getHazardPriority(hazard.kind, hazard.yardsToGreen);
    if (nextPriority > existingPriority) return;
    if ((hazard.carry - hazard.front) > (duplicate.carry - duplicate.front)) {
      const replaceIndex = deduped.findIndex((entry) => entry.id === duplicate.id);
      if (replaceIndex >= 0) deduped[replaceIndex] = hazard;
    }
  });

  return deduped.slice(0, 4);
}
