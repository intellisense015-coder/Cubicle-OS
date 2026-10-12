"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/dialog";
import { floor4 } from "./floor-4";
import { getAreaStatus, isRentable, STATUS_LABELS, type AreaLiveData, type FloorArea, type FloorConfig, type MapStatus } from "./types";
import { useToast } from "@/components/ui/toast-provider";

export interface FloorPlanViewerProps {
  floor?: FloorConfig;
  data: readonly AreaLiveData[];
  loading?: boolean;
  error?: string;
  demo?: boolean;
  onViewMember?: (memberId: string) => void;
  onViewInvoices?: (memberId: string) => void;
  onAssignArea?: (areaId: string) => void;
  filtersOpen?: boolean;
  onFiltersOpenChange?: (open: boolean) => void;
}
const legend: MapStatus[] = ["available", "occupied", "due-soon", "grace", "overdue"];
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function AreaGeometry({ area }: { area: FloorArea }) {
  const shape = area.shape;
  if (shape.type === "rect") return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} />;
  if (shape.type === "circle") return <circle cx={shape.cx} cy={shape.cy} r={shape.r} />;
  return <polygon points={shape.points.map(point => point.join(",")).join(" ")} />;
}

/** Reuse this viewer for any developer-configured floor. No drawing/upload editor. */
export function FloorPlanViewer({ floor = floor4, data, loading = false, error, demo = false,
  onViewMember, onViewInvoices, onAssignArea, filtersOpen = false, onFiltersOpenChange }: FloorPlanViewerProps) {
  const { showToast } = useToast();
  const uid = useId();
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [filter, setFilter] = useState<MapStatus | "all">("all");
  const [draftFilter, setDraftFilter] = useState<MapStatus | "all">("all");
  const [zoom, setZoom] = useState(1);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [imageFailed, setImageFailed] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const lastTrigger = useRef<SVGGElement | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number; sx: number; sy: number } | null>(null);
  const liveById = useMemo(() => new Map(data.map(row => [row.areaId, row])), [data]);
  const lookup = (area: FloorArea) => loading || error ? undefined : liveById.get(area.id);
  const status = (area: FloorArea) => getAreaStatus(area, lookup(area));
  const activeId = pinned ?? hovered;
  const matches = (area: FloorArea) => filter === "all" || status(area) === filter;
  const matching = floor.areas.filter(matches);
  const selectedArea = pinned ? floor.areas.find(area => area.id === pinned) : undefined;
  const selectedLive = selectedArea ? lookup(selectedArea) : undefined;
  const selectedStatus = selectedArea ? status(selectedArea) : undefined;
  const selectedPaymentLabel = selectedLive?.paymentStatus === "paid" ? "Paid"
    : selectedLive?.paymentStatus === "due-soon" ? "Due soon"
      : selectedLive?.paymentStatus === "grace" ? "Due"
        : selectedLive?.paymentStatus === "overdue" ? "Overdue" : "Not assigned";
  const hoveredArea = hovered ? floor.areas.find(area => area.id === hovered) : undefined;
  const hoveredLive = hoveredArea ? lookup(hoveredArea) : undefined;
  const hoveredStatus = hoveredArea ? status(hoveredArea) : undefined;
  const hoveredPaymentLabel = hoveredLive?.paymentStatus === "paid" ? "Paid"
    : hoveredLive?.paymentStatus === "due-soon" ? "Due soon"
      : hoveredLive?.paymentStatus === "grace" ? "Due"
        : hoveredLive?.paymentStatus === "overdue" ? "Overdue" : "Not assigned";
  const vw = floor.width / zoom, vh = floor.height / zoom;
  const ox = clamp(origin.x, 0, floor.width - vw), oy = clamp(origin.y, 0, floor.height - vh);

  useEffect(() => { setHovered(null); setPinned(null); setZoom(1); setOrigin({ x: 0, y: 0 }); setImageFailed(false); }, [floor.id, floor.image]);
  useEffect(() => {
    if (filtersOpen) {
      setDraftFilter(filter);
    }
  }, [filtersOpen, filter]);
  useEffect(() => {
    if (error) showToast({ variant: "error", title: "Floor plan could not load", message: String(error) });
  }, [error, showToast]);
  // A keyboard selection can move to the card, and Escape/Close returns to its shape.
  function dismiss() { lastTrigger.current?.focus(); setPinned(null); setHovered(null); }
  function changeZoom(next: number) {
    const z = clamp(next, 1, 4);
    const cx = ox + vw / 2, cy = oy + vh / 2;
    setZoom(z); setOrigin({ x: clamp(cx - floor.width / z / 2, 0, floor.width - floor.width / z), y: clamp(cy - floor.height / z / 2, 0, floor.height - floor.height / z) });
  }
  function startPan(event: PointerEvent<SVGSVGElement>) {
    if (zoom === 1 || (event.target as Element).closest("[data-area]")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // SVG is rendered at the image aspect ratio, so these scales match its viewBox.
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, ox, oy, sx: vw / rect.width, sy: vh / rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pan(event: PointerEvent<SVGSVGElement>) {
    const d = drag.current; if (!d || d.id !== event.pointerId) return;
    setOrigin({ x: clamp(d.ox - (event.clientX - d.x) * d.sx, 0, floor.width - vw), y: clamp(d.oy - (event.clientY - d.y) * d.sy, 0, floor.height - vh) });
  }

  return <section className="fp" aria-label={`${floor.name} interactive floor plan`} onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); dismiss(); }
  }}>
    <Dialog open={filtersOpen} onClose={() => onFiltersOpenChange?.(false)} ariaLabel="Filter floor plan">
      <form className="inline-form-card lead-create-form" onSubmit={event => { event.preventDefault(); setFilter(draftFilter); onFiltersOpenChange?.(false); showToast({ variant: "success", title: "Floor plan filters applied", message: "The floor plan now shows the selected status." }); }}>
        <div className="card-heading"><div><h2>Filter floor plan</h2></div></div>
        <div className="inline-form-grid">
          <SelectField className="filter-status-select" label="Status" value={draftFilter} onChange={event => setDraftFilter(event.target.value as MapStatus | "all")}>
            <option value="all">All statuses</option>
            {legend.map(value => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
          </SelectField>
        </div>
        <div className="inline-form-actions">
          <Button type="button" variant="soft" onClick={() => onFiltersOpenChange?.(false)}>Cancel</Button>
          <Button type="submit" variant="brand">Apply filters</Button>
        </div>
      </form>
    </Dialog>
    {loading && <p className="fp-notice" role="status">Loading occupancy and payment data…</p>}
    {error && <p className="fp-error" role="alert">Could not load live data: {error}</p>}
    {imageFailed && <p className="fp-error" role="alert">Floor-plan image could not load. Check its public image path.</p>}
    <ul className="fp-legend" aria-label="Map color legend">{legend.map(value => <li key={value}><span className={`fp-dot fp-status-${value}`} />{STATUS_LABELS[value]}</li>)}</ul>
    <div className="fp-layout">
      <div className="fp-map" onPointerLeave={() => setHovered(null)}>
        <svg ref={svgRef} className={`fp-svg${zoom > 1 ? " fp-svg-zoomed" : ""}`} width={floor.width} height={floor.height} viewBox={`${ox} ${oy} ${vw} ${vh}`} aria-labelledby={`${uid}-title ${uid}-desc`}
          onPointerDown={startPan} onPointerMove={pan} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
          <title id={`${uid}-title`}>{floor.name}</title><desc id={`${uid}-desc`}>Offices and seats are interactive. Tab to an area and press Enter or Space to select it.</desc>
          <defs><pattern id={`${uid}-hatch`} width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8L8 0" className="fp-hatch-line" /></pattern></defs>
          <image href={floor.image} width={floor.width} height={floor.height} onError={() => { setImageFailed(true); showToast({ variant: "error", title: "Floor-plan image could not load", message: "Check the floor-plan image path and try again." }); }} />
          {floor.areas.map(area => {
            const s = status(area), match = matches(area), selected = activeId === area.id;
            return <g key={area.id} data-area={area.id} role="button" tabIndex={match ? 0 : -1} aria-pressed={pinned === area.id} aria-label={`${area.name}, ${STATUS_LABELS[s]}`}
              className={`fp-area fp-status-${s}${selected ? " fp-area-active" : ""}${match ? "" : " fp-area-muted"}`}
              onPointerEnter={() => { if (match) setHovered(area.id); }} onFocus={event => { if (match) { setHovered(area.id); lastTrigger.current = event.currentTarget; } }}
              onClick={event => { if (match) { lastTrigger.current = event.currentTarget; setPinned(area.id); } }}
              onKeyDown={event => { if ((event.key === "Enter" || event.key === " ") && match) { event.preventDefault(); lastTrigger.current = event.currentTarget; setPinned(area.id); } }}>
              <AreaGeometry area={area} />
              {s === "maintenance" && <g className="fp-hatch" fill={`url(#${uid}-hatch)`}><AreaGeometry area={area} /></g>}
            </g>;
          })}
        </svg>
        {hoveredArea && hoveredStatus && hovered !== pinned ? <div className="fp-hover-card" role="status"><strong>{hoveredArea.name}</strong><span className={`fp-badge fp-status-${hoveredStatus}`}>{hoveredStatus === "occupied" ? "Occupied" : "Vacant"}</span><dl><dt>Member</dt><dd>{hoveredLive?.member?.contactName || "Unassigned"}</dd><dt>Email</dt><dd>{hoveredLive?.member?.email || "—"}</dd><dt>Payment</dt><dd>{hoveredPaymentLabel}</dd></dl></div> : null}
      </div>
      <aside className="fp-details" aria-live="polite">
        {selectedArea && selectedStatus ? <>
          <div className="fp-details-heading">
            <div>
              <div className="fp-eyebrow">Workspace details</div>
              <h3>{selectedLive?.member?.contactName || selectedLive?.member?.name || selectedArea.name}</h3>
            </div>
            <button type="button" className="fp-close" onClick={dismiss} aria-label="Close workspace details">×</button>
          </div>
          <div className={`fp-badge fp-status-${selectedStatus}`}>{STATUS_LABELS[selectedStatus]}</div>
          <dl>
            <dt>Space</dt>
            <dd>{selectedArea.name}</dd>
            {selectedLive?.member ? <>
              <dt>Assigned to</dt>
              <dd>{selectedLive.member.contactName || "Assigned member"}</dd>
              <dt>Company</dt>
              <dd>{selectedLive.member.name}</dd>
              {selectedLive.member.email ? <><dt>Email</dt><dd>{selectedLive.member.email}</dd></> : null}
              {selectedLive.member.monthlyRent ? <><dt>Monthly rent</dt><dd>{selectedLive.member.monthlyRent}</dd></> : null}
              {selectedLive.member.employees ? <><dt>Capacity</dt><dd>{selectedLive.member.employees} people</dd></> : null}
            </> : <>
              <dt>Assignment</dt>
              <dd>{selectedStatus === "available" ? "Available for assignment" : "No member data available"}</dd>
            </>}
            <dt>Payment</dt>
            <dd>{selectedPaymentLabel}</dd>
          </dl>
          <p className="fp-id">Area ID: {selectedArea.id}</p>
        </> : <div className="fp-empty"><h3>Select a workspace</h3><p>Click an occupied space to view the assigned person and workspace details.</p></div>}
      </aside>
    </div>
  </section>;
}
