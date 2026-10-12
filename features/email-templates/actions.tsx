import { saveDemoValue } from "@/lib/demo-session";

// TITLE: SAVE EMAIL TEMPLATE
export function saveEmailTemplate(template) {
  saveDemoValue(`email-template-${template.id}`, template);
}

// TITLE: SEND COMMUNICATION
export async function sendCommunication({ template, channel, recipient, recipientName = "Recipient" }) {
  const response = await fetch("/api/communications/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateId: template.id, templateName: template.name, channel, recipient, recipientName, subject: template.subject, body: template.body })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to queue this communication.");
  const previous = JSON.parse(window.sessionStorage.getItem("cubicle-demo-communication-deliveries") || "[]");
  saveDemoValue("communication-deliveries", [result.delivery, ...previous]);
  return result.delivery;
}
