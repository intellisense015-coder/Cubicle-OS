import { EmailLayout } from "./email-layout";

// TITLE: CONTRACT EMAIL
export function ContractEmail({ memberName = "{{member_name}}", spaceName = "{{space_name}}" }) {
  return <EmailLayout previewLabel="Contract email"><h1>Your workspace agreement is ready</h1><p>Hello {memberName}, your approved agreement for {spaceName} is ready to review.</p></EmailLayout>;
}
