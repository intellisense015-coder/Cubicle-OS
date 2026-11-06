begin;

alter table public.os_email_sender_settings
  drop constraint if exists os_email_sender_settings_purpose_check;

alter table public.os_email_sender_settings
  add constraint os_email_sender_settings_purpose_check
  check (purpose in ('invitations', 'invoices', 'proposals', 'quotations', 'notifications'));

commit;
