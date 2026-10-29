-- One-time repair for the assignment drift present in the current demo data.
-- Run this in the Supabase SQL Editor while signed in as an administrator.
-- The request claim is set so the updated_by audit trigger receives the
-- existing administrator identity instead of null.

begin;

select set_config('request.jwt.claim.sub', '9921b29f-1c2d-4b57-a32f-f6344a30cd5f', true);

-- Remove Ali's stale Office 03 and Shared chair 06 occupancy.
update public.workspaces
set member_id = null,
    occupant = 'Available',
    company_name = 'Unassigned',
    status = 'available',
    membership_status = 'active',
    notice_start_date = null,
    expected_leaving_date = null,
    notice_notes = null,
    updated_by = '9921b29f-1c2d-4b57-a32f-f6344a30cd5f'
where id in ('floor4-office03', 'floor4-chair-cluster06');

-- Assign Ali to Office 05 while preserving his notice-period dates.
update public.workspaces
set member_id = 'a0e50768-aaf4-4501-a14a-12ca37f4d0db',
    occupant = 'ali',
    company_name = 'Intellisense',
    monthly_rent = 300000,
    billing_start_date = '2026-10-26',
    due_day = 29,
    status = 'occupied',
    membership_status = 'notice_period',
    notice_start_date = '2026-10-26',
    expected_leaving_date = '2026-11-26',
    notice_notes = null,
    updated_by = '9921b29f-1c2d-4b57-a32f-f6344a30cd5f'
where id = 'floor4-office05';

-- Keep member rows synchronized with their canonical workspace rows.
update public.members
set assigned_space = 'floor4-chair-cluster04',
    updated_by = '9921b29f-1c2d-4b57-a32f-f6344a30cd5f'
where id = 'd0d7d039-d384-4758-8f7a-623ff3bff615';

update public.members
set assigned_space = 'floor4-central-seat01',
    updated_by = '9921b29f-1c2d-4b57-a32f-f6344a30cd5f'
where id = 'a070de4f-227b-4abb-8418-b2dc7cc89729';

update public.members
set assigned_space = 'floor4-office05',
    updated_by = '9921b29f-1c2d-4b57-a32f-f6344a30cd5f'
where id = 'a0e50768-aaf4-4501-a14a-12ca37f4d0db';

commit;
