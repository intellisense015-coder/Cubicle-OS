# The Cubicle OS Architecture

## Planned structure

The application follows the planning document's feature-oriented structure while using JavaScript as requested:

```text
app/
  auth/
  dashboard/
  leads/
  members/
  visits/
  floor-plan/
  invoices/
  finance/
  approvals/
  employees/
  profile/
  settings/
  email-templates/
  demo-controls/
  setup/
  tour/

components/
  ui/
  auth/

features/
  floor-plan/
  email-templates/

emails/
  invoice-email.jsx
  contract-email.jsx
  lead-follow-up-email.jsx
  employee-invitation-email.jsx
  announcement-email.jsx

lib/
  demo-session.js
  onboarding-data.js
  module-b-data.js
  module-c-data.js
  module-d-data.js
  module-e-data.js

public/
  floor-plan.png

docs/
  architecture.md
```

## Implementation rule

The current demo uses session storage and local mock data. Supabase Auth, PostgreSQL persistence, server-side permission checks, email delivery, scheduled jobs, document generation and file exports remain the next production integration layer.

## Shared UI rule

Buttons, inputs, OTP fields, tables, navigation, page headers, search fields, status badges and page shells are shared components. New feature pages should compose these components instead of duplicating controls.

## Current demo additions

The floor plan is a preloaded product asset at `public/floor-plan.png`. The demo overlays accessible seat markers on the image, shows occupant and payment details on hover or focus, and persists admin edits to session storage. The Email Templates page previews the planning-document templates and persists the selected template in the demo session.
