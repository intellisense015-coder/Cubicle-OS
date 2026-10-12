import { EmailLayout } from "./email-layout";

// TITLE: EMPLOYEE INVITATION EMAIL
export function EmployeeInvitationEmail({ employeeName = "{{employee_name}}" }) {
  return <EmailLayout previewLabel="Employee invitation email"><h1>You have been invited to The Cubicle OS</h1><p>Hello {employeeName}, use the secure invitation link to complete your account setup.</p></EmailLayout>;
}
