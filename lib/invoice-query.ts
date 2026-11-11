import { isSupabaseLeadsEnabled } from "@/lib/supabase/client";
import { fetchSupabaseInvoices } from "@/lib/supabase/invoices";

type InvoiceDataSource = "supabase" | "demo";

export type InvoiceQuerySnapshot = {
  invoices: any[];
  dataSource: InvoiceDataSource;
  errorMessage: string;
};

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "The saved invoice data could not be loaded.";
  return `Could not load invoices: ${message}`;
}

export async function fetchInvoicesSnapshot(): Promise<InvoiceQuerySnapshot> {
  if (!isSupabaseLeadsEnabled()) {
    return { invoices: [], dataSource: "demo", errorMessage: "Supabase is required for invoice records." };
  }

  try {
    const remoteInvoices = await fetchSupabaseInvoices();
    return { invoices: remoteInvoices, dataSource: "supabase", errorMessage: "" };
  } catch (error) {
    return {
      invoices: [],
      dataSource: "supabase",
      errorMessage: errorMessage(error),
    };
  }
}
