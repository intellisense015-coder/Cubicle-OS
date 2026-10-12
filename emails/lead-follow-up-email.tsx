import { EmailLayout } from "./email-layout";

// TITLE: LEAD FOLLOW-UP EMAIL
export function LeadFollowUpEmail({ leadName = "{{lead_name}}" }) {
  return <EmailLayout previewLabel="Lead follow-up email"><h1>Following up on your workspace enquiry</h1><p>Hello {leadName}, we wanted to follow up and help you find the right workspace at The Cubicle.</p></EmailLayout>;
}
