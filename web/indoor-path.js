function project(point, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return { at: [a[0] + t * dx, a[1] + t * dy], t };
}

function length(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function nearestOnPath(point, path) {
  let best = null, offset = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const hit = project(point, path[i], path[i + 1]);
    const distance = length(point, hit.at);
    if (!best || distance < best.distance) best = { ...hit, distance, index: i, offset: offset + length(path[i], hit.at) };
    offset += length(path[i], path[i + 1]);
  }
  return best;
}

function along(path, from, to) {
  const forward = from.offset <= to.offset;
  const a = forward ? from : to, b = forward ? to : from;
  const points = [a.at, ...path.slice(a.index + 1, b.index + 1), b.at];
  return forward ? points : points.reverse();
}

export function routeThroughAisle(start, target, aisle, entrance) {
  if (!target || !entrance || !Array.isArray(aisle) || aisle.length < 2) return [];
  const origin = start || entrance;
  const from = nearestOnPath(origin, aisle);
  const to = nearestOnPath(target, aisle);
  return [origin, ...along(aisle, from, to), target];
}
