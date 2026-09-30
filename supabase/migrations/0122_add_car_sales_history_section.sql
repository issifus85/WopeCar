-- New "Cars We Know" narrative section on the Buy a Car page, shown between
-- the trust strip and the How It Works section - explains the firsthand-
-- fleet-history angle that makes WopeCar's used cars different from a
-- typical used-car listing. Admin-editable like every other section on
-- this page.
alter table car_sales_content add column if not exists history_eyebrow text not null default 'Cars We Know';
alter table car_sales_content add column if not exists history_heading text not null default '';
alter table car_sales_content add column if not exists history_intro text not null default '';
alter table car_sales_content add column if not exists history_body_1 text not null default '';
alter table car_sales_content add column if not exists history_body_2 text not null default '';
-- Plain array of short strings (e.g. "You see the car."), rendered as a
-- checkmarked reassurance row - same shape/treatment as detty-december's
-- hero_reassure, not a {title, body} pair like trust_items/why_rows.
alter table car_sales_content add column if not exists history_steps jsonb not null default '[]'::jsonb;

update car_sales_content set
  history_heading = 'Know more about the car you''re buying.',
  history_intro = 'A great used car is about more than how it looks on the day you see it.',
  history_body_1 = 'Many of the vehicles offered for sale by WopeCar have been managed through our fleet, giving us firsthand knowledge of their maintenance, servicing and condition.',
  history_body_2 = 'Before a vehicle is offered for sale, it goes through a WopeCar inspection and is prepared for its next owner. You''ll also receive the service, maintenance and repair information available from the period the vehicle was under our management.',
  history_steps = '["You see the car.", "You see the condition.", "You see the history.", "Then you decide."]'::jsonb
where history_heading = '';
