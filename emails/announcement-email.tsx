import { EmailLayout } from "./email-layout";

// TITLE: ANNOUNCEMENT EMAIL
export function AnnouncementEmail({ recipientName = "{{recipient_name}}" }) {
  return <EmailLayout previewLabel="Announcement email"><h1>An update from The Cubicle</h1><p>Hello {recipientName}, here is an important update from The Cubicle team.</p></EmailLayout>;
}
