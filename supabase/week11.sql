-- ============================================================
-- Week 11: humor styles for generated captions
-- Safe to run more than once.
-- ============================================================

-- The humor style the author picked when generating (null = classic).
alter table generations add column if not exists style text;

alter table generations drop constraint if exists generations_style_check;
alter table generations add constraint generations_style_check
  check (style is null or style in
    ('relatable', 'sarcastic', 'punny', 'wholesome', 'absurd', 'dramatic'));

create index if not exists generations_style_idx on generations (style);
