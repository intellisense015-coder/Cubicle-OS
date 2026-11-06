begin;

update public.os_email_templates
set body = E'Hello {{employee_name}},\n\nYou have been invited to access The Cubicle OS. Use the button below to create your password and complete your account setup.\n\nThis invitation was sent by The Cubicle.',
    updated_at = now()
where template_id = 'employee-invitation';

commit;
