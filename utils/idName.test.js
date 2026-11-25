import { joinName, normalizePersonName, personNamesMatch, validateIdName } from './idName';

// The cases below are the SAME table that was run against migration 0185's
// person_names_match() in Postgres. Keeping one shared list is the point: if
// the JS and the SQL ever disagree, the app would tell a renter their name
// matches while admin verification sees a mismatch (or the reverse). Any
// change to one side should be made to both and checked against this list.
const SHARED_CASES = [
  ['Yusif Seidu', 'Yusif Seidu', true, 'identical'],
  ['Yusif Seidu', 'SEIDU YUSIF', true, 'surname first on the ID, plus caps'],
  ['Yusif Seidu', 'Yusif Kwame Seidu', true, 'middle name on the ID only'],
  ['Kwame Osei-Mensah', 'KWAME OSEI MENSAH', true, 'hyphen vs space'],
  ['  kwame   osei  ', 'Kwame Osei', true, 'messy whitespace and case'],
  ['Ama Serwaa Boateng', 'Boateng Ama', true, 'subset, reordered'],
  ['Kofi Annan', 'Kofi Annan Jr', true, 'suffix on the ID'],
  ['Jose Alvarez', 'José Álvarez', true, 'accents folded'],
  ['Francois Muller', 'François Müller', true, 'cedilla and umlaut'],
  ['Nana Yaa Asantewaa', 'NANA YAA ASANTEWAA', true, 'three tokens, all caps'],
  ['Mary Jane', 'Mary Jane Watson', true, 'two-token subset of three'],
  ["O'Brien Sean", 'Sean O Brien', true, 'apostrophe'],
  ['John Doe', 'Jane Smith', false, 'different people'],
  ['Yaw', 'Yaw Mensah', false, 'single-token profile name needs a human'],
  ['Yaw Mensah', 'Yaw', false, 'single-token ID name needs a human'],
  ['Kofi Annan', 'Kofi Mensah', false, 'shared first name only'],
  ['', 'Kwame Osei', false, 'blank profile name'],
  [null, 'Kwame Osei', false, 'null profile name'],
  ['Kwame Osei', null, false, 'null ID name'],
];

describe('personNamesMatch', () => {
  it.each(SHARED_CASES)('%s vs %s -> %s (%s)', (profile, idDoc, expected) => {
    expect(personNamesMatch(profile, idDoc)).toBe(expected);
  });

  it('is symmetric - argument order never changes the answer', () => {
    for (const [profile, idDoc] of SHARED_CASES) {
      expect(personNamesMatch(profile, idDoc)).toBe(personNamesMatch(idDoc, profile));
    }
  });

  it('does not match "Mueller" against "Müller" (ue expansion is out of scope, flagged for a human)', () => {
    // Documented limitation, shared with the SQL: translate()/a character map
    // cannot expand one letter into two. The safe direction is a non-match.
    expect(personNamesMatch('Francois Mueller', 'François Müller')).toBe(false);
  });
});

describe('normalizePersonName', () => {
  it('folds case, accents and punctuation down to comparable words', () => {
    expect(normalizePersonName('Kwame  Osei-Mensah')).toBe('kwame osei mensah');
    expect(normalizePersonName('José Álvarez')).toBe('jose alvarez');
    expect(normalizePersonName("O'Brien")).toBe('o brien');
  });

  it('folds letters that NFD would leave behind, matching the SQL', () => {
    // The reason this module does not use .normalize('NFD'): these are not
    // base-plus-combining-mark forms, so NFD leaves them intact and the
    // [^a-z0-9] pass would then delete them outright.
    expect(normalizePersonName('Søren')).toBe('soren');
    expect(normalizePersonName('Đurić')).toBe('duric');
  });

  it('returns an empty string for nothing comparable', () => {
    expect(normalizePersonName('')).toBe('');
    expect(normalizePersonName(null)).toBe('');
    expect(normalizePersonName('   ')).toBe('');
    expect(normalizePersonName('!!!')).toBe('');
  });
});

describe('joinName', () => {
  it('builds the single full_name the rest of the system reads', () => {
    expect(joinName('Kwame', 'Osei')).toBe('Kwame Osei');
    expect(joinName('  Kwame  ', '  Osei  ')).toBe('Kwame Osei');
    expect(joinName('Nana Yaa', 'Asantewaa')).toBe('Nana Yaa Asantewaa');
  });

  it('does not leave a stray space when half of it is missing', () => {
    expect(joinName('Kwame', '')).toBe('Kwame');
    expect(joinName('', 'Osei')).toBe('Osei');
    expect(joinName(null, undefined)).toBe('');
  });
});

describe('validateIdName', () => {
  it('accepts ordinary names, including multi-word and accented ones', () => {
    expect(validateIdName('Kwame', 'Osei')).toBeNull();
    expect(validateIdName('Nana Yaa', 'Asantewaa')).toBeNull();
    expect(validateIdName('José', 'Álvarez')).toBeNull();
    expect(validateIdName("Sean", "O'Brien")).toBeNull();
    expect(validateIdName('  Kwame  ', '  Osei-Mensah  ')).toBeNull();
  });

  it('rejects the input that is obviously not a name from a document', () => {
    expect(validateIdName('', 'Osei')).toMatch(/first name/i);
    expect(validateIdName('Kwame', '')).toMatch(/last name/i);
    expect(validateIdName('   ', '   ')).toMatch(/first name/i);
    expect(validateIdName('Kwame2', 'Osei')).toMatch(/numbers/i);
    expect(validateIdName('kwame@mail.com', 'Osei')).toMatch(/email/i);
    expect(validateIdName('K', 'Osei')).toMatch(/initial/i);
    expect(validateIdName('Kwame', 'O')).toMatch(/initial/i);
  });
});
