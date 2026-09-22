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
 * the countries a Swedish site is realistically written to, and every entry
 * is one whose dial code is worth trusting - a wrong code here is a form that
 * silently collects unreachable numbers. Adding to it is editing an array.
 *
 * Israel is not in the list. That is the site owner's decision and a
 * deliberate omission, not a gap: do not add it back as a fix. A visitor with
 * a number there can still type it in full, because an explicit `+` or `00`
 * overrides the select - which is the same escape hatch every other country
 * has and is left open on purpose.
 *
 * Names are Swedish, like every other string the public site renders. When
 * this CMS grows a second language they move with the rest of them.
 */

/* [ISO 3166-1 alpha-2, name, E.164 dial code] */
const COUNTRIES = [
  ['AL', 'Albanien', '355'],
  ['DZ', 'Algeriet', '213'],
  ['AD', 'Andorra', '376'],
  ['AO', 'Angola', '244'],
  ['AF', 'Afghanistan', '93'],
  ['AR', 'Argentina', '54'],
  ['AM', 'Armenien', '374'],
  ['AU', 'Australien', '61'],
  ['AZ', 'Azerbajdzjan', '994'],
  ['BH', 'Bahrain', '973'],
  ['BD', 'Bangladesh', '880'],
  ['BE', 'Belgien', '32'],
  ['BY', 'Belarus', '375'],
  ['BA', 'Bosnien och Hercegovina', '387'],
  ['BO', 'Bolivia', '591'],
  ['BR', 'Brasilien', '55'],
  ['BG', 'Bulgarien', '359'],
  ['CL', 'Chile', '56'],
  ['CO', 'Colombia', '57'],
  ['CR', 'Costa Rica', '506'],
  ['CY', 'Cypern', '357'],
  ['DK', 'Danmark', '45'],
  ['EC', 'Ecuador', '593'],
  ['EG', 'Egypten', '20'],
  ['CI', 'Elfenbenskusten', '225'],
  ['EE', 'Estland', '372'],
  ['ET', 'Etiopien', '251'],
  ['PH', 'Filippinerna', '63'],
  ['FI', 'Finland', '358'],
  ['FR', 'Frankrike', '33'],
  ['AE', 'Förenade Arabemiraten', '971'],
  ['FO', 'Färöarna', '298'],
  ['GE', 'Georgien', '995'],
  ['GH', 'Ghana', '233'],
  ['GI', 'Gibraltar', '350'],
  ['GR', 'Grekland', '30'],
  ['GL', 'Grönland', '299'],
  ['GT', 'Guatemala', '502'],
  ['HK', 'Hongkong', '852'],
  ['IN', 'Indien', '91'],
  ['ID', 'Indonesien', '62'],
  ['IQ', 'Irak', '964'],
  ['IR', 'Iran', '98'],
  ['IE', 'Irland', '353'],
  ['IS', 'Island', '354'],
  ['IT', 'Italien', '39'],
  ['JP', 'Japan', '81'],
  ['YE', 'Jemen', '967'],
  ['JO', 'Jordanien', '962'],
  ['KH', 'Kambodja', '855'],
  ['CM', 'Kamerun', '237'],
  ['CA', 'Kanada', '1'],
  ['KZ', 'Kazakstan', '7'],
  ['KE', 'Kenya', '254'],
  ['CN', 'Kina', '86'],
  ['XK', 'Kosovo', '383'],
  ['HR', 'Kroatien', '385'],
  ['CU', 'Kuba', '53'],
  ['KW', 'Kuwait', '965'],
  ['LV', 'Lettland', '371'],
  ['LB', 'Libanon', '961'],
  ['LY', 'Libyen', '218'],
  ['LI', 'Liechtenstein', '423'],
  ['LT', 'Litauen', '370'],
  ['LU', 'Luxemburg', '352'],
  ['MY', 'Malaysia', '60'],
  ['MT', 'Malta', '356'],
  ['MA', 'Marocko', '212'],
  ['MX', 'Mexiko', '52'],
  ['MD', 'Moldavien', '373'],
  ['MC', 'Monaco', '377'],
  ['ME', 'Montenegro', '382'],
  ['MZ', 'Moçambique', '258'],
  ['MM', 'Myanmar', '95'],
  ['NL', 'Nederländerna', '31'],
  ['NP', 'Nepal', '977'],
  ['NG', 'Nigeria', '234'],
  ['MK', 'Nordmakedonien', '389'],
  ['NO', 'Norge', '47'],
  ['NZ', 'Nya Zeeland', '64'],
  ['OM', 'Oman', '968'],
  ['PK', 'Pakistan', '92'],
  ['PS', 'Palestina', '970'],
  ['PA', 'Panama', '507'],
  ['PY', 'Paraguay', '595'],
  ['PE', 'Peru', '51'],
  ['PL', 'Polen', '48'],
  ['PT', 'Portugal', '351'],
  ['QA', 'Qatar', '974'],
  ['RO', 'Rumänien', '40'],
  ['RU', 'Ryssland', '7'],
  ['SM', 'San Marino', '378'],
  ['SA', 'Saudiarabien', '966'],
  ['CH', 'Schweiz', '41'],
  ['SN', 'Senegal', '221'],
  ['RS', 'Serbien', '381'],
  ['SG', 'Singapore', '65'],
  ['SK', 'Slovakien', '421'],
  ['SI', 'Slovenien', '386'],
  ['ES', 'Spanien', '34'],
  ['GB', 'Storbritannien', '44'],
  ['LK', 'Sri Lanka', '94'],
  ['SD', 'Sudan', '249'],
  ['SE', 'Sverige', '46'],
  ['ZA', 'Sydafrika', '27'],
  ['KR', 'Sydkorea', '82'],
  ['SY', 'Syrien', '963'],
  ['TW', 'Taiwan', '886'],
  ['TZ', 'Tanzania', '255'],
  ['TH', 'Thailand', '66'],
  ['CZ', 'Tjeckien', '420'],
  ['TN', 'Tunisien', '216'],
  ['TR', 'Turkiet', '90'],
  ['DE', 'Tyskland', '49'],
  ['UG', 'Uganda', '256'],
  ['UA', 'Ukraina', '380'],
  ['HU', 'Ungern', '36'],
  ['UY', 'Uruguay', '598'],
  ['US', 'USA', '1'],
  ['UZ', 'Uzbekistan', '998'],
  ['VE', 'Venezuela', '58'],
  ['VN', 'Vietnam', '84'],
  ['ZM', 'Zambia', '260'],
  ['ZW', 'Zimbabwe', '263'],
  ['AT', 'Österrike', '43'],
];

/**
 * The flag is derived from the country code rather than stored beside it, so
 * the two cannot disagree: a regional indicator pair is exactly the ISO code
 * shifted into its own block of the alphabet.
 *
 * Windows and most Linux ship no flag font, and there the pair falls back to
 * rendering as the two letters - which is why the option says the country's
 * name rather than its code. "SE Sverige (+46)" is a fallback; "SE SE (+46)"
 * would read as a bug.
 */
export function flagFor(iso) {
  const code = String(iso || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const BY_ISO = new Map(COUNTRIES.map(([iso, name, dial]) => [iso, { iso, name, dial }]));

/** Sorted the way the names read, which is not the way the codes sort. */
const SORTED = [...BY_ISO.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv'));

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
