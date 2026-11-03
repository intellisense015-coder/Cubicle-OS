import { getDemoValue, saveDemoValue } from "@/lib/demo-session";
import { getActiveMemberInvoices, syncWorkspaceBilling } from "@/lib/billing";
import { getWorkspaceRecords } from "@/lib/workspace-records";
import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseInvoices } from "@/lib/supabase/invoices";

type InvoiceDataSource = "supabase" | "demo";

export type InvoiceQuerySnapshot = {
  invoices: any[];
  dataSource: InvoiceDataSource;
  errorMessage: string;
};

function fallbackInvoices() {
  const savedInvoices = getDemoValue("invoices");
  const savedMembers = getDemoValue("members");
  const workspaceRecords = syncWorkspaceBilling(getWorkspaceRecords()).workspaces;
  const memberList = Array.isArray(savedMembers) ? savedMembers : [];
  return getActiveMemberInvoices(savedInvoices, memberList, workspaceRecords);
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "The saved invoice data could not be loaded.";
  return `Supabase could not load invoices: ${message}`;
}

export async function fetchInvoicesSnapshot(): Promise<InvoiceQuerySnapshot> {
  const cachedInvoices = fallbackInvoices();
  if (!isSupabaseLeadsEnabled()) {
    return { invoices: cachedInvoices, dataSource: "demo", errorMessage: "" };
  }

  try {
    const remoteInvoices = await fetchSupabaseInvoices();
    if (!remoteInvoices.length) {
      return { invoices: cachedInvoices, dataSource: "demo", errorMessage: "" };
    }

    // Keep the existing demo-session fallback warm for offline/demo mode, but
    // never use it as an authorization boundary or as a replacement for the
    // Supabase read when authenticated production data is available.
    saveDemoValue("invoices", remoteInvoices, { notify: false });
    return { invoices: remoteInvoices, dataSource: "supabase", errorMessage: "" };
  } catch (error) {
    return {
      invoices: cachedInvoices,
      dataSource: "demo",
      errorMessage: errorMessage(error),
    };
  }
}
