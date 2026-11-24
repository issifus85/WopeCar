-- Fleet Officer Phase 1 - make two PREPROD test accounts fleet officers, so you can sign in as them in a preprod app build.
-- Wopecar-PREPROD only. Run after 0188. Replace the two emails with real preprod accounts (sign them up in a preprod build first
-- if needed). Their normal renter / vendor access does not change. Safe to run again.
with wanted (email, vehicle_note) as (
  values
    ('officer1@example.com', 'Test officer 1'),
    ('officer2@example.com', 'Test officer 2')
)
insert into officer_profiles (user_id, display_name, photo_url, masked_phone, vehicle_note)
select u.id, coalesce(nullif(trim(u.full_name), ''), split_part(u.email, '@', 1)), u.avatar_url, mask_phone(u.phone), w.vehicle_note
from wanted w
join users u on lower(u.email) = lower(w.email)
where u.role <> 'suspended'
on conflict (user_id) do update set is_active = true, deactivated_at = null, updated_at = now();

-- Check: both emails should be listed. A missing one means no preprod account has that email.
select u.email, u.role as account_role, o.display_name, o.is_active
from officer_profiles o join users u on u.id = o.user_id
order by o.created_at;
