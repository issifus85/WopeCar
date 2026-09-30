-- Redesigns the Buy a Car "Cars We Know" section from two free-text
-- paragraphs into three structured fact cards (icon + title + body),
-- matching the approved HTML mockup. Same repeatable {icon_key,title,body}
-- shape as trust_items/why_rows, so it reuses the same admin editor pattern.
alter table car_sales_content add column if not exists history_facts jsonb not null default '[]'::jsonb;

update car_sales_content set history_facts = '[
  {"icon_key": "car", "title": "Fleet-managed history", "body": "Many cars for sale come straight from our own fleet, so we know them firsthand."},
  {"icon_key": "shield-check", "title": "Pre-sale inspection", "body": "Every vehicle is inspected and prepared for its next owner before listing."},
  {"icon_key": "document", "title": "Full service records", "body": "You''ll get the service, maintenance and repair history from our time managing it."}
]'::jsonb
where history_facts = '[]'::jsonb;

alter table car_sales_content drop column if exists history_body_1;
alter table car_sales_content drop column if exists history_body_2;
