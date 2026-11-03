"use client";

import { DoorOpen, Filter, Grid2X2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FloorPlanViewer } from "@/features/floor-plan/floor-plan-viewer";
import { floor4 } from "@/features/floor-plan/floor-4";
import { KpiCard } from "@/components/ui/kpi-card";

import { getDemoValue } from "@/lib/demo-session";
import { applyWorkspaceRecordsToFloor, mergeWorkspaceRecords, workspaceRecordsToAreaData } from "@/lib/workspace-records";
import { useToast } from "@/components/ui/toast-provider";
import { queryKeys } from "@/lib/query-keys";
import { fetchWorkspacesSnapshot } from "@/lib/workspace-query";
import { fetchMembersSnapshot } from "@/lib/member-query";

export default function FloorPlanPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces.all,
    queryFn: fetchWorkspacesSnapshot,
  });
  const membersQuery = useQuery({
    queryKey: queryKeys.members.all,
    queryFn: fetchMembersSnapshot,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    const handleDemoChange = (event) => {
      if (event.detail?.key === "members") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.members.all, refetchType: "active" });
        void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all, refetchType: "active" });
      }
      if (["maintenance", "maintenanceRecords", "maintenanceEvents"].includes(event.detail?.key || "")) {
        const saved = getDemoValue("workspaces");
        const nextWorkspaces = mergeWorkspaceRecords(Array.isArray(saved) ? saved : []);
        setWorkspaces(nextWorkspaces);
        queryClient.setQueryData(queryKeys.workspaces.all, (current: any) => ({
          ...(current || { dataSource: "demo", errorMessage: "" }),
          workspaces: nextWorkspaces,
        }));
      }
    };
    window.addEventListener("cubicle-demo-change", handleDemoChange);
    return () => window.removeEventListener("cubicle-demo-change", handleDemoChange);
  }, [queryClient]);

  useEffect(() => {
    if (workspacesQuery.data) setWorkspaces(workspacesQuery.data.workspaces);
    if (workspacesQuery.data?.errorMessage) {
      showToast({ variant: "error", title: "Floor plan could not be refreshed", message: workspacesQuery.data.errorMessage });
    }
  }, [showToast, workspacesQuery.data]);

  useEffect(() => {
    if (membersQuery.data) setMembers(membersQuery.data.members);
    if (membersQuery.data?.errorMessage) {
      showToast({ variant: "error", title: "Floor plan members could not be refreshed", message: membersQuery.data.errorMessage });
    }
  }, [membersQuery.data, showToast]);

  const floor = useMemo(() => applyWorkspaceRecordsToFloor(workspaces), [workspaces]);
  const data = useMemo(() => workspaceRecordsToAreaData(workspaces, members), [workspaces, members]);
  const rentableAreas = floor.areas.filter((area) => area.kind === "office" || area.kind === "seat" || area.kind === "cabin");
  const occupied = data.filter((row) => row.occupancy === "occupied").length;
  const available = data.filter((row) => row.occupancy === "available").length;
  const paymentDue = data.filter((row) => row.paymentStatus === "overdue" || row.paymentStatus === "grace" || row.paymentStatus === "due-soon").length;
  const occupancyPercentage = rentableAreas.length ? Math.round((occupied / rentableAreas.length) * 100) : 0;

  return (
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
  );
}
