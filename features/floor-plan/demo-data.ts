import { floor4 } from "./floor-4";
import { isRentable, type AreaLiveData } from "./types";

/** Empty demo occupancy state. Records are created through the workspace/member flows. */
export const demoAreaData: AreaLiveData[] = floor4.areas.filter(isRentable).map(area => ({
  areaId: area.id,
  occupancy: "available",
}));
