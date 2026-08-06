insert into app_settings (key, value, description)
values ('gtm_container_id', 'null'::jsonb, 'Google Tag Manager container ID for wopecar.com (e.g. "GTM-XXXXXXX"). Empty until set - no GTM script is injected while null.')
on conflict (key) do nothing;
