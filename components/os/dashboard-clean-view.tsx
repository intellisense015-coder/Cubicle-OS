"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays, CreditCard, Grid2X2, ListChecks, Receipt, Users } from "lucide-react";
import { DataTable } from "@/components/ui/table";
import { useTheme } from "@/components/theme-provider";
import { sileo } from "sileo";

const DashboardChart = dynamic(() => import("@/components/os/dashboard-charts").then((module) => module.DashboardChart), {
  ssr: false,
  loading: () => <div className="dashboard-chart-frame dashboard-chart-loading" aria-hidden="true" />,
});

function useDashboardCount(target: number, duration = 1800) {
  const safeTarget = Number.isFinite(target) ? Math.max(0, target) : 0;
  const [value, setValue] = useState(0);

  useEffect(() => {
    let animationFrame = 0;
    const startedAt = performance.now();

    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setValue(safeTarget * easedProgress);

      if (progress < 1) animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [duration, safeTarget]);

  return value;
}

type DashboardCleanViewProps = {
  dashboardMetrics: any;
  occupancyPercentage: number;
  paymentDueAmount: number;
  paymentRows: any[];
  paymentColumns: any[];
  sortedFollowUpRows: any[];
  sortedVisitRows: any[];
  currentTime: number;
  pendingApprovals: number;
  formatDashboardAmount: (value: unknown) => string;
  formatDashboardCompactAmount: (value: unknown) => string;
  formatDashboardFollowUpAge: (value: unknown, now: number) => string;
  formatDashboardVisitTime: (value: unknown) => string;
  getPaymentRowClick: () => void;
};

export function DashboardCleanView({
  dashboardMetrics,
  occupancyPercentage,
  paymentDueAmount,
  paymentRows,
  paymentColumns,
  sortedFollowUpRows,
  sortedVisitRows,
  currentTime,
  pendingApprovals,
  formatDashboardAmount,
  formatDashboardCompactAmount,
  formatDashboardFollowUpAge,
  formatDashboardVisitTime,
  getPaymentRowClick,
}: DashboardCleanViewProps) {
  const { theme } = useTheme();
  const availableSeats = dashboardMetrics.privateAvailable + dashboardMetrics.sharedAvailable;
  const availablePercentage = dashboardMetrics.totalSeats ? Math.round((availableSeats / dashboardMetrics.totalSeats) * 100) : 0;
  const occupancyStatus = occupancyPercentage >= 70 ? "good" : occupancyPercentage >= 35 ? "warning" : "danger";
  const availableStatus = availablePercentage <= 30 ? "good" : availablePercentage <= 65 ? "warning" : "danger";
  const occupancyTone = `is-${occupancyStatus}`;
  const availableTone = `is-${availableStatus}`;
  const animatedOccupancyPercentage = useDashboardCount(occupancyPercentage);
  const animatedAvailablePercentage = useDashboardCount(availablePercentage, 2100);
  const animatedTotalMrr = useDashboardCount(Number(dashboardMetrics.totalMrr), 2300);
  const animatedOpportunityLoss = useDashboardCount(Number(dashboardMetrics.opportunityLoss), 2500);
  const animatedPrivateOccupied = useDashboardCount(Number(dashboardMetrics.privateOccupied), 1500);
  const animatedSharedOccupied = useDashboardCount(Number(dashboardMetrics.sharedOccupied), 1600);
  const animatedTotalSeats = useDashboardCount(Number(dashboardMetrics.totalSeats), 1800);
  const animatedPrivateSeats = useDashboardCount(Number(dashboardMetrics.privateSeats), 1700);
  const animatedSharedSeats = useDashboardCount(Number(dashboardMetrics.sharedSeats), 1800);
  const animatedAvailableSeats = useDashboardCount(Number(availableSeats), 1900);
  const animatedPrivateMrr = useDashboardCount(Number(dashboardMetrics.privateMrr), 2000);
  const animatedSharedMrr = useDashboardCount(Number(dashboardMetrics.sharedMrr), 2100);
  const animatedPrivateAveragePrice = useDashboardCount(Number(dashboardMetrics.privateAveragePrice), 2200);
  const animatedSharedAveragePrice = useDashboardCount(Number(dashboardMetrics.sharedAveragePrice), 2300);

  const showSileoToastDemo = () => {
    sileo.success({
      title: "Dashboard toast preview",
      description: "This is the new Sileo toast style used throughout the app.",
      duration: 5000,
      position: "top-right",
      fill: theme === "dark" ? "#ffffff" : "#1e1e1e",
      roundness: 28,
      autopilot: { expand: 0, collapse: 5000 },
    });
  };

  return <>
    <style jsx global>{`
      .dashboard-clean-content { display: block !important; width: 100% !important; max-width: none !important; }
      .dashboard-clean-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin: 0 0 18px; }
      .dashboard-clean-heading-actions { display: flex; align-items: center; gap: 12px; }
      .dashboard-clean-toast-demo { display: inline-flex; align-items: center; gap: 5px; min-height: 32px; border: 1px solid var(--line); border-radius: 999px; padding: 0 12px; color: var(--ink); background: var(--paper); font-size: 10px; font-weight: 600; cursor: pointer; }
      .dashboard-clean-toast-demo:hover { color: var(--brand); border-color: var(--brand); }
      @keyframes dashboard-fade-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes dashboard-text-rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
      .dashboard-clean-heading { animation: dashboard-fade-up 800ms cubic-bezier(.16,1,.3,1) both; }
      .dashboard-clean-kpi, .dashboard-clean-primary-grid > .dashboard-clean-panel, .dashboard-clean-secondary-grid > .dashboard-clean-panel { animation: dashboard-fade-up 900ms cubic-bezier(.16,1,.3,1) both; animation-delay: var(--dashboard-delay, 0ms); }
      .dashboard-clean-kpi-title, .dashboard-clean-kpi-context { animation: dashboard-text-rise 700ms cubic-bezier(.16,1,.3,1) both; animation-delay: calc(var(--dashboard-delay, 0ms) + 160ms); }
      .dashboard-clean-kpi-value-row > strong { animation: dashboard-text-rise 900ms cubic-bezier(.16,1,.3,1) both; animation-delay: calc(var(--dashboard-delay, 0ms) + 220ms); }
      .dashboard-clean-kpi:nth-child(1) { --dashboard-delay: 90ms; }
      .dashboard-clean-kpi:nth-child(2) { --dashboard-delay: 180ms; }
      .dashboard-clean-kpi:nth-child(3) { --dashboard-delay: 270ms; }
      .dashboard-clean-kpi:nth-child(4) { --dashboard-delay: 360ms; }
      .dashboard-clean-primary-grid > .dashboard-clean-panel:nth-child(1) { --dashboard-delay: 520ms; }
      .dashboard-clean-primary-grid > .dashboard-clean-panel:nth-child(2) { --dashboard-delay: 640ms; }
      .dashboard-clean-primary-grid > .dashboard-clean-panel:nth-child(3) { --dashboard-delay: 760ms; }
      .dashboard-clean-secondary-grid > .dashboard-clean-panel { --dashboard-delay: 900ms; }
      .dashboard-clean-heading h1 { margin: 3px 0 0; color: var(--ink); font-size: 28px; font-weight: 500; letter-spacing: -.035em; }
      .dashboard-clean-heading p { margin: 5px 0 0; color: var(--muted); font-size: 12px; }
      .dashboard-clean-manage-link, .dashboard-clean-small-link { display: inline-flex; align-items: center; gap: 5px; color: var(--brand); font-size: 11px; font-weight: 700; }
      .dashboard-clean-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 13px; margin-bottom: 17px; }
      .dashboard-clean-kpi, .dashboard-clean-panel, .dashboard-clean-payment-panel { min-width: 0; border: 1px solid var(--line); border-radius: 35px; background: var(--paper); box-shadow: 0 12px 28px color-mix(in srgb, var(--ink) 5%, transparent); }
      .dashboard-clean-kpi { display: flex; flex-direction: column; min-height: 112px; padding: 20px; }
      .dashboard-clean-kpi-heading { display: flex; align-items: center; gap: 10px; }
      .dashboard-clean-kpi-icon { display: grid; place-items: center; width: 34px; height: 34px; flex: none; border: 1px solid color-mix(in srgb, var(--line) 65%, transparent); border-radius: 50%; color: var(--ink); background: var(--surface-soft); }
      .dashboard-clean-kpi-title { color: var(--ink); font-size: 13px; font-weight: 500; letter-spacing: -.015em; }
      .dashboard-clean-kpi-value-row { display: flex; align-items: baseline; gap: 9px; margin-top: 18px; }
      .dashboard-clean-kpi-value-row > strong { display: block; color: var(--ink); font-size: 25px; font-weight: 500; letter-spacing: -.04em; }
      .dashboard-clean-kpi-value-row.is-good > strong { color: #079b69; }
      .dashboard-clean-kpi-value-row.is-warning > strong { color: #c47b12; }
      .dashboard-clean-kpi-value-row.is-danger > strong { color: #c83b45; }
      .dashboard-clean-kpi-context { display: block; overflow: hidden; color: var(--ink); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      .dashboard-clean-kpi-context::before { content: "•"; margin-right: 6px; color: var(--ink); }
      .dashboard-clean-panel-heading p { display: block; color: var(--muted); font-size: 11px; }
      .dashboard-clean-kpi-alert { background: var(--paper); border-color: var(--line); }
      .dashboard-clean-kpi-alert .dashboard-clean-kpi-value-row > strong { color: #b9323d; }
      .dashboard-chart-frame { width: 100%; position: relative; overflow: hidden; }
      .dashboard-chart-mini { width: calc(100% + 16px); height: 92px; margin: 16px -8px -8px; padding: 8px; border-radius: 30px; background: #171b22; }
      .dashboard-chart-dark { background: #171b22; }
      .dashboard-chart-turquoise { background: linear-gradient(135deg, #46cfca, #a1eee5); }
      .dashboard-chart-blue { background: linear-gradient(135deg, #315fe9, #4387ff); }
      .dashboard-chart-red { background: linear-gradient(135deg, #f5d0d6, #ffe9eb); }
      .dashboard-segmented-capacity { display: flex; align-items: center; justify-content: center; height: 70px; margin: 8px -8px -8px; padding: 8px 18px; border-radius: 24px; }
      .dashboard-chart-segmented { background: #f5faf8; }
      .dashboard-chart-segmented-good { background: color-mix(in srgb, #079b69 8%, var(--paper)); }
      .dashboard-chart-segmented-warning { background: color-mix(in srgb, #c47b12 8%, var(--paper)); }
      .dashboard-chart-segmented-danger { background: color-mix(in srgb, #c83b45 8%, var(--paper)); }
      .dashboard-segmented-capacity-bars { display: flex; align-items: center; gap: 5px; width: 100%; height: 34px; }
      @keyframes dashboard-segment-grow { from { opacity: .2; transform: scaleX(0); } to { opacity: 1; transform: scaleX(1); } }
      .dashboard-segmented-capacity-segment { display: block; flex: 1 1 0; min-width: 0; height: 30px; border-radius: 4px; background: #dce2e1; transform-origin: left center; animation: dashboard-segment-grow 3200ms cubic-bezier(.16,1,.3,1) both; animation-delay: var(--dashboard-segment-delay, 0ms); }
      .dashboard-chart-segmented-good .dashboard-segmented-capacity-segment.is-filled { background: #19bc67; }
      .dashboard-chart-segmented-warning .dashboard-segmented-capacity-segment.is-filled { background: #d9871e; }
      .dashboard-chart-segmented-danger .dashboard-segmented-capacity-segment.is-filled { background: #c83b45; }
      .dashboard-chart-loading { width: calc(100% + 16px); height: 92px; margin: 16px -8px -8px; border-radius: 30px; background: var(--surface-soft); }
      .dashboard-chart-tooltip { display: grid; gap: 2px; min-width: 88px; padding: 7px 9px; border: 0; border-radius: 12px; color: #fff; background: #171b22; box-shadow: 0 8px 18px rgba(20, 28, 40, .18); font-size: 10px; }
      .dashboard-chart-tooltip strong { font-weight: 600; }
      .dashboard-chart-tooltip span { color: #b7c0ca; }
      .dashboard-clean-donut-wrap { position: relative; width: 142px; height: 142px; }
      .dashboard-clean-donut-wrap .dashboard-chart-frame { height: 142px; }
      .dashboard-chart-donut { padding: 0; background: transparent; }
      .dashboard-clean-donut-label { position: absolute; inset: 0; z-index: 1; display: grid; align-content: center; justify-items: center; pointer-events: none; }
      .dashboard-clean-donut-label strong { color: var(--ink); font-size: 27px; font-weight: 500; letter-spacing: -.04em; }
      .dashboard-clean-donut-label span { color: var(--muted); font-size: 10px; }
      .dashboard-chart-main, .dashboard-chart-revenue { width: calc(100% + 16px); height: 156px; margin: -2px -8px 6px; padding: 0; border-radius: 30px; background: linear-gradient(180deg, color-mix(in srgb, var(--brand) 8%, var(--paper)), transparent); }
      .dashboard-chart-revenue { height: 118px; margin-bottom: 6px; }
      .dashboard-clean-primary-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(250px, .8fr) minmax(0, .95fr); gap: 17px; margin-bottom: 17px; }
      .dashboard-clean-secondary-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 17px; margin-bottom: 17px; }
      .dashboard-clean-panel, .dashboard-clean-payment-panel { padding: 20px; }
      .dashboard-clean-panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 19px; }
      .dashboard-clean-panel-heading h2 { margin: 0; color: var(--ink); font-size: 16px; font-weight: 500; }
      .dashboard-clean-panel-heading > svg { color: var(--muted); flex: none; }
      .dashboard-clean-reference-panel { padding: 20px; }
      .dashboard-clean-reference-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 15px; }
      .dashboard-clean-reference-heading h2 { margin: 0; color: var(--ink); font-size: 16px; font-weight: 500; }
      .dashboard-clean-reference-heading p { margin: 4px 0 0; color: var(--muted); font-size: 11px; }
      .dashboard-clean-reference-link { display: inline-flex; align-items: center; gap: 4px; color: var(--ink); font-size: 10px; white-space: nowrap; }
      .dashboard-clean-dark-list { width: calc(100% + 16px); margin: 0 -8px -8px; overflow: hidden; padding: 17px; border-radius: 25px; color: #f7fbf9; background: #171b22; }
      .dashboard-clean-dark-section { display: grid; gap: 5px; }
      .dashboard-clean-dark-section + .dashboard-clean-dark-section { margin-top: 18px; }
      .dashboard-clean-dark-section-label { color: #b7c0ca; font-size: 10px; }
      .dashboard-clean-dark-total { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
      .dashboard-clean-dark-total strong { color: #fff; font-size: 15px; font-weight: 500; }
      .dashboard-clean-dark-total span { color: #b7c0ca; font-size: 10px; }
      .dashboard-clean-dark-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 11px 0; border-top: 1px solid rgba(255,255,255,.08); }
      .dashboard-clean-dark-row:first-of-type { border-top: 0; }
      .dashboard-clean-dark-icon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; color: #4dd7d0; background: rgba(77,215,208,.18); }
      .dashboard-clean-dark-icon-purple { color: #a47cff; background: rgba(147,105,233,.2); }
      .dashboard-clean-dark-icon-red { color: #f26a76; background: rgba(228,81,103,.18); }
      .dashboard-clean-dark-copy { min-width: 0; }
      .dashboard-clean-dark-copy strong, .dashboard-clean-dark-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dashboard-clean-dark-copy strong { color: #f7fbf9; font-size: 11px; font-weight: 600; }
      .dashboard-clean-dark-copy small { margin-top: 3px; color: #8994a3; font-size: 9px; }
      .dashboard-clean-dark-value { color: #f7fbf9; font-size: 11px; font-weight: 600; text-align: right; white-space: nowrap; }
      .dashboard-clean-dark-value-emphasis { color: #4dd7d0; }
      .dashboard-clean-dark-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.08); }
      .dashboard-clean-dark-summary span { color: #b7c0ca; font-size: 10px; }
      .dashboard-clean-dark-summary strong { color: #4dd7d0; font-size: 13px; font-weight: 600; }
      .dashboard-clean-occupancy-center, .dashboard-clean-occupancy-summary, .dashboard-clean-reference-heading, .dashboard-clean-dark-list { animation: dashboard-text-rise 850ms cubic-bezier(.16,1,.3,1) both; animation-delay: calc(var(--dashboard-delay, 0ms) + 180ms); }
      .dashboard-clean-occupancy-stat, .dashboard-clean-dark-total, .dashboard-clean-dark-row, .dashboard-clean-dark-summary { animation: dashboard-text-rise 750ms cubic-bezier(.16,1,.3,1) both; animation-delay: calc(var(--dashboard-delay, 0ms) + 300ms); }
      @media (prefers-reduced-motion: reduce) { .dashboard-clean-heading, .dashboard-clean-kpi, .dashboard-clean-primary-grid > .dashboard-clean-panel, .dashboard-clean-secondary-grid > .dashboard-clean-panel, .dashboard-clean-kpi-title, .dashboard-clean-kpi-context, .dashboard-clean-kpi-value-row > strong, .dashboard-clean-occupancy-center, .dashboard-clean-occupancy-summary, .dashboard-clean-reference-heading, .dashboard-clean-dark-list, .dashboard-clean-occupancy-stat, .dashboard-clean-dark-total, .dashboard-clean-dark-row, .dashboard-clean-dark-summary, .dashboard-segmented-capacity-segment { animation: none !important; transform: none !important; } }
      .dashboard-clean-occupancy-panel { padding: 20px; }
      .dashboard-clean-occupancy-panel .dashboard-clean-panel-heading { margin-bottom: 4px; }
      .dashboard-clean-occupancy-panel .dashboard-clean-panel-heading p { display: none; }
      .dashboard-clean-occupancy-center { display: flex; justify-content: center; margin: 4px auto 20px; }
      .dashboard-clean-occupancy-center .dashboard-clean-donut-wrap { width: 220px; height: 220px; }
      .dashboard-clean-occupancy-center .dashboard-clean-donut-wrap .dashboard-chart-frame { height: 220px; }
      .dashboard-clean-occupancy-center .dashboard-clean-donut-label strong { font-size: 36px; }
      .dashboard-clean-occupancy-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; padding-top: 18px; border-top: 1px solid var(--line); }
      .dashboard-clean-occupancy-stat { display: grid; grid-template-columns: 5px minmax(0, 1fr); column-gap: 10px; align-items: center; }
      .dashboard-clean-occupancy-stat i { grid-row: 1 / span 2; width: 5px; height: 42px; border-radius: 99px; background: var(--brand); }
      .dashboard-clean-occupancy-stat:nth-child(2) i { background: #8060ae; }
      .dashboard-clean-occupancy-tone-good .dashboard-clean-occupancy-stat:first-child i { background: #19bc67; }
      .dashboard-clean-occupancy-tone-warning .dashboard-clean-occupancy-stat:first-child i { background: #d9871e; }
      .dashboard-clean-occupancy-tone-danger .dashboard-clean-occupancy-stat:first-child i { background: #c83b45; }
      .dashboard-clean-occupancy-stat strong { color: var(--ink); font-size: 18px; font-weight: 500; letter-spacing: -.03em; }
      .dashboard-clean-occupancy-stat span { margin-top: 3px; color: var(--muted); font-size: 10px; line-height: 1.3; }
      .dashboard-clean-occupancy-layout { display: grid; grid-template-columns: 142px minmax(0, 1fr); align-items: center; gap: 24px; }
      .dashboard-clean-donut { position: relative; display: grid; place-items: center; width: 136px; height: 136px; border-radius: 50%; }
      .dashboard-clean-donut::after { content: ""; position: absolute; inset: 20px; border-radius: 50%; background: var(--paper); }
      .dashboard-clean-donut > div { position: relative; z-index: 1; text-align: center; }
      .dashboard-clean-donut strong { display: block; color: var(--ink); font-size: 27px; font-weight: 500; letter-spacing: -.04em; }
      .dashboard-clean-donut span { color: var(--muted); font-size: 10px; }
      .dashboard-clean-legend { display: grid; gap: 11px; }
      .dashboard-clean-legend > div { display: grid; grid-template-columns: 9px minmax(0, 1fr) auto; align-items: center; gap: 8px; }
      .dashboard-clean-legend span { color: var(--muted); font-size: 11px; }
      .dashboard-clean-legend strong { color: var(--ink); font-size: 12px; font-weight: 600; }
      .dashboard-clean-dot { width: 8px; height: 8px; border-radius: 50%; }
      .dashboard-clean-dot-brand { background: var(--brand); }
      .dashboard-clean-dot-purple { background: #8060ae; }
      .dashboard-clean-dot-muted { background: var(--surface-soft); border: 1px solid var(--line); }
      .dashboard-clean-progress-list { display: grid; gap: 13px; margin-top: 22px; }
      .dashboard-clean-progress-list > div { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
      .dashboard-clean-progress-list span { color: var(--muted); font-size: 11px; }
      .dashboard-clean-progress-list strong { color: var(--ink); font-size: 11px; font-weight: 600; }
      .dashboard-clean-progress-list i { grid-column: 1 / -1; display: block; height: 7px; overflow: hidden; border-radius: 99px; background: var(--surface-soft); }
      .dashboard-clean-progress-list b { display: block; height: 100%; border-radius: inherit; background: var(--brand); }
      .dashboard-clean-progress-list > div:nth-child(2) b { background: #8060ae; }
      .dashboard-clean-stat-list { display: grid; }
      .dashboard-clean-stat-list > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 11px 0; border-top: 1px solid var(--line); }
      .dashboard-clean-stat-list > div:first-child { padding-top: 0; border-top: 0; }
      .dashboard-clean-stat-list span { color: var(--muted); font-size: 11px; }
      .dashboard-clean-stat-list strong { color: var(--ink); font-size: 12px; font-weight: 600; text-align: right; }
      .dashboard-clean-stat-list .dashboard-clean-stat-emphasis span, .dashboard-clean-stat-list .dashboard-clean-stat-emphasis strong { color: var(--brand); font-weight: 700; }
      .dashboard-clean-today-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
      .dashboard-clean-mini-label { display: block; margin-bottom: 8px; color: var(--brand); font-size: 9px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
      .dashboard-clean-today-item { display: block; padding: 7px 0; border-top: 1px solid var(--line); color: var(--ink); }
      .dashboard-clean-today-item strong, .dashboard-clean-today-item small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dashboard-clean-today-item strong { font-size: 11px; font-weight: 600; }
      .dashboard-clean-today-item small { margin-top: 2px; color: var(--muted); font-size: 10px; }
      .dashboard-clean-empty { display: block; min-height: 36px; color: var(--muted); font-size: 11px; }
      .dashboard-clean-small-link { margin-top: 8px; font-size: 10px; }
      .dashboard-clean-approval-note { display: flex; align-items: center; gap: 6px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--brand); font-size: 10px; font-weight: 700; }
      .dashboard-clean-payment-panel { display: none; padding: 20px 20px 0; }
      .dashboard-clean-payment-panel .dashboard-clean-panel-heading { margin-bottom: 14px; }
      .dashboard-clean-payment-summary { display: flex; align-items: end; flex-direction: column; }
      .dashboard-clean-payment-summary strong { color: var(--ink); font-size: 15px; font-weight: 600; }
      .dashboard-clean-payment-summary span { color: var(--muted); font-size: 10px; }
      .dashboard-clean-payment-panel .dashboard-payment-data-table { margin: 0 -20px; border-radius: 0 0 35px 35px; box-shadow: none; }
      @media (max-width: 1200px) { .dashboard-clean-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dashboard-clean-primary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dashboard-clean-primary-grid > section:first-child { grid-column: 1 / -1; } }
      @media (max-width: 900px) { .dashboard-clean-primary-grid, .dashboard-clean-secondary-grid { grid-template-columns: 1fr; } .dashboard-clean-primary-grid > section:first-child { grid-column: auto; } }
      @media (max-width: 560px) { .dashboard-clean-heading { display: block; } .dashboard-clean-manage-link { margin-top: 12px; } .dashboard-clean-kpis { gap: 9px; } .dashboard-clean-kpi { padding: 15px; } .dashboard-clean-kpi-value-row > strong { font-size: 21px; } .dashboard-clean-occupancy-layout { grid-template-columns: 1fr; justify-items: center; } .dashboard-clean-legend { width: 100%; } .dashboard-clean-today-grid { grid-template-columns: 1fr; gap: 18px; } }
    `}</style>
    <header className="dashboard-clean-heading">
      <div><h1>Dashboard</h1></div>
      <div className="dashboard-clean-heading-actions">
        <button type="button" className="dashboard-clean-toast-demo" onClick={showSileoToastDemo}>Preview toast</button>
        <Link className="dashboard-clean-manage-link" href="/workspaces">Manage workspaces <ArrowUpRight size={14} /></Link>
      </div>
    </header>

    <section className="dashboard-clean-kpis" aria-label="Key business metrics">
      <article className="dashboard-clean-kpi dashboard-clean-kpi-gauge"><div className="dashboard-clean-kpi-heading"><i className="dashboard-clean-kpi-icon"><Grid2X2 size={15} /></i><span className="dashboard-clean-kpi-title">Overall occupancy</span></div><div className={`dashboard-clean-kpi-value-row ${occupancyTone}`}><strong>{Math.round(animatedOccupancyPercentage)}%</strong><small className="dashboard-clean-kpi-context">{dashboardMetrics.totalOccupied} of {dashboardMetrics.totalSeats} occupied</small></div><DashboardChart variant="segmented-occupancy" metrics={dashboardMetrics} tone={occupancyStatus} /></article>
      <article className="dashboard-clean-kpi dashboard-clean-kpi-gauge"><div className="dashboard-clean-kpi-heading"><i className="dashboard-clean-kpi-icon"><Users size={15} /></i><span className="dashboard-clean-kpi-title">Available seats</span></div><div className={`dashboard-clean-kpi-value-row ${availableTone}`}><strong>{Math.round(animatedAvailablePercentage)}%</strong><small className="dashboard-clean-kpi-context">{availableSeats} of {dashboardMetrics.totalSeats} available</small></div><DashboardChart variant="segmented-available" metrics={dashboardMetrics} tone={availableStatus} /></article>
      <article className="dashboard-clean-kpi"><div className="dashboard-clean-kpi-heading"><i className="dashboard-clean-kpi-icon"><CreditCard size={15} /></i><span className="dashboard-clean-kpi-title">Monthly recurring revenue</span></div><div className="dashboard-clean-kpi-value-row"><strong>{formatDashboardCompactAmount(animatedTotalMrr)}</strong><small className="dashboard-clean-kpi-context">Private + shared</small></div></article>
      <article className="dashboard-clean-kpi dashboard-clean-kpi-alert"><div className="dashboard-clean-kpi-heading"><i className="dashboard-clean-kpi-icon"><Receipt size={15} /></i><span className="dashboard-clean-kpi-title">Opportunity Loss</span></div><div className="dashboard-clean-kpi-value-row"><strong>{formatDashboardCompactAmount(animatedOpportunityLoss)}</strong><small className="dashboard-clean-kpi-context">Estimated upside</small></div></article>
    </section>

    <div className="dashboard-clean-primary-grid">
      <section className={`dashboard-clean-panel dashboard-clean-occupancy-panel dashboard-clean-occupancy-tone-${occupancyStatus}`}>
        <div className="dashboard-clean-panel-heading"><div><h2>Occupancy</h2><p>How your space is being used.</p></div><Grid2X2 size={18} /></div>
        <div className="dashboard-clean-occupancy-center">
          <div className="dashboard-clean-donut-wrap"><DashboardChart variant="occupancy" metrics={dashboardMetrics} tone={occupancyStatus} /><div className="dashboard-clean-donut-label"><strong>{Math.round(animatedOccupancyPercentage)}%</strong><span>occupied</span></div></div>
        </div>
        <div className="dashboard-clean-occupancy-summary">
          <div className="dashboard-clean-occupancy-stat"><i /><strong>{Math.round(animatedPrivateOccupied)} / {Math.round(animatedPrivateSeats)}</strong><span>Private office occupied</span></div>
          <div className="dashboard-clean-occupancy-stat"><i /><strong>{Math.round(animatedSharedOccupied)} / {Math.round(animatedSharedSeats)}</strong><span>Shared seats occupied</span></div>
        </div>
      </section>

      <section className="dashboard-clean-panel dashboard-clean-reference-panel">
        <div className="dashboard-clean-reference-heading"><div><h2>Capacity</h2></div><Link className="dashboard-clean-reference-link" href="/workspaces">See all capacity <ArrowUpRight size={12} /></Link></div>
        <div className="dashboard-clean-dark-list">
          <div className="dashboard-clean-dark-total"><span>Total capacity</span><strong>{Math.round(animatedTotalSeats)} seats</strong></div>
          <div className="dashboard-clean-dark-section">
            <div className="dashboard-clean-dark-row"><i className="dashboard-clean-dark-icon"><Grid2X2 size={14} /></i><span className="dashboard-clean-dark-copy"><strong>Private offices</strong></span><strong className="dashboard-clean-dark-value">{Math.round(animatedPrivateSeats)}</strong></div>
            <div className="dashboard-clean-dark-row"><i className="dashboard-clean-dark-icon dashboard-clean-dark-icon-purple"><Users size={14} /></i><span className="dashboard-clean-dark-copy"><strong>Shared seats</strong></span><strong className="dashboard-clean-dark-value">{Math.round(animatedSharedSeats)}</strong></div>
          </div>
          <div className="dashboard-clean-dark-summary"><span>Seats to sell</span><strong>{Math.round(animatedAvailableSeats)}</strong></div>
        </div>
      </section>

      <section className="dashboard-clean-panel dashboard-clean-reference-panel">
        <div className="dashboard-clean-reference-heading"><div><h2>Monthly Recuring Revenue</h2></div><Link className="dashboard-clean-reference-link" href="/invoices">See all invoices <ArrowUpRight size={12} /></Link></div>
        <div className="dashboard-clean-dark-list">
          <div className="dashboard-clean-dark-total"><span>Total MRR</span><strong>{formatDashboardAmount(animatedTotalMrr)}</strong></div>
          <div className="dashboard-clean-dark-section">
            <div className="dashboard-clean-dark-row"><i className="dashboard-clean-dark-icon"><CreditCard size={14} /></i><span className="dashboard-clean-dark-copy"><strong>Private office</strong></span><strong className="dashboard-clean-dark-value">{formatDashboardAmount(animatedPrivateMrr)}</strong></div>
            <div className="dashboard-clean-dark-row"><i className="dashboard-clean-dark-icon dashboard-clean-dark-icon-purple"><CreditCard size={14} /></i><span className="dashboard-clean-dark-copy"><strong>Shared seats</strong></span><strong className="dashboard-clean-dark-value">{formatDashboardAmount(animatedSharedMrr)}</strong></div>
          </div>
          <div className="dashboard-clean-dark-section">
            <span className="dashboard-clean-dark-section-label">Average price</span>
            <div className="dashboard-clean-dark-row"><i className="dashboard-clean-dark-icon"><Receipt size={14} /></i><span className="dashboard-clean-dark-copy"><strong>Private office</strong></span><strong className="dashboard-clean-dark-value">{formatDashboardAmount(animatedPrivateAveragePrice)}</strong></div>
            <div className="dashboard-clean-dark-row"><i className="dashboard-clean-dark-icon dashboard-clean-dark-icon-purple"><Receipt size={14} /></i><span className="dashboard-clean-dark-copy"><strong>Shared seat</strong></span><strong className="dashboard-clean-dark-value">{formatDashboardAmount(animatedSharedAveragePrice)}</strong></div>
          </div>
        </div>
      </section>
    </div>

    <div className="dashboard-clean-secondary-grid">
      <section className="dashboard-clean-panel dashboard-clean-today-panel">
        <div className="dashboard-clean-panel-heading"><div><h2>Today</h2><p>Items needing attention.</p></div><CalendarDays size={18} /></div>
        <div className="dashboard-clean-today-grid">
          <div><span className="dashboard-clean-mini-label">Follow-ups</span>{sortedFollowUpRows.length ? sortedFollowUpRows.slice(0, 2).map((row) => <Link href="/leads" className="dashboard-clean-today-item" key={row.id || row.name}><strong>{row.name}</strong><small>{formatDashboardFollowUpAge(row.nextFollowUp, currentTime)}</small></Link>) : <span className="dashboard-clean-empty">No follow-ups today</span>}<Link className="dashboard-clean-small-link" href="/leads">View leads <ArrowUpRight size={12} /></Link></div>
          <div><span className="dashboard-clean-mini-label">Visits</span>{sortedVisitRows.length ? sortedVisitRows.slice(0, 2).map((visit) => <Link href="/visits" className="dashboard-clean-today-item" key={visit.id}><strong>{visit.visitor}</strong><small>{formatDashboardVisitTime(visit.time)} · {visit.host || "Only me"}</small></Link>) : <span className="dashboard-clean-empty">No visits today</span>}<Link className="dashboard-clean-small-link" href="/visits">View visits <ArrowUpRight size={12} /></Link></div>
        </div>
        {pendingApprovals ? <Link className="dashboard-clean-approval-note" href="/approvals"><ListChecks size={14} /> {pendingApprovals} pending approval{pendingApprovals === 1 ? "" : "s"}</Link> : null}
      </section>

    </div>

    <section className="dashboard-clean-payment-panel">
      <div className="dashboard-clean-panel-heading"><div><h2>Payment watchlist</h2><p>Invoices that need attention.</p></div><div className="dashboard-clean-payment-summary"><strong>{formatDashboardAmount(paymentDueAmount)}</strong><span>outstanding</span></div></div>
      <DataTable className="dashboard-payment-data-table" columns={paymentColumns} data={paymentRows} onRowClick={getPaymentRowClick} emptyMessage="No payment records yet." />
    </section>
  </>;
}

