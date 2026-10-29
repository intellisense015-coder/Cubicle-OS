import { EmailLayout } from "./email-layout";

// TITLE: INVOICE EMAIL
export function InvoiceEmail({ memberName = "{{member_name}}", amount = "{{amount}}", billingPeriod = "{{billing_period}}" }) {
  return <EmailLayout previewLabel="Invoice email"><h1>Your workspace invoice is ready</h1><p>Hello {memberName}, your invoice for {billingPeriod} is ready. Amount due: {amount}.</p><p>The complete invoice PDF is attached to this email.</p></EmailLayout>;
}
