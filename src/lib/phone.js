/**
 * The phone field's country prefixes.
 *
 * A phone number is the one field where "just an input" is not enough: a
 * number written 070-123 45 67 is unreachable from anywhere but the country
 * it was written in, and the visitor is the only one who knows which country
 * that is. So the field is a select and an input, and what it stores is E.164
 * - `+46701234567` - which is dialable from everywhere and comparable with
 * itself.
 *
 * The list is deliberately not every ISO country. It is Europe in full, plus
 * the countries a European site is realistically written to, and every entry
 * is one whose dial code is worth trusting - a wrong code here is a form that
 * silently collects unreachable numbers. Adding to it is editing an array.
 *
 * Israel is not in the list. That is the site owner's decision and a
 * deliberate omission, not a gap: do not add it back as a fix. A visitor with
 * a number there can still type it in full, because an explicit `+` or `00`
 * overrides the select - which is the same escape hatch every other country
 * has and is left open on purpose.
 *
 * Names are English, like every other string the public site renders. The
 * order in the file is nothing: the select sorts by name.
 */

/* [ISO 3166-1 alpha-2, name, E.164 dial code] */
const COUNTRIES = [
  ['AL', 'Albania', '355'],
  ['DZ', 'Algeria', '213'],
  ['AD', 'Andorra', '376'],
  ['AO', 'Angola', '244'],
  ['AF', 'Afghanistan', '93'],
  ['AR', 'Argentina', '54'],
  ['AM', 'Armenia', '374'],
  ['AU', 'Australia', '61'],
  ['AZ', 'Azerbaijan', '994'],
  ['BH', 'Bahrain', '973'],
  ['BD', 'Bangladesh', '880'],
  ['BE', 'Belgium', '32'],
  ['BY', 'Belarus', '375'],
  ['BA', 'Bosnia and Herzegovina', '387'],
  ['BO', 'Bolivia', '591'],
  ['BR', 'Brazil', '55'],
  ['BG', 'Bulgaria', '359'],
  ['CL', 'Chile', '56'],
  ['CO', 'Colombia', '57'],
  ['CR', 'Costa Rica', '506'],
  ['CY', 'Cyprus', '357'],
  ['DK', 'Denmark', '45'],
  ['EC', 'Ecuador', '593'],
  ['EG', 'Egypt', '20'],
  ['CI', "Côte d'Ivoire", '225'],
  ['EE', 'Estonia', '372'],
  ['ET', 'Ethiopia', '251'],
  ['PH', 'Philippines', '63'],
  ['FI', 'Finland', '358'],
  ['FR', 'France', '33'],
  ['AE', 'United Arab Emirates', '971'],
  ['FO', 'Faroe Islands', '298'],
  ['GE', 'Georgia', '995'],
  ['GH', 'Ghana', '233'],
  ['GI', 'Gibraltar', '350'],
  ['GR', 'Greece', '30'],
  ['GL', 'Greenland', '299'],
  ['GT', 'Guatemala', '502'],
  ['HK', 'Hong Kong', '852'],
  ['IN', 'India', '91'],
  ['ID', 'Indonesia', '62'],
  ['IQ', 'Iraq', '964'],
  ['IR', 'Iran', '98'],
  ['IE', 'Ireland', '353'],
  ['IS', 'Iceland', '354'],
  ['IT', 'Italy', '39'],
  ['JP', 'Japan', '81'],
  ['YE', 'Yemen', '967'],
  ['JO', 'Jordan', '962'],
  ['KH', 'Cambodia', '855'],
  ['CM', 'Cameroon', '237'],
  ['CA', 'Canada', '1'],
  ['KZ', 'Kazakhstan', '7'],
  ['KE', 'Kenya', '254'],
  ['CN', 'China', '86'],
  ['XK', 'Kosovo', '383'],
  ['HR', 'Croatia', '385'],
  ['CU', 'Cuba', '53'],
  ['KW', 'Kuwait', '965'],
  ['LV', 'Latvia', '371'],
  ['LB', 'Lebanon', '961'],
  ['LY', 'Libya', '218'],
  ['LI', 'Liechtenstein', '423'],
  ['LT', 'Lithuania', '370'],
  ['LU', 'Luxembourg', '352'],
  ['MY', 'Malaysia', '60'],
  ['MT', 'Malta', '356'],
  ['MA', 'Morocco', '212'],
  ['MX', 'Mexico', '52'],
  ['MD', 'Moldova', '373'],
  ['MC', 'Monaco', '377'],
  ['ME', 'Montenegro', '382'],
  ['MZ', 'Mozambique', '258'],
  ['MM', 'Myanmar', '95'],
  ['NL', 'Netherlands', '31'],
  ['NP', 'Nepal', '977'],
  ['NG', 'Nigeria', '234'],
  ['MK', 'North Macedonia', '389'],
  ['NO', 'Norway', '47'],
  ['NZ', 'New Zealand', '64'],
  ['OM', 'Oman', '968'],
  ['PK', 'Pakistan', '92'],
  ['PS', 'Palestine', '970'],
  ['PA', 'Panama', '507'],
  ['PY', 'Paraguay', '595'],
  ['PE', 'Peru', '51'],
  ['PL', 'Poland', '48'],
  ['PT', 'Portugal', '351'],
  ['QA', 'Qatar', '974'],
  ['RO', 'Romania', '40'],
  ['RU', 'Russia', '7'],
  ['SM', 'San Marino', '378'],
  ['SA', 'Saudi Arabia', '966'],
  ['CH', 'Switzerland', '41'],
  ['SN', 'Senegal', '221'],
  ['RS', 'Serbia', '381'],
  ['SG', 'Singapore', '65'],
  ['SK', 'Slovakia', '421'],
  ['SI', 'Slovenia', '386'],
  ['ES', 'Spain', '34'],
  ['GB', 'United Kingdom', '44'],
  ['LK', 'Sri Lanka', '94'],
  ['SD', 'Sudan', '249'],
  ['SE', 'Sweden', '46'],
  ['ZA', 'South Africa', '27'],
  ['KR', 'South Korea', '82'],
  ['SY', 'Syria', '963'],
  ['TW', 'Taiwan', '886'],
  ['TZ', 'Tanzania', '255'],
  ['TH', 'Thailand', '66'],
  ['CZ', 'Czechia', '420'],
  ['TN', 'Tunisia', '216'],
  ['TR', 'Türkiye', '90'],
  ['DE', 'Germany', '49'],
  ['UG', 'Uganda', '256'],
  ['UA', 'Ukraine', '380'],
  ['HU', 'Hungary', '36'],
  ['UY', 'Uruguay', '598'],
  ['US', 'United States', '1'],
  ['UZ', 'Uzbekistan', '998'],
  ['VE', 'Venezuela', '58'],
  ['VN', 'Vietnam', '84'],
  ['ZM', 'Zambia', '260'],
  ['ZW', 'Zimbabwe', '263'],
  ['AT', 'Austria', '43'],
];

/**
 * The flag is derived from the country code rather than stored beside it, so
 * the two cannot disagree: a regional indicator pair is exactly the ISO code
 * shifted into its own block of the alphabet.
 *
 * Windows and most Linux ship no flag font, and there the pair falls back to
 * rendering as the two letters - which is why the option says the country's
 * name rather than its code. "SE Sweden (+46)" is a fallback; "SE SE (+46)"
 * would read as a bug.
 */
export function flagFor(iso) {
  const code = String(iso || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const BY_ISO = new Map(COUNTRIES.map(([iso, name, dial]) => [iso, { iso, name, dial }]));

/** Sorted the way the names read, which is not the way the codes sort. */
const SORTED = [...BY_ISO.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));

export const countryList = () => SORTED.map((c) => ({ ...c }));

/** What the select shows, open or closed - a select has only the one string. */
export const countryOptions = () => SORTED.map((c) => ({
  value: c.iso,
  label: `${flagFor(c.iso)} ${c.name} (+${c.dial})`,
}));

export const isCountry = (iso) => BY_ISO.has(String(iso || '').toUpperCase());

/** The dial code for a country, or '' for one that is not in the list. */
export const dialFor = (iso) => BY_ISO.get(String(iso || '').toUpperCase())?.dial || '';

/**
 * A country's dial code and a locally written number, joined into E.164.
 *
 * The select is a default, not a ruling: a visitor who writes `+972…` or
 * `0044…` has said which country they mean more precisely than the dropdown
 * can, so that wins and the select is ignored. Everything else is read as a
 * local number - the leading trunk zero dropped, because `+46 070…` is not a
 * number anywhere.
 *
 * Deliberately no cleverness about a bare number that happens to start with
 * the dial code's digits: 46 is the start of a Kalmar area code as well as of
 * Sweden, and guessing wrong there mangles a real number silently. If they
 * meant the country code they can write the plus.
 */
export function joinPhone(dial, local) {
  const raw = String(local || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/\D/g, '')}`;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  const code = String(dial || '').replace(/\D/g, '');
  if (!code) return `+${digits}`;
  return `+${code}${digits.replace(/^0+/, '')}`;
}

/**
 * A sanity check, not a per-country one.
 *
 * E.164 caps a number at fifteen digits including the country code; the floor
 * of seven is the shortest real one this list can produce. Knowing that
 * +46 701 is too short for Sweden specifically would mean shipping a rule per
 * country and keeping it current, which is a dependency this project does not
 * take. It catches an empty box, a typo and a paste of the wrong thing, which
 * is most of what goes wrong.
 */
export const isDiallable = (value) => /^\+\d{7,15}$/.test(String(value || ''));
