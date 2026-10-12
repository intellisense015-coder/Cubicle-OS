# The Cubicle proposal template

Open `index.html` in a browser. All assets are local; no build step or framework is required. Extract this entire folder before opening the HTML. For application integration, serve these files from the same asset directory.

## What was recreated

Four US Letter pages (612 × 792 CSS pixels; printed as 8.5 × 11 inches), preserving the supplied PDF's fixed artwork, colors, photographs, logos, captions, amenities and floor plan as high-resolution PNG assets. Editable text uses positioned HTML and CSS. This is a hybrid HTML/image template, not a semantic HTML reconstruction of every fixed element. Fixed artwork is rendered at 3× resolution to preserve PDF clipping and transparency. SVG source artwork is also included but may render masks differently.

The six requested edit areas appear on page 1 and page 4. The office row is generated from office number, seats and price per seat. Gross = seats × price; monthly = gross − discount. The parenthetical per-seat monthly amount also updates to prevent inconsistent figures. To keep it fixed instead, replace the `per_seat_note` update in proposal.js with your chosen text.

## Fonts and fidelity

The embedded PDF fonts were extracted. Canva exported subset fonts: these contain only some characters, not the complete alphabets. The source's existing text uses those glyphs; new names and numbers may use fallback glyphs. For production, replace `assets/Inter18pt-Regular.ttf`, `assets/Inter18pt-Bold.ttf`, `assets/ArchivoNarrow-Regular.ttf` and `assets/IBMPlexMono.ttf` with the complete matching fonts you are permitted to use. The declared family names in fields.css can stay as they are. An exact visual match for arbitrary new text requires those complete original fonts. Long single-line values shrink to fit their allocated space. Keep the subtitle short (two lines).

## Data integration

`window.proposal.getData()` returns the current proposal JSON.

`window.proposal.setData({...})` loads data from your API. Commercial fields must be finite nonnegative numbers; seats must be an integer above zero; discount cannot exceed gross.

Listen for `proposalchange` on `window` to save the event's `detail` to your API. The demo saves one draft in localStorage; your app should save a separate record per proposal. A localStorage draft is not a database.

Example:

```js
window.proposal.setData({
  proposal_number: '0211', date: '2026-10-05',
  seat_title: '6 seats',
  subtitle: '6 workstations, in configuration\nof a fully private office.',
  client_name: 'Your client', office: '12', seats: 6,
  rate: 29500, discount: 20000,
  selection: { x: 35, y: 40, width: 12, height: 10 }
});
window.addEventListener('proposalchange', ({ detail }) => {
  // Save detail to your proposal API here.
});
```

## Floor selection

The old red lines were removed from the floor-plan artwork. A red HTML rectangle overlays the floor map. Drag to move; drag the bottom-right corner to resize; click elsewhere on the map to center the box there. Focus the rectangle and use arrow keys to move it. Pointer events support mouse and touch.

Store `{x,y,width,height}` as percentages relative to the `#floor-map` container, not screen pixels. Coordinates are clamped to its bounds. The print version hides the resize handle and retains the selected rectangle. The rectangle is freely resizable rather than constrained to a mathematically square shape, matching the source's approximately rectangular highlight.

The map container bounds are left 234, top 70, width 326, height 365 in the 612 × 792 design coordinate space. If replacing the floor-plan asset, update this geometry and default selection coordinates to match it.

## Images

The existing photographs and floor plan are already included in assets/page-*.png, so you do not need to supply image files for this version. To replace individual photos, replace the corresponding fixed artwork asset. For repeated photo changes, replace the affected artwork image region into a separate positioned HTML `<img>` using the same page coordinates. Always use the unmarked original floor plan; otherwise the original red highlight will remain visible alongside the movable one.

## PDF export

Use Print / PDF, Letter paper, 100% scale, no margins, background graphics enabled, browser headers and footers disabled. Each `.page` produces one printed page. Wait for local fonts and images to load before automated PDF generation. The HTML's screen coordinate system is mapped to Letter paper by print CSS.

## Files

- index.html: editor and four proposal pages
- proposal.css: page geometry, editor and print layout
- fields.css: extracted fonts and editable-field positions
- proposal.js: data binding, calculations and floor selection
- assets/: fixed PNG artwork, optional SVG source and embedded subset fonts

## Verification

JavaScript syntax checked. All four fixed artwork pages were generated from the source PDF; pages 1 and 4 were visually inspected. Browser interaction and browser PDF printing have not been verified in this environment because Chromium was unavailable and its download failed. Verify those in your target browser before production use.
