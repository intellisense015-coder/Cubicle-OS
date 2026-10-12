// TITLE: FLOOR PLAN STATS
export function getFloorPlanStats(spaces) {
  return {
    occupied: spaces.filter((space) => space.status === "occupied").length,
    available: spaces.filter((space) => space.status === "available").length,
    due: spaces.filter((space) => space.status === "due").length
  };
}

// TITLE: FLOOR PLAN UPDATE
export function updateFloorSpace(spaces, nextSpace) {
  return spaces.map((space) => space.id === nextSpace.id ? nextSpace : space);
}
