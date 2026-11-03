"use client";

import { DoorOpen, Filter, Grid2X2 } from "lucide-react";
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
import { assignSupabaseMemberToWorkspace } from "@/lib/supabase/workspaces";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { isActiveMember } from "@/lib/member-lifecycle";
import { saveDemoValue } from "@/lib/demo-session";

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
  const [assigningAreaId, setAssigningAreaId] = useState(null);

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
  const occupancyPercentage = rentableAreas.length ? Math.round((occupied / rentableAreas.length) * 100) : 0;

  async function assignEmployee(areaId, memberId) {
    const employee = members.find((member) => member.id === memberId);
    const area = floor.areas.find((item) => item.id === areaId);
    if (!employee || !area || !isActiveMember(employee)) {
      showToast({ variant: "error", title: "Workspace was not assigned", message: "Select an active employee from the list." });
      return;
    }
    setAssigningAreaId(areaId);
    try {
      if (isSupabaseLeadsEnabled()) await assignSupabaseMemberToWorkspace(memberId, areaId);
      const previousMemberId = workspaces.find((workspace) => (workspace.areaId || workspace.id) === areaId)?.memberId || "";
      const nextWorkspaces = workspaces.map((workspace) => {
        const workspaceId = workspace.areaId || workspace.id;
        if (workspaceId === areaId) return { ...workspace, memberId, occupant: employee.member || employee.name || "Assigned", company: employee.company || "Unassigned", status: "occupied", membershipStatus: employee.membershipStatus || "Active", noticeStartDate: employee.noticeStartDate || "", expectedLeavingDate: employee.expectedLeavingDate || "", noticeNotes: employee.noticeNotes || "" };
        if (workspace.memberId === memberId) return { ...workspace, memberId: "", occupant: "Available", company: "Unassigned", status: "available", membershipStatus: "Active", noticeStartDate: "", expectedLeavingDate: "", noticeNotes: "" };
        return workspace;
      });
      const nextMembers = members.map((member) => {
        if (member.id === memberId) return { ...member, spaceId: areaId, space: area.name };
        if (member.id === previousMemberId || member.spaceId === areaId) return { ...member, spaceId: "", space: "Unassigned" };
        return member;
      });
      setWorkspaces(nextWorkspaces);
      setMembers(nextMembers);
      saveDemoValue("workspaces", nextWorkspaces, { notify: false });
      saveDemoValue("members", nextMembers, { notify: false });
      queryClient.setQueryData(queryKeys.workspaces.all, (current: any) => ({ ...(current || { dataSource: "demo", errorMessage: "" }), workspaces: nextWorkspaces, errorMessage: "" }));
      queryClient.setQueryData(queryKeys.members.all, (current: any) => ({ ...(current || { dataSource: "demo", errorMessage: "" }), members: nextMembers, errorMessage: "" }));
      showToast({ variant: "success", title: "Workspace assigned", message: `${employee.member || employee.name} was assigned to ${area.name}.` });
    } catch (error) {
      showToast({ variant: "error", title: "Workspace was not assigned", message: error?.message || "The workspace assignment could not be completed." });
    } finally {
      setAssigningAreaId(null);
    }
  }

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
        </section>

          <FloorPlanViewer floor={floor} data={data} members={members} assigningAreaId={assigningAreaId} onAssignMember={assignEmployee} demo filtersOpen={filtersOpen} onFiltersOpenChange={setFiltersOpen} onMaintenanceAction={(workspaceId) => router.push(`/workspaces?workspaceId=${encodeURIComponent(workspaceId)}`)} />
      </div>
  );
}
