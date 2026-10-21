/* Data contract: save this object against each proposal in your database. */
const officeSelections = {
  "1": { x: 10.86, y: 6.2, width: 10.36, height: 20.16 }, "2": { x: 1.2, y: 9.22, width: 9.08, height: 17.13 },
  "3": { x: 10.79, y: 32.87, width: 12.78, height: 10.78 }, "4": { x: 10.79, y: 44.11, width: 12.78, height: 8.6 },
  "5": { x: 10.79, y: 53.26, width: 12.78, height: 12.33 }, "6": { x: 1.14, y: 32.87, width: 9.16, height: 16.36 },
  "7": { x: 1.14, y: 49.77, width: 9.16, height: 15.81 }, "8": { x: 0.99, y: 72.48, width: 5.68, height: 16.59 },
  "9": { x: 7.1, y: 72.48, width: 8.73, height: 14.96 }, "10": { x: 16.32, y: 72.48, width: 7.24, height: 5.27 },
  "11": { x: 16.32, y: 78.29, width: 7.24, height: 9.15 }, "12": { x: 29.74, y: 81.09, width: 7.81, height: 11.24 },
  "13": { x: 37.97, y: 81.09, width: 5.46, height: 8.53 }, "14": { x: 33.21, y: 63.88, width: 5.18, height: 10.62 },
  "15": { x: 52.16, y: 63.88, width: 5.04, height: 10.62 }, "16": { x: 57.91, y: 69.38, width: 7.38, height: 5.12 },
  "17": { x: 57.91, y: 63.88, width: 7.38, height: 5.04 }, "18": { x: 71.33, y: 49.69, width: 19.92, height: 10.31 },
  "19": { x: 71.33, y: 36.43, width: 19.92, height: 12.71 }, "20": { x: 71.54, y: 6.28, width: 19.8, height: 28.76 },
};
const selectionForOffice = (office) => {
  const officeNumber = String(office || "").trim().toLowerCase().replace(/^office\s*/, "").trim();
  return officeSelections[officeNumber] || officeSelections["11"];
};
const defaults = { proposal_number: "0210", date: "2026-09-23", seat_title: "4 seats", subtitle: "4 workstations, in configuration\nof a fully private office.", client_name: "Moiz Foods", office: "11", seats: 4, rate: 29500, discount: 18200, selection: selectionForOffice("11") };
const key = "cubicle-proposal-demo-v1";
let data = structuredClone(defaults);
try { const saved = JSON.parse(localStorage.getItem(key)); if (saved) data = { ...defaults, ...saved, selection: saved.selection ? { ...defaults.selection, ...saved.selection } : selectionForOffice(saved.office) }; } catch {}
const form = document.querySelector("form"), selection = document.querySelector("#selection"), map = document.querySelector("#floor-map"), preview = document.querySelector(".preview"), pageStack = document.querySelector(".proposal-pages");
const money = (n) => "PKR " + Math.round(n).toLocaleString("en-US");
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
function fit(el) { const base = parseFloat(getComputedStyle(el).fontSize); el.style.fontSize = ""; let size = parseFloat(getComputedStyle(el).fontSize) || base; while (el.scrollWidth > el.clientWidth + 1 && size > 6) { size -= .25; el.style.fontSize = size + "px"; } }
function text(name, value) { const el = document.querySelector(`[data-field="${name}"]`); el.textContent = value; fit(el); }
function fitProposalToViewport() {
  if (!preview || !pageStack) return;
  const baseWidth = 612;
  const scale = Math.min((preview.clientWidth - 24) / baseWidth, 1);
  pageStack.style.setProperty("--proposal-scale", String(Math.max(0.1, scale)));
}
function render() {
  const seats = Math.max(1, Number(data.seats) || 1), rate = Math.max(0, Number(data.rate) || 0), discount = Math.min(Math.max(0, Number(data.discount) || 0), seats * rate);
  const gross = seats * rate, monthly = gross - discount;
  const parts = String(data.date || "").split("-");
  const date = parts.length === 3 ? `${parts[2]} ${["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEPT", "OCT", "NOV", "DEC"][Number(parts[1]) - 1]} ${parts[0]}` : "";
  text("proposal_heading", `PROPOSAL ${data.proposal_number} — ${date}`); text("seat_title", data.seat_title); text("subtitle1", data.subtitle); text("client_name", data.client_name);
  text("office_line", `Office- ${data.office} , ${seats} seats @ ${money(rate)} per seat`); text("gross", money(gross)); text("discount", "− " + money(discount)); text("monthly", money(monthly)); text("per_seat_note", `(@ ${money(monthly / seats)} per seat Exclusive of all applicable taxes)`);
  const s = data.selection; selection.style.left = s.x + "%"; selection.style.top = s.y + "%"; selection.style.width = s.width + "%"; selection.style.height = s.height + "%"; selection.setAttribute("aria-label", `Selected office ${data.office}. Drag or use arrow keys to move.`);
  document.querySelector("#totals").textContent = `Gross: ${money(gross)} · Monthly: ${money(monthly)}`;
  fitProposalToViewport();
}
function save() { try { localStorage.setItem(key, JSON.stringify(data)); } catch {} window.dispatchEvent(new CustomEvent("proposalchange", { detail: structuredClone(data) })); }
function populate() { for (const el of form.elements) if (el.name) el.value = data[el.name]; render(); }
form.addEventListener("submit", (e) => e.preventDefault());
form.addEventListener("input", (e) => { const el = e.target; if (!el.name || !el.checkValidity()) return; const next = { ...data, [el.name]: el.type === "number" ? Number(el.value) : el.value }; if (el.name === "office") next.selection = selectionForOffice(next.office); if (next.discount > next.seats * next.rate) { document.querySelector("#status").textContent = "Discount cannot exceed the gross amount."; return; } document.querySelector("#status").textContent = ""; data = next; render(); save(); });
let gesture = null;
map.addEventListener("pointerdown", (e) => { e.preventDefault(); const r = map.getBoundingClientRect(), p = { x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 }; if (e.target === map) { data.selection.x = clamp(p.x - data.selection.width / 2, 0, 100 - data.selection.width); data.selection.y = clamp(p.y - data.selection.height / 2, 0, 100 - data.selection.height); render(); save(); return; } gesture = { id: e.pointerId, start: p, original: { ...data.selection }, resize: e.target.id === "resize" }; map.setPointerCapture(e.pointerId); });
map.addEventListener("pointermove", (e) => { if (!gesture || gesture.id !== e.pointerId) return; const r = map.getBoundingClientRect(), dx = (e.clientX - r.left) / r.width * 100 - gesture.start.x, dy = (e.clientY - r.top) / r.height * 100 - gesture.start.y, s = data.selection, o = gesture.original; if (gesture.resize) { s.width = clamp(o.width + dx, 2, 100 - o.x); s.height = clamp(o.height + dy, 2, 100 - o.y); } else { s.x = clamp(o.x + dx, 0, 100 - s.width); s.y = clamp(o.y + dy, 0, 100 - s.height); } render(); });
for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) map.addEventListener(event, () => { if (gesture) { gesture = null; save(); } });
selection.addEventListener("keydown", (e) => { const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }; if (!moves[e.key]) return; e.preventDefault(); const [dx, dy] = moves[e.key], s = data.selection; s.x = clamp(s.x + dx, 0, 100 - s.width); s.y = clamp(s.y + dy, 0, 100 - s.height); render(); save(); });
document.querySelector("#print").onclick = async () => { await document.fonts.ready; render(); window.print(); };
document.querySelector("#download").onclick = async () => { await document.fonts.ready; render(); document.querySelector("#status").textContent = "Use the print dialog to choose Save as PDF."; window.print(); };
document.querySelector("#send").onclick = () => { const link = window.parent !== window ? window.parent.location.href : window.location.href, message = `Proposal ${data.proposal_number} for ${data.client_name}: ${link}`; window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(message)}`, "_blank", "noopener"); window.location.href = `mailto:?subject=${encodeURIComponent(`Proposal ${data.proposal_number}`)}&body=${encodeURIComponent(message)}`; };
window.proposal = { getData: () => structuredClone(data), setData: (value) => { const input = value && typeof value === "object" ? value : {}; const seats = Math.max(1, Math.floor(Number(input.seats) || defaults.seats)); const rate = Math.max(0, Number(input.rate) || 0); const discount = Math.min(Math.max(0, Number(input.discount) || 0), seats * rate); const nextSelection = input.selection && typeof input.selection === "object" ? { ...defaults.selection, ...input.selection } : selectionForOffice(input.office || defaults.office); const next = { ...defaults, ...input, seats, rate, discount, selection: nextSelection }; for (const k of ["x", "y", "width", "height"]) if (!Number.isFinite(Number(next.selection[k]))) next.selection[k] = defaults.selection[k]; next.selection.width = clamp(Number(next.selection.width), 2, 100); next.selection.height = clamp(Number(next.selection.height), 2, 100); next.selection.x = clamp(Number(next.selection.x), 0, 100 - next.selection.width); next.selection.y = clamp(Number(next.selection.y), 0, 100 - next.selection.height); data = next; populate(); save(); } };
window.addEventListener("resize", fitProposalToViewport); if (window.ResizeObserver && preview) new ResizeObserver(fitProposalToViewport).observe(preview); populate(); document.fonts.ready.then(render);
