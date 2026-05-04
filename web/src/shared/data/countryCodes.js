/**
 * countryCodes.js — Curated country dial code list for PhoneInput.
 * "pinned" countries appear at the top of the dropdown.
 */

export const COUNTRY_CODES = [
  // ── Pinned / most common ────────────────────────────────────────
  { code: "PH", dialCode: "+63", name: "Philippines",    flag: "🇵🇭", pinned: true },
  { code: "US", dialCode: "+1",  name: "United States",  flag: "🇺🇸", pinned: true },
  { code: "GB", dialCode: "+44", name: "United Kingdom", flag: "🇬🇧", pinned: true },
  { code: "AU", dialCode: "+61", name: "Australia",      flag: "🇦🇺", pinned: true },
  { code: "SG", dialCode: "+65", name: "Singapore",      flag: "🇸🇬", pinned: true },
  { code: "JP", dialCode: "+81", name: "Japan",          flag: "🇯🇵", pinned: true },
  { code: "KR", dialCode: "+82", name: "South Korea",    flag: "🇰🇷", pinned: true },
  { code: "CN", dialCode: "+86", name: "China",          flag: "🇨🇳", pinned: true },
  { code: "IN", dialCode: "+91", name: "India",          flag: "🇮🇳", pinned: true },
  { code: "CA", dialCode: "+1",  name: "Canada",         flag: "🇨🇦", pinned: true },
  { code: "AE", dialCode: "+971",name: "UAE",            flag: "🇦🇪", pinned: true },
  { code: "SA", dialCode: "+966",name: "Saudi Arabia",   flag: "🇸🇦", pinned: true },
  { code: "QA", dialCode: "+974",name: "Qatar",          flag: "🇶🇦", pinned: true },
  { code: "HK", dialCode: "+852",name: "Hong Kong",      flag: "🇭🇰", pinned: true },
  { code: "TW", dialCode: "+886",name: "Taiwan",         flag: "🇹🇼", pinned: true },
  // ── A ──────────────────────────────────────────────────────────
  { code: "AF", dialCode: "+93",  name: "Afghanistan",   flag: "🇦🇫" },
  { code: "AL", dialCode: "+355", name: "Albania",       flag: "🇦🇱" },
  { code: "DZ", dialCode: "+213", name: "Algeria",       flag: "🇩🇿" },
  { code: "AD", dialCode: "+376", name: "Andorra",       flag: "🇦🇩" },
  { code: "AO", dialCode: "+244", name: "Angola",        flag: "🇦🇴" },
  { code: "AR", dialCode: "+54",  name: "Argentina",     flag: "🇦🇷" },
  { code: "AM", dialCode: "+374", name: "Armenia",       flag: "🇦🇲" },
  { code: "AT", dialCode: "+43",  name: "Austria",       flag: "🇦🇹" },
  { code: "AZ", dialCode: "+994", name: "Azerbaijan",    flag: "🇦🇿" },
  // ── B ──────────────────────────────────────────────────────────
  { code: "BH", dialCode: "+973", name: "Bahrain",       flag: "🇧🇭" },
  { code: "BD", dialCode: "+880", name: "Bangladesh",    flag: "🇧🇩" },
  { code: "BY", dialCode: "+375", name: "Belarus",       flag: "🇧🇾" },
  { code: "BE", dialCode: "+32",  name: "Belgium",       flag: "🇧🇪" },
  { code: "BZ", dialCode: "+501", name: "Belize",        flag: "🇧🇿" },
  { code: "BJ", dialCode: "+229", name: "Benin",         flag: "🇧🇯" },
  { code: "BT", dialCode: "+975", name: "Bhutan",        flag: "🇧🇹" },
  { code: "BO", dialCode: "+591", name: "Bolivia",       flag: "🇧🇴" },
  { code: "BA", dialCode: "+387", name: "Bosnia",        flag: "🇧🇦" },
  { code: "BW", dialCode: "+267", name: "Botswana",      flag: "🇧🇼" },
  { code: "BR", dialCode: "+55",  name: "Brazil",        flag: "🇧🇷" },
  { code: "BN", dialCode: "+673", name: "Brunei",        flag: "🇧🇳" },
  { code: "BG", dialCode: "+359", name: "Bulgaria",      flag: "🇧🇬" },
  // ── C ──────────────────────────────────────────────────────────
  { code: "KH", dialCode: "+855", name: "Cambodia",      flag: "🇰🇭" },
  { code: "CM", dialCode: "+237", name: "Cameroon",      flag: "🇨🇲" },
  { code: "CL", dialCode: "+56",  name: "Chile",         flag: "🇨🇱" },
  { code: "CO", dialCode: "+57",  name: "Colombia",      flag: "🇨🇴" },
  { code: "CR", dialCode: "+506", name: "Costa Rica",    flag: "🇨🇷" },
  { code: "HR", dialCode: "+385", name: "Croatia",       flag: "🇭🇷" },
  { code: "CU", dialCode: "+53",  name: "Cuba",          flag: "🇨🇺" },
  { code: "CY", dialCode: "+357", name: "Cyprus",        flag: "🇨🇾" },
  { code: "CZ", dialCode: "+420", name: "Czechia",       flag: "🇨🇿" },
  // ── D ──────────────────────────────────────────────────────────
  { code: "DK", dialCode: "+45",  name: "Denmark",       flag: "🇩🇰" },
  { code: "DO", dialCode: "+1",   name: "Dominican Republic", flag: "🇩🇴" },
  // ── E ──────────────────────────────────────────────────────────
  { code: "EC", dialCode: "+593", name: "Ecuador",       flag: "🇪🇨" },
  { code: "EG", dialCode: "+20",  name: "Egypt",         flag: "🇪🇬" },
  { code: "SV", dialCode: "+503", name: "El Salvador",   flag: "🇸🇻" },
  { code: "ET", dialCode: "+251", name: "Ethiopia",      flag: "🇪🇹" },
  // ── F ──────────────────────────────────────────────────────────
  { code: "FJ", dialCode: "+679", name: "Fiji",          flag: "🇫🇯" },
  { code: "FI", dialCode: "+358", name: "Finland",       flag: "🇫🇮" },
  { code: "FR", dialCode: "+33",  name: "France",        flag: "🇫🇷" },
  // ── G ──────────────────────────────────────────────────────────
  { code: "GE", dialCode: "+995", name: "Georgia",       flag: "🇬🇪" },
  { code: "DE", dialCode: "+49",  name: "Germany",       flag: "🇩🇪" },
  { code: "GH", dialCode: "+233", name: "Ghana",         flag: "🇬🇭" },
  { code: "GR", dialCode: "+30",  name: "Greece",        flag: "🇬🇷" },
  { code: "GT", dialCode: "+502", name: "Guatemala",     flag: "🇬🇹" },
  // ── H ──────────────────────────────────────────────────────────
  { code: "HN", dialCode: "+504", name: "Honduras",      flag: "🇭🇳" },
  { code: "HU", dialCode: "+36",  name: "Hungary",       flag: "🇭🇺" },
  // ── I ──────────────────────────────────────────────────────────
  { code: "IS", dialCode: "+354", name: "Iceland",       flag: "🇮🇸" },
  { code: "ID", dialCode: "+62",  name: "Indonesia",     flag: "🇮🇩" },
  { code: "IR", dialCode: "+98",  name: "Iran",          flag: "🇮🇷" },
  { code: "IQ", dialCode: "+964", name: "Iraq",          flag: "🇮🇶" },
  { code: "IE", dialCode: "+353", name: "Ireland",       flag: "🇮🇪" },
  { code: "IL", dialCode: "+972", name: "Israel",        flag: "🇮🇱" },
  { code: "IT", dialCode: "+39",  name: "Italy",         flag: "🇮🇹" },
  // ── J ──────────────────────────────────────────────────────────
  { code: "JM", dialCode: "+1",   name: "Jamaica",       flag: "🇯🇲" },
  { code: "JO", dialCode: "+962", name: "Jordan",        flag: "🇯🇴" },
  // ── K ──────────────────────────────────────────────────────────
  { code: "KZ", dialCode: "+7",   name: "Kazakhstan",    flag: "🇰🇿" },
  { code: "KE", dialCode: "+254", name: "Kenya",         flag: "🇰🇪" },
  { code: "KW", dialCode: "+965", name: "Kuwait",        flag: "🇰🇼" },
  { code: "KG", dialCode: "+996", name: "Kyrgyzstan",    flag: "🇰🇬" },
  // ── L ──────────────────────────────────────────────────────────
  { code: "LA", dialCode: "+856", name: "Laos",          flag: "🇱🇦" },
  { code: "LV", dialCode: "+371", name: "Latvia",        flag: "🇱🇻" },
  { code: "LB", dialCode: "+961", name: "Lebanon",       flag: "🇱🇧" },
  { code: "LY", dialCode: "+218", name: "Libya",         flag: "🇱🇾" },
  { code: "LT", dialCode: "+370", name: "Lithuania",     flag: "🇱🇹" },
  { code: "LU", dialCode: "+352", name: "Luxembourg",    flag: "🇱🇺" },
  // ── M ──────────────────────────────────────────────────────────
  { code: "MO", dialCode: "+853", name: "Macau",         flag: "🇲🇴" },
  { code: "MY", dialCode: "+60",  name: "Malaysia",      flag: "🇲🇾" },
  { code: "MV", dialCode: "+960", name: "Maldives",      flag: "🇲🇻" },
  { code: "MT", dialCode: "+356", name: "Malta",         flag: "🇲🇹" },
  { code: "MX", dialCode: "+52",  name: "Mexico",        flag: "🇲🇽" },
  { code: "MD", dialCode: "+373", name: "Moldova",       flag: "🇲🇩" },
  { code: "MN", dialCode: "+976", name: "Mongolia",      flag: "🇲🇳" },
  { code: "MA", dialCode: "+212", name: "Morocco",       flag: "🇲🇦" },
  { code: "MZ", dialCode: "+258", name: "Mozambique",    flag: "🇲🇿" },
  { code: "MM", dialCode: "+95",  name: "Myanmar",       flag: "🇲🇲" },
  // ── N ──────────────────────────────────────────────────────────
  { code: "NA", dialCode: "+264", name: "Namibia",       flag: "🇳🇦" },
  { code: "NP", dialCode: "+977", name: "Nepal",         flag: "🇳🇵" },
  { code: "NL", dialCode: "+31",  name: "Netherlands",   flag: "🇳🇱" },
  { code: "NZ", dialCode: "+64",  name: "New Zealand",   flag: "🇳🇿" },
  { code: "NI", dialCode: "+505", name: "Nicaragua",     flag: "🇳🇮" },
  { code: "NG", dialCode: "+234", name: "Nigeria",       flag: "🇳🇬" },
  { code: "NO", dialCode: "+47",  name: "Norway",        flag: "🇳🇴" },
  // ── O ──────────────────────────────────────────────────────────
  { code: "OM", dialCode: "+968", name: "Oman",          flag: "🇴🇲" },
  // ── P ──────────────────────────────────────────────────────────
  { code: "PK", dialCode: "+92",  name: "Pakistan",      flag: "🇵🇰" },
  { code: "PA", dialCode: "+507", name: "Panama",        flag: "🇵🇦" },
  { code: "PG", dialCode: "+675", name: "Papua New Guinea", flag: "🇵🇬" },
  { code: "PY", dialCode: "+595", name: "Paraguay",      flag: "🇵🇾" },
  { code: "PE", dialCode: "+51",  name: "Peru",          flag: "🇵🇪" },
  { code: "PL", dialCode: "+48",  name: "Poland",        flag: "🇵🇱" },
  { code: "PT", dialCode: "+351", name: "Portugal",      flag: "🇵🇹" },
  // ── R ──────────────────────────────────────────────────────────
  { code: "RO", dialCode: "+40",  name: "Romania",       flag: "🇷🇴" },
  { code: "RU", dialCode: "+7",   name: "Russia",        flag: "🇷🇺" },
  // ── S ──────────────────────────────────────────────────────────
  { code: "SM", dialCode: "+378", name: "San Marino",    flag: "🇸🇲" },
  { code: "SR", dialCode: "+597", name: "Suriname",      flag: "🇸🇷" },
  { code: "RS", dialCode: "+381", name: "Serbia",        flag: "🇷🇸" },
  { code: "SL", dialCode: "+232", name: "Sierra Leone",  flag: "🇸🇱" },
  { code: "SK", dialCode: "+421", name: "Slovakia",      flag: "🇸🇰" },
  { code: "SI", dialCode: "+386", name: "Slovenia",      flag: "🇸🇮" },
  { code: "SO", dialCode: "+252", name: "Somalia",       flag: "🇸🇴" },
  { code: "ZA", dialCode: "+27",  name: "South Africa",  flag: "🇿🇦" },
  { code: "SS", dialCode: "+211", name: "South Sudan",   flag: "🇸🇸" },
  { code: "ES", dialCode: "+34",  name: "Spain",         flag: "🇪🇸" },
  { code: "LK", dialCode: "+94",  name: "Sri Lanka",     flag: "🇱🇰" },
  { code: "SD", dialCode: "+249", name: "Sudan",         flag: "🇸🇩" },
  { code: "SE", dialCode: "+46",  name: "Sweden",        flag: "🇸🇪" },
  { code: "CH", dialCode: "+41",  name: "Switzerland",   flag: "🇨🇭" },
  { code: "SY", dialCode: "+963", name: "Syria",         flag: "🇸🇾" },
  // ── T ──────────────────────────────────────────────────────────
  { code: "TJ", dialCode: "+992", name: "Tajikistan",    flag: "🇹🇯" },
  { code: "TZ", dialCode: "+255", name: "Tanzania",      flag: "🇹🇿" },
  { code: "TH", dialCode: "+66",  name: "Thailand",      flag: "🇹🇭" },
  { code: "TL", dialCode: "+670", name: "Timor-Leste",   flag: "🇹🇱" },
  { code: "TG", dialCode: "+228", name: "Togo",          flag: "🇹🇬" },
  { code: "TT", dialCode: "+1",   name: "Trinidad & Tobago", flag: "🇹🇹" },
  { code: "TN", dialCode: "+216", name: "Tunisia",       flag: "🇹🇳" },
  { code: "TR", dialCode: "+90",  name: "Turkey",        flag: "🇹🇷" },
  { code: "TM", dialCode: "+993", name: "Turkmenistan",  flag: "🇹🇲" },
  // ── U ──────────────────────────────────────────────────────────
  { code: "UG", dialCode: "+256", name: "Uganda",        flag: "🇺🇬" },
  { code: "UA", dialCode: "+380", name: "Ukraine",       flag: "🇺🇦" },
  { code: "UY", dialCode: "+598", name: "Uruguay",       flag: "🇺🇾" },
  { code: "UZ", dialCode: "+998", name: "Uzbekistan",    flag: "🇺🇿" },
  // ── V ──────────────────────────────────────────────────────────
  { code: "VE", dialCode: "+58",  name: "Venezuela",     flag: "🇻🇪" },
  { code: "VN", dialCode: "+84",  name: "Vietnam",       flag: "🇻🇳" },
  // ── Y ──────────────────────────────────────────────────────────
  { code: "YE", dialCode: "+967", name: "Yemen",         flag: "🇾🇪" },
  // ── Z ──────────────────────────────────────────────────────────
  { code: "ZM", dialCode: "+260", name: "Zambia",        flag: "🇿🇲" },
  { code: "ZW", dialCode: "+263", name: "Zimbabwe",      flag: "🇿🇼" },
];

/** Default country */
export const DEFAULT_COUNTRY = COUNTRY_CODES.find((c) => c.code === "PH");

/**
 * Parse an E.164 string into { country, localNumber }.
 * Falls back to Philippines if unrecognised.
 */
export const parseE164 = (value) => {
  if (!value) return { country: DEFAULT_COUNTRY, localNumber: "" };

  // Sort by dialCode length descending so longer codes match first (+1868 before +1)
  const sorted = [...COUNTRY_CODES].sort(
    (a, b) => b.dialCode.length - a.dialCode.length
  );
  const match = sorted.find((c) => value.startsWith(c.dialCode));
  if (match) {
    return { country: match, localNumber: value.slice(match.dialCode.length) };
  }
  return { country: DEFAULT_COUNTRY, localNumber: value.replace(/^\+/, "") };
};
