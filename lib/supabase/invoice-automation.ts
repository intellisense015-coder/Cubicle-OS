import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type InvoiceAutomationSettings = {
  enabled: boolean;
  sendDay: number;
  sendTime: string;
  memberIds: string[];
  timezone: string;
  updatedAt?: string | null;
};

export const defaultInvoiceAutomationSettings: InvoiceAutomationSettings = {
  enabled: false,
  sendDay: 1,
  sendTime: "09:00",
  memberIds: [],
  timezone: "Asia/Karachi",
};

async function authorizedRequest(path: string, init: RequestInit = {}) {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session has expired. Sign in again.");
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Invoice automation could not be saved.");
  return payload;
}

export async function fetchInvoiceAutomationSettings() {
  const payload = await authorizedRequest("/api/invoices/automation");
  return (payload.settings || defaultInvoiceAutomationSettings) as InvoiceAutomationSettings;
}

export async function saveInvoiceAutomationSettings(settings: Pick<InvoiceAutomationSettings, "enabled" | "sendDay" | "sendTime" | "memberIds">) {
  const payload = await authorizedRequest("/api/invoices/automation", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
  return payload.settings as InvoiceAutomationSettings;
}
