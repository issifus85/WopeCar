-- Promo banner's "Browse cars" button was hardcoded to /book-a-car on the
-- website (components/CampaignBand.tsx) - admin can now point it anywhere.
alter table homepage_campaign add column cta_url text not null default '/book-a-car';

-- The promo description and the Eligibility/Privacy/Terms page bodies move
-- to WYSIWYG (HTML) editing in wopecar-admin - the website will render
-- them via dangerouslySetInnerHTML instead of plain text going forward.
-- Existing plain-text values are wrapped in a single <p> so they keep
-- rendering exactly as before rather than showing as unformatted text.
update homepage_campaign
set description = '<p>' || description || '</p>'
where description not like '<%';

update content_blocks cb
set data = jsonb_set(cb.data, '{body}', to_jsonb('<p>' || (cb.data->>'body') || '</p>'))
from pages p
where cb.page_id = p.id
  and p.slug in ('eligibility', 'privacy', 'terms')
  and cb.type = 'text'
  and (cb.data->>'body') not like '<%';
