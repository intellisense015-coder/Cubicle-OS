"use client";

import { DoorOpen, Filter, Grid2X2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FloorPlanViewer } from "@/features/floor-plan/floor-plan-viewer";
import { floor4 } from "@/features/floor-plan/floor-4";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageShell } from "@/components/ui/page-shell";
import { getDemoValue } from "@/lib/demo-session";
import { applyWorkspaceRecordsToFloor, getWorkspaceRecords, mergeWorkspaceRecords, workspaceRecordsToAreaData } from "@/lib/workspace-records";
import { useToast } from "@/components/ui/toast-provider";
import { fetchSupabaseMembers, mapSupabaseMemberToOsMember } from "@/lib/supabase/members";
import { fetchSupabaseWorkspaces, mapSupabaseWorkspaceToOsWorkspace } from "@/lib/supabase/workspaces";

export default function FloorPlanPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const loadBackendData = async () => {
      try {
        const [workspaceRows, memberRows] = await Promise.all([fetchSupabaseWorkspaces(), fetchSupabaseMembers()]);
        if (!cancelled) {
          setWorkspaces(mergeWorkspaceRecords(workspaceRows.map(mapSupabaseWorkspaceToOsWorkspace)));
          setMembers(memberRows.map(mapSupabaseMemberToOsMember));
        }
      } catch (error) {
        if (!cancelled) {
          setWorkspaces([]);
          setMembers([]);
          showToast({ variant: "error", title: "Floor plan could not be loaded", message: error?.message || "Supabase did not return the floor-plan data." });
        }
      }
    };
    void loadBackendData();
    const handleDemoChange = (event) => {
      if (["workspaces", "members"].includes(event.detail?.key || "")) {
        void loadBackendData();
      }
      if (["maintenance", "maintenanceRecords", "maintenanceEvents"].includes(event.detail?.key || "")) {
        const saved = getDemoValue("workspaces");
        setWorkspaces(mergeWorkspaceRecords(Array.isArray(saved) ? saved : []));
      }
      if (event.detail?.key === "maintenanceCategories") setWorkspaces((current) => [...current]);
    };
    window.addEventListener("cubicle-demo-change", handleDemoChange);
    return () => { cancelled = true; window.removeEventListener("cubicle-demo-change", handleDemoChange); };
  }, [showToast]);

  const floor = useMemo(() => applyWorkspaceRecordsToFloor(workspaces), [workspaces]);
  const data = useMemo(() => workspaceRecordsToAreaData(workspaces, members), [workspaces, members]);
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

          <FloorPlanViewer floor={floor} data={data} demo filtersOpen={filtersOpen} onFiltersOpenChange={setFiltersOpen} onMaintenanceAction={(workspaceId) => router.push(`/workspaces?workspaceId=${encodeURIComponent(workspaceId)}`)} />
      </div>
    </PageShell>
  );
}
