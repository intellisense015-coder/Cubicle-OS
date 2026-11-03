export const queryKeys = {
  leads: {
    all: ["leads"] as const,
  },
  visits: {
    all: ["visits"] as const,
  },
  workspaces: {
    all: ["workspaces"] as const,
  },
  members: {
    all: ["members"] as const,
  },
  companies: {
    all: ["companies"] as const,
  },
  employees: {
    all: ["employees"] as const,
    roles: ["employees", "roles"] as const,
    permissions: (userId: string) => ["employees", "permissions", userId] as const,
  },
  invoices: {
    all: ["invoices"] as const,
  },
  proposals: {
    all: ["proposals"] as const,
  },
  quotations: {
    all: ["quotations"] as const,
  },
  companyProfile: {
    all: ["company-profile"] as const,
  },
  permissions: {
    all: ["permissions"] as const,
    byKey: (permissionKey: string) => ["permissions", permissionKey] as const,
  },
  adminRole: {
    all: ["admin-role"] as const,
  },
  approvals: {
    all: ["approvals"] as const,
  },
  maintenance: {
    categories: ["maintenance", "categories"] as const,
    records: ["maintenance", "records"] as const,
    events: ["maintenance", "events"] as const,
  },
} as const;
