-- Seeds real content for both new FAQ surfaces (previously empty):
--   - faqs: general FAQs shown on wopecar.com/faq, sourced from the live
--     site's existing content (the page code already read from this table,
--     but it had zero rows - the live page has been blank).
--   - car_detail_faqs: the shared per-car-detail FAQ set, consolidated from
--     the ~19 near-identical boilerplate Q&A pairs repeated across 94 cars'
--     legacy cars.faqs jsonb column (no admin UI ever wrote to that column
--     directly; every car had its own copy-pasted duplicate).
--   - pages: a 'faq' row so wopecar.com/faq gets a real, admin-editable
--     meta_title/meta_desc instead of the page's own hardcoded default.

insert into faqs (question, answer, category, position, is_published) values
('Can I rent a car with cash?', 'No — WopeCar prefers online payment via Visa card, Mobile Money (MOMO), or direct bank transfer.', 'payment', 0, true),
('What do you need to rent a car at WopeCar?', 'A valid driver''s license, any other national ID, minimum age requirements, an acceptable mode of payment, and proof of residence.', 'booking', 1, true),
('How can I obtain a receipt or proof of payment?', 'An email with your invoice and receipt will be sent directly to your email.', 'payment', 2, true),
('What forms of payment are available to rent a car?', 'Paystack online payment (Visa, Mastercard, Mobile Money), direct mobile money, or direct bank transfer.', 'payment', 3, true),
('How do I cancel my booking?', 'Directly online with your booking confirmation number, by email to support@wopecar.com, or by calling customer care on +233 551 478540 or +233 531 082028.', 'booking', 4, true),
('Do I pay a fee for returning a rented car late?', 'A late return attracts a full day''s charge unless a time extension is requested by the renter.', 'general', 5, true),
('What are the business days and hours of work?', 'Business days are Monday–Saturday, with working hours of 8:30am–5pm each working day. WopeCar does not operate on Sundays.', 'general', 6, true),
('Can I have my car delivered to me?', 'Yes — all rides are delivered directly to your location at a flat fee of GHS 200 within Accra.', 'booking', 7, true),
('How do I contact WopeCar to make enquiries?', 'Via the website support page, our social media platforms, phone, or email at support@wopecar.com.', 'general', 8, true),
('What do I do if I have an accident?', 'Contact customer support directly at 055 147 8540 or 053 1082028. Do not attempt to fix any damage yourself — all cars are comprehensively insured, though damage caused by the renter (small dents, scratches, flat tires) will need to be covered by the renter.', 'general', 9, true),
('What are the cleaning and safety policies at WopeCar?', 'All cars are delivered clean and disinfected. Renters returning cars are required to return them completely clean.', 'general', 10, true),
('What do I do about fuel?', 'Cars are delivered fully fueled and must be returned in the same condition. Renters must confirm and note the fuel level before and after the trip.', 'general', 11, true),
('Is there an age requirement?', 'WopeCar renters must be 22 years or older.', 'booking', 12, true),
('Can I make a one-day booking?', 'Yes for a chauffeured service. Self-drive requires a minimum of 3 days.', 'booking', 13, true),
('Does the same rate apply to all destinations?', 'No — rates differ by region.', 'payment', 14, true),
('Are there other costs aside from the rental amount?', 'Yes — additional required and optional fees (e.g. security deposit for self-drive cars, delivery fees, chauffeur fees) are shown before you complete your booking.', 'payment', 15, true),
('What is a security deposit?', 'A refundable fee returned once the vehicle is returned in the same condition as given (washed, fueled, no physical damage) — 25% of the rental amount, or a flat GHS 500, depending on the car and rental period.', 'payment', 16, true),
('Where can I charge my EV?', 'You can charge at Home, Tseaddo, AnC Mall, Nungua, and East Legon.', 'general', 17, true),
('How much notice is required to make a reservation?', 'A 24-hour notice is required to make a reservation.', 'booking', 18, true)
on conflict do nothing;

insert into car_detail_faqs (question, answer, position, is_published) values
('What is the minimum number of rental days?', 'The self-drive option requires a minimum of 3 days'' rental.', 0, true),
('Do rental rates include fuel?', 'No — rates are exclusive of fuel; rental only.', 1, true),
('Can a car be delivered on any day?', 'Delivery and pickup of rented vehicles are done Monday through Saturday only. Rental dates that start or end on a Sunday will need to be moved a day before or after.', 2, true),
('Can I get a chauffeur?', 'Yes — at a price of GHS 200 within Accra and GHS 300 outside Accra.', 3, true),
('Can I take the car anywhere once I''ve booked it?', 'You''re required to use the car in the agreed destination/jurisdiction you''ve paid for. Rental rates are based on the destination traveled, so any changes will affect the rental cost.', 4, true),
('Can the car be driven without a license?', 'No — only the person whose valid driver''s license is on file with WopeCar may drive the vehicle at all times. Failure to comply may result in costs incurred being borne by the renter.', 5, true),
('Do I have to make full payment before the car is delivered?', 'Yes — full payment is required before delivery. No cash payment is allowed; payment must be made by transfer through Mobile Money, bank transfer, or Paystack.', 6, true),
('What is your policy in case of damages or police fines during a rental?', 'In the event of physical or mechanical damage, or a police fine, please contact customer support first — do not repair or pay for anything on the car without letting us know. This may result in a double repair fee or no refund.', 7, true),
('Do I have to pay an extra fee for the driver?', 'No — rates already include the driver''s allowance.', 8, true),
('What is your policy on car returns?', 'Cars must be returned in the same condition as given — washed, and with the same fuel level.', 9, true),
('What is your policy on car pickups?', 'A flat GHS 200 delivery fee applies. We do not offer client pickups — this fee covers both drop-off and pickup of the vehicle.', 10, true),
('What is your policy on security deposits?', 'A refundable security deposit of 25% of the total rental cost is required if the rental amount is GHS 2,000 or more. For rentals below GHS 2,000, the deposit is a flat GHS 500.', 11, true),
('Is there a cancellation fee?', 'Yes — a cancellation fee of at least GHS 500 applies if a car is booked and the booking doesn''t go through. Fees depend on the nature of the booking.', 12, true),
('How early can I get a car delivered?', 'Deliveries start at 8am, with return time capped at 5pm.', 13, true),
('How many hours is a day''s rental (self-drive)?', 'A rental day is 24 hours, ending at the same time it was delivered. Luxury cars such as the Prado and Pajero given for self-drive are calculated at 12 hours/day.', 14, true),
('What is your policy on exceeding the rental period?', 'Rentals that run past 8pm attract an overtime fee — half a day''s rate for returns after 8pm, and a full day''s extension rate for returns after 11pm.', 15, true),
('How many hours is a day''s rental (chauffeured)?', 'Chauffeured rentals are calculated at 12 hours per day; drivers close by 8pm at the latest, regardless of start time.', 16, true),
('What is your policy on driver accommodation for trips outside Accra?', 'For chauffeured trips lasting more than a day outside Accra, accommodation is required. You may choose to provide the driver''s accommodation yourself, or have the cost added to your quoted rate.', 17, true)
on conflict do nothing;

insert into pages (slug, title, meta_title, meta_desc, is_published)
values (
  'faq',
  'FAQ Page',
  'Frequently Asked Questions About Renting a Car in Ghana | WopeCar',
  'Everything you need to know about renting a car with WopeCar in Ghana — payments, bookings, security deposits, cancellations, deliveries, and more.',
  true
)
on conflict (slug) do nothing;
