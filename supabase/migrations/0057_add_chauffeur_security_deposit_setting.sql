-- Seeds the app_settings row backing constants/pricing.js's new
-- getChauffeurSecurityDeposit() - a flat GHS security deposit charged on
-- every chauffeured booking (self-drive keeps its existing 25%-of-subtotal
-- /flat-below-threshold deposit, unaffected by this setting).
insert into app_settings (key, value, description)
values
  ('chauffeur_security_deposit', '500'::jsonb, 'Flat security deposit (GHS) charged on every chauffeured booking, regardless of trip cost.')
on conflict (key) do nothing;
