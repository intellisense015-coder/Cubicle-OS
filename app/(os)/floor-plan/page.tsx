"use client";

import { DoorOpen, Filter, Grid2X2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FloorPlanViewer } from "@/features/floor-plan/floor-plan-viewer";
import { floor4 } from "@/features/floor-plan/floor-4";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageShell } from "@/components/ui/page-shell";
import { applyWorkspaceRecordsToFloor, getWorkspaceRecords, workspaceRecordsToAreaData } from "@/lib/workspace-records";

export default function FloorPlanPage() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);

  useEffect(() => {
    setWorkspaces(getWorkspaceRecords());
  }, []);

  const floor = useMemo(() => applyWorkspaceRecordsToFloor(workspaces), [workspaces]);
  const data = useMemo(() => workspaceRecordsToAreaData(workspaces), [workspaces]);
  const rentableAreas = floor.areas.filter((area) => area.kind === "office" || area.kind === "seat" || area.kind === "cabin");
  const occupied = data.filter((row) => row.occupancy === "occupied").length;
  const available = data.filter((row) => row.occupancy === "available").length;
  const paymentDue = data.filter((row) => row.paymentStatus === "overdue" || row.paymentStatus === "grace" || row.paymentStatus === "due-soon").length;
  const occupancyPercentage = rentableAreas.length ? Math.round((occupied / rentableAreas.length) * 100) : 0;

  return (
    <PageShell>
      <div className="module-content floor-plan-page">
        <div className="module-header">
          <div>
            <h1>Floor Plan</h1>
            <p className="muted-copy">Explore the configured workspace areas and their current status.</p>
          </div>
          <Button variant="soft" onClick={() => setFiltersOpen(true)}>
            <Filter size={14} />
            Filters
          </Button>
        </div>

        <section className="stat-grid module-stats floor-plan-kpi-grid">
          <KpiCard icon={<Grid2X2 size={18} />} label="Space occupancy" value={`${occupancyPercentage}%`} detail={`${occupied} of ${rentableAreas.length} mapped spaces occupied`} />
          <KpiCard icon={<DoorOpen size={18} />} label="Available spaces" value={available} detail="Ready for assignment" />
          <KpiCard icon={<UserRound size={18} />} label="Payment due" value={paymentDue} detail="Needs attention" />
        </section>

        <FloorPlanViewer floor={floor} data={data} demo filtersOpen={filtersOpen} onFiltersOpenChange={setFiltersOpen} />
      </div>
    </PageShell>
  );
}
