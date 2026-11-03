"use client";

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { queryKeys } from "@/lib/query-keys";
import { isSupabaseLeadsEnabled, getSupabaseBrowserClient } from "@/lib/supabase/client";

const REFRESH_DEBOUNCE_MS = 250;

/**
 * Owns the OS-wide data Realtime subscription. Pages invalidate shared queries;
 * they do not create one WebSocket subscription each.
 */
export function OsRealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSupabaseLeadsEnabled()) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let refreshTimer: number | null = null;
    const pendingQueryKeys = new Set<readonly string[]>();
    const supabase = getSupabaseBrowserClient();

    const scheduleRefresh = (queryKey: readonly string[]) => {
      pendingQueryKeys.add(queryKey);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        const keysToRefresh = [...pendingQueryKeys];
        pendingQueryKeys.clear();
        keysToRefresh.forEach((queryKey) => {
          void queryClient.invalidateQueries({ queryKey, refetchType: "active" });
        });
      }, REFRESH_DEBOUNCE_MS);
    };

    const subscribe = (session: unknown) => {
      if (cancelled || !session || channel) return;
      channel = supabase
        .channel("os-leads-cache")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "leads" },
            () => scheduleRefresh(queryKeys.leads.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "visits" },
            () => scheduleRefresh(queryKeys.visits.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "workspaces" },
            () => scheduleRefresh(queryKeys.workspaces.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "members" },
            () => scheduleRefresh(queryKeys.members.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "companies" },
            () => scheduleRefresh(queryKeys.companies.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "admin_users" },
            () => {
              scheduleRefresh(queryKeys.employees.all);
              scheduleRefresh(queryKeys.permissions.all);
              scheduleRefresh(queryKeys.adminRole.all);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "admin_roles" },
            () => {
              scheduleRefresh(queryKeys.employees.roles);
              scheduleRefresh(queryKeys.permissions.all);
              scheduleRefresh(queryKeys.adminRole.all);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "admin_permissions" },
            () => scheduleRefresh(queryKeys.permissions.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "admin_role_permissions" },
            () => scheduleRefresh(queryKeys.permissions.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "admin_user_permission_overrides" },
            () => scheduleRefresh(queryKeys.permissions.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "admin_role_permission_overrides" },
            () => scheduleRefresh(queryKeys.permissions.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "invoices" },
            () => scheduleRefresh(queryKeys.invoices.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "invoice_payments" },
            () => scheduleRefresh(queryKeys.invoices.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "proposals" },
            () => scheduleRefresh(queryKeys.proposals.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "quotations" },
            () => scheduleRefresh(queryKeys.quotations.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "quotation_items" },
            () => scheduleRefresh(queryKeys.quotations.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "os_company_profile" },
            () => scheduleRefresh(queryKeys.companyProfile.all),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "maintenance_categories" },
            () => scheduleRefresh(queryKeys.maintenance.categories),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "maintenance_records" },
            () => {
              scheduleRefresh(queryKeys.maintenance.records);
              scheduleRefresh(queryKeys.workspaces.all);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "maintenance_events" },
            () => scheduleRefresh(queryKeys.maintenance.events),
        )
        .subscribe();
    };

    const stopChannel = () => {
      if (!channel) return;
      const currentChannel = channel;
      channel = null;
      void supabase.removeChannel(currentChannel);
    };

    const { data: authState } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) subscribe(session);
      else stopChannel();
    });

    void supabase.auth.getSession().then(({ data }) => subscribe(data.session));

    return () => {
      cancelled = true;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      pendingQueryKeys.clear();
      authState.subscription.unsubscribe();
      stopChannel();
    };
  }, [queryClient]);

  return children;
}
