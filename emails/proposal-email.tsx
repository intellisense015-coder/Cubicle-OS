import { EmailLayout } from "./email-layout";

// TITLE: PROPOSAL EMAIL
export function ProposalEmail({ recipientName = "{{recipient_name}}", proposalNumber = "{{proposal_number}}", title = "{{title}}", total = "{{total_amount}}" }) {
  return <EmailLayout previewLabel="Proposal email"><h1>Your workspace proposal is ready</h1><p>Hello {recipientName}, your proposal {proposalNumber} for {title} is ready for review.</p><p>Total: {total}. The complete proposal PDF is attached to this email.</p></EmailLayout>;
}
