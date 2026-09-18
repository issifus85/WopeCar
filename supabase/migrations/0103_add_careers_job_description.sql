-- Careers page's "Apply Now" was a bare mailto: link on the job card with no
-- way to see the actual role before emailing (0101_add_careers_content_and_jobs.sql).
-- Adds a rich-text (HTML, admin's Tiptap editor) job description so the card's
-- CTA can open a details modal first, then hand off to the same mailto flow.
alter table careers_jobs add column description text not null default '';
