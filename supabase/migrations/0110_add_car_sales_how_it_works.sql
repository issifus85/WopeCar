-- Adds a "How It Works" section to the Buy a Car page (car_sales_content),
-- so the hero's secondary CTA has somewhere real to jump to (#how-it-works)
-- instead of pointing at #faq. Same {title, body} step shape as careers'
-- and share-your-car's own how-it-works editors.
alter table car_sales_content add column if not exists how_eyebrow text not null default 'How it works';
alter table car_sales_content add column if not exists how_heading text not null default 'Buying a car, simplified';
-- [{title, body}] x3-4
alter table car_sales_content add column if not exists how_steps jsonb not null default '[]'::jsonb;

update car_sales_content set how_steps = '[
  {"title": "Browse certified listings", "body": "Every car for sale has passed WopeCar''s 150-point inspection before it is listed."},
  {"title": "Enquire on the one you want", "body": "Open a listing and send us your details - no account or deposit needed to ask."},
  {"title": "We arrange your viewing", "body": "Our team calls you back to book a test drive and walk through the paperwork."},
  {"title": "Drive away", "body": "Complete payment and transfer, and the car is yours - backed by a 90-day warranty."}
]'::jsonb
where how_steps = '[]'::jsonb;
