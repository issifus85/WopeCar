// Comparing a renter's profile name against the name printed on their
// government ID.
//
// This is the client-side twin of migration 0185's normalize_person_name() /
// person_names_match(). The two MUST stay in step: the app tells the renter
// "this matches your ID" while admin verification and any SQL report decide
// the same question in Postgres, and a disagreement between them is worse
// than having no check at all.
//
// That is also why the accent map below is the same explicit character list
// as the SQL, rather than the more idiomatic
// `.normalize('NFD').replace(/[̀-ͯ]/g, '')`. NFD does not decompose
// letters that are not a base-plus-combining-mark - 'ø' and 'đ' survive it
// untouched and would then be stripped entirely by the [^a-z0-9] pass,
// whereas the SQL maps them to 'o' and 'd'. Same list on both sides, same
// answer on both sides.

const ACCENTED = 'àáâãäåāăąèéêëēĕėęěìíîïĩīĭįıòóôõöøōŏőùúûüũūŭůűųñńņňçćĉċčýÿŷžźżšśŝşğĝġģďđťţŕřłĺľ';
const PLAIN    = 'aaaaaaaaaeeeeeeeeeiiiiiiiiiooooooooouuuuuuuuuunnnncccccyyyzzzssssggggddttrrlll';

const ACCENT_MAP = (() => {
  const map = new Map();
  for (let i = 0; i < ACCENTED.length; i++) map.set(ACCENTED[i], PLAIN[i]);
  return map;
})();

/** Folds accented Latin letters to their ASCII base. Input should already be lower-cased. */
function foldAccents(text) {
  let out = '';
  for (const ch of text) out += ACCENT_MAP.get(ch) ?? ch;
  return out;
}

/**
 * Lower-cases, folds accents, and reduces anything that is not a letter or
 * digit to a single space. "Kwame  Osei-Mensah" -> "kwame osei mensah".
 * Returns '' for a name that holds nothing comparable.
 */
export function normalizePersonName(name) {
  return foldAccents(String(name ?? '').toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The distinct word tokens of a normalized name. */
function nameTokens(name) {
  const normalized = normalizePersonName(name);
  return normalized ? Array.from(new Set(normalized.split(' '))) : [];
}

/**
 * True when two names plausibly describe the same person.
 *
 * Token-set containment, not string equality, because the two cases that
 * actually show up are word ORDER (Ghanaian IDs commonly print the surname
 * first: "SEIDU YUSIF" for a profile reading "Yusif Seidu") and EXTRA tokens
 * (a middle name that appears on the document but not in daily use). Both are
 * the same person and must not be flagged.
 *
 * At least two tokens are required on the shorter side. A lone "Yaw" is
 * contained in a great many Ghanaian names, so a single-token name is
 * reported as a non-match for a human to look at rather than waved through.
 */
export function personNamesMatch(a, b) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (Math.min(ta.length, tb.length) < 2) return false;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longerSet = new Set(longer);
  return shorter.every((token) => longerSet.has(token));
}

/** Joins the two registration fields into the single full_name the rest of the system reads. */
export function joinName(firstName, lastName) {
  return `${String(firstName ?? '').trim()} ${String(lastName ?? '').trim()}`.replace(/\s+/g, ' ').trim();
}

/**
 * Validates a name being offered as the one on a government ID.
 * Returns a message to show the user, or null when the name is acceptable.
 *
 * Deliberately permissive. The goal is to stop the input that is obviously
 * not an ID name - a blank, a nickname-shaped single initial, an email
 * address pasted into the wrong box - NOT to police real names, which are far
 * more varied than any rule set. Anything that gets past this and still does
 * not match the document is surfaced to the renter and to admin rather than
 * rejected here.
 */
export function validateIdName(firstName, lastName) {
  const first = String(firstName ?? '').trim();
  const last = String(lastName ?? '').trim();

  if (!first) return 'Please enter your first name, exactly as it appears on your ID.';
  if (!last) return 'Please enter your last name, exactly as it appears on your ID.';

  const combined = `${first} ${last}`;
  if (/\d/.test(combined)) return 'Names should not contain numbers. Please enter your name as it appears on your ID.';
  if (/@/.test(combined)) return 'That looks like an email address. Please enter your name as it appears on your ID.';
  if (first.length < 2) return 'Please enter your full first name, not an initial.';
  if (last.length < 2) return 'Please enter your full last name, not an initial.';

  return null;
}
