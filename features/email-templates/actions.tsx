import { saveDemoValue } from "@/lib/demo-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// TITLE: SAVE EMAIL TEMPLATE
export function saveEmailTemplate(template) {
  saveDemoValue(`email-template-${template.id}`, template);
}

// TITLE: SEND COMMUNICATION
export async function sendCommunication({ template, channel, recipient, recipientName = "Recipient" }) {
  const { data: sessionData } = await getSupabaseBrowserClient().auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session has expired. Sign in again.");

  const response = await fetch("/api/communications/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ templateId: template.id, templateName: template.name, channel, recipient, recipientName, subject: template.subject, body: template.body })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to queue this communication.");
  const previous = JSON.parse(window.sessionStorage.getItem("cubicle-demo-communication-deliveries") || "[]");
  saveDemoValue("communication-deliveries", [result.delivery, ...previous]);
  return result.delivery;
}
