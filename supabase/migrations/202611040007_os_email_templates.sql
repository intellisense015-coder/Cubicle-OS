begin;

create table if not exists public.os_email_templates (
  template_id text primary key check (template_id in ('employee-invitation', 'payment-reminder', 'send-invoice', 'send-proposal', 'send-quotation')),
  subject text not null,
  body text not null,
  status text not null default 'Ready' check (status in ('Ready', 'Draft')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.os_email_templates enable row level security;

revoke all on table public.os_email_templates from anon, authenticated;
grant all on table public.os_email_templates to service_role;

insert into public.os_email_templates (template_id, subject, body)
values
  ('employee-invitation', 'You’re invited to The Cubicle OS', E'Hello {{employee_name}},\n\nYou have been invited to access The Cubicle OS. Use the button below to create your password and complete your account setup.\n\nThis invitation was sent by The Cubicle.'),
  ('payment-reminder', 'Payment reminder for {{billing_period}}', 'Hello {{member_name}}, this is a friendly reminder that {{amount}} for {{billing_period}} is due on {{due_date}}. Please reply if you need a statement or payment link.'),
  ('send-invoice', 'Invoice {{invoice_number}} for {{billing_period}}', 'Hello {{member_name}}, your invoice {{invoice_number}} for {{billing_period}} is ready. Amount due: {{amount}}. Due date: {{due_date}}. You can view the invoice using the secure link below: {{invoice_link}}.'),
  ('send-proposal', 'Proposal {{proposal_number}} from The Cubicle', E'Hello {{recipient_name}},\n\nYour workspace proposal {{proposal_number}} is ready. The complete proposal PDF is attached for your review.\n\nProposal: {{title}}\nOffice: {{office}}\nSeats: {{total_seats}}\nTotal: {{total_amount}}\n\nPlease reply to this email if you have any questions.'),
  ('send-quotation', 'Quotation {{quotation_number}} from The Cubicle', E'Hello {{recipient_name}},\n\nYour workspace quotation {{quotation_number}} is ready. The complete quotation PDF is attached for your review.\n\nQuotation: {{title}}\nWorkspace: {{workspace}}\nSeats: {{total_seats}}\nTotal: {{total_amount}}\n\nPlease reply to this email if you have any questions.')
on conflict (template_id) do nothing;

commit;
