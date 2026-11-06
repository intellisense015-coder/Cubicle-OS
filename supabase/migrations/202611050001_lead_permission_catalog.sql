-- Add explicit permissions for each Leads sub-page.
-- The existing leads.read and leads.write permissions remain the main Leads access controls.

insert into public.admin_permissions (
  permission_key,
  label,
  description,
  active
)
values
  (
    'leads.followups.read',
    'Follow-ups — View',
    'View scheduled lead follow-ups.',
    true
  ),
  (
    'leads.followups.write',
    'Follow-ups — Add & edit',
    'Create and update lead follow-ups.',
    true
  ),
  (
    'leads.activity.read',
    'Lead activity — View',
    'View lead activity history.',
    true
  ),
  (
    'leads.activity.write',
    'Lead activity — Add & edit',
    'Add and update lead activity records.',
    true
  ),
  (
    'leads.journey.read',
    'Lead journey — View',
    'View complete lead journeys.',
    true
  ),
  (
    'leads.journey.write',
    'Lead journey — Add & edit',
    'Add and update lead journey entries.',
    true
  )
on conflict (permission_key) do nothing;
