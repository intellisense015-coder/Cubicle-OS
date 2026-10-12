// TITLE: MODULE D DEMO DATA
export const employeeRows = [
  { name: "Areeba Malik", email: "areeba@thecubicle.local", role: "Front Desk", permissions: "Leads, visits", finance: "Approval required", status: "Active", lastActivity: "Today, 10:42 AM" },
  { name: "Usman Khan", email: "usman@thecubicle.local", role: "Operations", permissions: "All operations", finance: "Direct edit", status: "Active", lastActivity: "Today, 9:18 AM" },
  { name: "Hina Shah", email: "hina@thecubicle.local", role: "Finance", permissions: "Invoices, finance", finance: "Direct edit", status: "Pending invite", lastActivity: "Not started" },
  { name: "Hamza Raza", email: "hamza@thecubicle.local", role: "Member support", permissions: "Members, visits", finance: "Approval required", status: "Disabled", lastActivity: "Sep 26, 2026" }
];

export const permissionGroups = [
  { title: "Workspace access", items: ["Dashboard", "Leads", "Visits", "Members and companies", "Floor plan"] },
  { title: "Billing access", items: ["Invoices", "Approval inbox", "Export billing information"] },
  { title: "Administration", items: ["Employees and access", "Profile and security", "Settings"] }
];

export const settingGroups = [
  { title: "Company information", description: "The details used across your OS and documents.", items: ["Company name", "Logo and contact details"] },
  { title: "Workspace", description: "Configure the physical spaces that appear on the floor plan.", items: ["Floors, desks and offices"] },
  { title: "Billing rules", description: "Set the defaults that drive invoices and member ledgers.", items: ["Billing and due-date rules", "Security-deposit rules", "Move-out calculation rules", "Invoice numbering"] },
  { title: "Templates and email", description: "Keep documents and business messages consistent.", items: ["Invoice template", "Agreement template", "Business email settings"] },
  { title: "Notifications and history", description: "Choose what the team sees and review important changes.", items: ["Notification settings", "Activity history"] }
];
