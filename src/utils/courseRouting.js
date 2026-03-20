function normalizeHoleNumber(hole, index) {
  const value = Number(hole?.hole ?? hole?.number);
  return Number.isFinite(value) ? value : index + 1;
}

function getRouteNineName(holes) {
  return holes
    .map((hole) => String(hole?.nineName || '').trim())
    .find(Boolean);
}

function buildNineLabel(holes) {
  if (!holes.length) return '9 holes';
  const start = normalizeHoleNumber(holes[0], 0);
  const end = normalizeHoleNumber(holes[holes.length - 1], holes.length - 1);
  const nineName = getRouteNineName(holes);
  return `${nineName ? `${nineName} • ` : ''}9 holes: ${start}-${end}`;
}

function buildEighteenLabel(firstNine, secondNine) {
  const start = normalizeHoleNumber(firstNine[0], 0);
  const end = normalizeHoleNumber(secondNine[secondNine.length - 1], secondNine.length - 1);
  const firstName = getRouteNineName(firstNine);
  const secondName = getRouteNineName(secondNine);
  const prefix = firstName && secondName ? `${firstName} + ${secondName} • ` : '';
  return `${prefix}18 holes: ${start}-${end}`;
}

export function buildRoutingOptionsFromHoles(holes) {
  const sourceHoles = Array.isArray(holes) ? holes : [];
  if (sourceHoles.length <= 18) return [];

  const nines = [];
  for (let index = 0; index < sourceHoles.length; index += 9) {
    const segment = sourceHoles.slice(index, index + 9);
    if (segment.length !== 9) continue;
    nines.push(segment);
  }

  if (nines.length < 2) return [];

  const routes = [];

  nines.forEach((nine, index) => {
    routes.push({
      id: `nine-${index + 1}`,
      label: buildNineLabel(nine),
      holeNumbers: nine.map((hole, holeIndex) => normalizeHoleNumber(hole, holeIndex)),
      holeCount: 9,
    });
  });

  for (let i = 0; i < nines.length; i += 1) {
    for (let j = i + 1; j < nines.length; j += 1) {
      routes.push({
        id: `pair-${i + 1}-${j + 1}`,
        label: buildEighteenLabel(nines[i], nines[j]),
        holeNumbers: [
          ...nines[i].map((hole, holeIndex) => normalizeHoleNumber(hole, holeIndex)),
          ...nines[j].map((hole, holeIndex) => normalizeHoleNumber(hole, holeIndex)),
        ],
        holeCount: 18,
      });
    }
  }

  return routes;
}

export function getDefaultRoutingOption(routeOptions) {
  const options = Array.isArray(routeOptions) ? routeOptions : [];
  return options.find((option) => option?.holeCount === 18) || options[0] || null;
}

export function filterHolesByRoute(holes, routeHoleNumbers) {
  const sourceHoles = Array.isArray(holes) ? holes : [];
  const routeNumbers = Array.isArray(routeHoleNumbers) ? routeHoleNumbers : [];
  if (!routeNumbers.length) return sourceHoles;

  const holeMap = new Map(
    sourceHoles.map((hole, index) => [normalizeHoleNumber(hole, index), hole])
  );

  return routeNumbers
    .map((holeNumber) => holeMap.get(Number(holeNumber)))
    .filter(Boolean);
}

