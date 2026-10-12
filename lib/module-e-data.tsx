// TITLE: VISIT DEMO DATA
export const visitRows = [
  { id: "visit-1", visitor: "Ayesha Khan", company: "Northstar Studio", date: "2026-10-02", time: "3:00 PM", host: "Usman Khan", purpose: "Workspace tour", status: "Scheduled" },
  { id: "visit-2", visitor: "Omar Farooq", company: "Solo workspace", date: "2026-10-02", time: "4:30 PM", host: "Areeba Malik", purpose: "Desk viewing", status: "Scheduled" },
  { id: "visit-3", visitor: "Maha Ali", company: "Contour Labs", date: "2026-10-01", time: "11:00 AM", host: "Hina Shah", purpose: "Agreement review", status: "Completed" },
  { id: "visit-4", visitor: "Hamza Shah", company: "Freelance", date: "2026-09-30", time: "2:00 PM", host: "Usman Khan", purpose: "Private office tour", status: "No-show" }
];

// TITLE: APPROVAL DEMO DATA
export const approvalRows = [
  { id: "approval-1", type: "Payment adjustment", title: "Apply PKR 12,000 credit to Contour Labs", requestedBy: "Hina Shah", createdAt: "Today, 10:12 AM", status: "Pending", risk: "Finance" },
  { id: "approval-2", type: "Move-out request", title: "Close Desk 14 for Usman Tariq", requestedBy: "Areeba Malik", createdAt: "Today, 9:44 AM", status: "Pending", risk: "Workspace" },
  { id: "approval-3", type: "Permission change", title: "Give Front Desk access to visit scheduling", requestedBy: "Usman Khan", createdAt: "Yesterday, 4:20 PM", status: "Pending", risk: "Access" }
];

// TITLE: NOTIFICATION DEMO DATA
export const notificationRows = [
  { id: "notice-1", title: "Invoice email failed", detail: "INV-2026-1021 needs a resend.", time: "12 min ago", tone: "danger", read: false },
  { id: "notice-2", title: "Follow-up due today", detail: "Ayesha Khan has a scheduled follow-up.", time: "34 min ago", tone: "accent", read: false },
  { id: "notice-3", title: "New employee invitation pending", detail: "Hina Shah has not accepted yet.", time: "Yesterday", tone: "neutral", read: true },
  { id: "notice-4", title: "Payment received", detail: "Sana Ahmed paid PKR 48,000.", time: "Yesterday", tone: "success", read: true }
];

// TITLE: MEMBER LEDGER DEMO DATA
export const memberLedger = {
  "Sana Ahmed": [
    { id: "ledger-1", date: "2026-10-01", description: "October workspace rent", type: "Charge", amount: "PKR 48,000", status: "Open" },
    { id: "ledger-2", date: "2026-09-05", description: "September rent payment", type: "Payment", amount: "PKR 48,000", status: "Settled" },
    { id: "ledger-3", date: "2026-01-12", description: "Security deposit", type: "Deposit", amount: "PKR 48,000", status: "Held" }
  ],
  "Bilal Raza": [
    { id: "ledger-4", date: "2026-10-01", description: "October workspace rent", type: "Charge", amount: "PKR 115,000", status: "Overdue" },
    { id: "ledger-5", date: "2026-02-04", description: "Security deposit", type: "Deposit", amount: "PKR 115,000", status: "Held" }
  ],
  "Hira Mahmood": [
    { id: "ledger-6", date: "2026-10-01", description: "October workspace rent", type: "Charge", amount: "PKR 42,000", status: "Open" },
    { id: "ledger-7", date: "2026-09-05", description: "September rent payment", type: "Payment", amount: "PKR 42,000", status: "Settled" }
  ],
  "Usman Tariq": [
    { id: "ledger-8", date: "2026-10-01", description: "October workspace rent", type: "Charge", amount: "PKR 48,000", status: "Open" },
    { id: "ledger-9", date: "2025-11-20", description: "Security deposit", type: "Deposit", amount: "PKR 48,000", status: "Held" }
  ]
};
