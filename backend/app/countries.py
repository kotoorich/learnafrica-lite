"""International country, identification and location configuration.

Data sources (maintained, not hand-entered):
  * Country names + ISO 3166-1 alpha-2 codes: ``pycountry``.
  * Administrative divisions (state / province / region): ``pycountry``
    ISO 3166-2 subdivisions — the same source used by most UN datasets.
  * Dial codes + phone validation: ``phonenumbers`` (libphonenumber port).

The identification-type map is deliberately *curated*: there is no
authoritative global registry of "which documents each country accepts", so we
only list types we are confident about and fall back to safe generic options
everywhere else. Nothing here claims a document has been *verified*.
"""
from __future__ import annotations

import functools

# Generic options offered when we have no curated list for a country.
GENERIC_ID_TYPES = [
    {"value": "passport", "label": "Passport"},
    {"value": "national_id", "label": "National identity card"},
    {"value": "drivers_licence", "label": "Driver's licence"},
    {"value": "voter_id", "label": "Voter identification card"},
    {"value": "residence_permit", "label": "Residence permit"},
    {"value": "other_gov_id", "label": "Other government-issued identification"},
]

# Curated per-country identification types. Keys are ISO 3166-1 alpha-2.
ID_TYPES_BY_COUNTRY = {
    "GH": [
        {"value": "ghana_card", "label": "Ghana Card (National ID)"},
        {"value": "passport", "label": "Passport"},
        {"value": "voter_id", "label": "Voter ID card"},
        {"value": "drivers_licence", "label": "Driver's licence"},
        {"value": "other_gov_id", "label": "Other government-issued identification"},
    ],
    "NG": [
        {"value": "nin", "label": "National Identification Number (NIN)"},
        {"value": "passport", "label": "Passport"},
        {"value": "drivers_licence", "label": "Driver's licence"},
        {"value": "voter_id", "label": "Permanent Voter's Card (PVC)"},
        {"value": "other_gov_id", "label": "Other government-issued identification"},
    ],
    "KE": [
        {"value": "national_id", "label": "National ID card"},
        {"value": "passport", "label": "Passport"},
        {"value": "drivers_licence", "label": "Driver's licence"},
        {"value": "other_gov_id", "label": "Other government-issued identification"},
    ],
    "ZA": [
        {"value": "national_id", "label": "South African ID"},
        {"value": "passport", "label": "Passport"},
        {"value": "drivers_licence", "label": "Driver's licence"},
        {"value": "other_gov_id", "label": "Other government-issued identification"},
    ],
    "GB": [
        {"value": "passport", "label": "Passport"},
        {"value": "drivers_licence", "label": "Driving licence"},
        {"value": "residence_permit", "label": "Biometric residence permit"},
        {"value": "other_gov_id", "label": "Other government-issued identification"},
    ],
    "US": [
        {"value": "passport", "label": "Passport"},
        {"value": "drivers_licence", "label": "Driver's licence"},
        {"value": "national_id", "label": "State-issued ID card"},
        {"value": "other_gov_id", "label": "Other government-issued identification"},
    ],
    "IN": [
        {"value": "aadhaar", "label": "Aadhaar"},
        {"value": "passport", "label": "Passport"},
        {"value": "voter_id", "label": "Voter ID (EPIC)"},
        {"value": "drivers_licence", "label": "Driving licence"},
        {"value": "pan", "label": "PAN card"},
        {"value": "other_gov_id", "label": "Other government-issued identification"},
    ],
    "CA": [
        {"value": "passport", "label": "Passport"},
        {"value": "drivers_licence", "label": "Driver's licence"},
        {"value": "national_id", "label": "Provincial / territorial ID"},
        {"value": "other_gov_id", "label": "Other government-issued identification"},
    ],
    "CM": [
        {"value": "national_id", "label": "National identity card (CNI)"},
        {"value": "passport", "label": "Passport"},
        {"value": "drivers_licence", "label": "Driver's licence"},
        {"value": "other_gov_id", "label": "Other government-issued identification"},
    ],
    "CI": [
        {"value": "national_id", "label": "National identity card (CNI)"},
        {"value": "passport", "label": "Passport"},
        {"value": "drivers_licence", "label": "Driver's licence"},
        {"value": "other_gov_id", "label": "Other government-issued identification"},
    ],
    "TZ": [
        {"value": "national_id", "label": "National ID (NIDA)"},
        {"value": "passport", "label": "Passport"},
        {"value": "voter_id", "label": "Voter ID card"},
        {"value": "drivers_licence", "label": "Driver's licence"},
        {"value": "other_gov_id", "label": "Other government-issued identification"},
    ],
    "UG": [
        {"value": "national_id", "label": "National ID"},
        {"value": "passport", "label": "Passport"},
        {"value": "drivers_licence", "label": "Driver's licence"},
        {"value": "other_gov_id", "label": "Other government-issued identification"},
    ],
    "RW": [
        {"value": "national_id", "label": "National ID"},
        {"value": "passport", "label": "Passport"},
        {"value": "drivers_licence", "label": "Driver's licence"},
        {"value": "other_gov_id", "label": "Other government-issued identification"},
    ],
}

# Countries whose postal system is known to use a postal code. Used to decide
# whether the postal-code field is required. Absence here means "not required",
# never "invalid".
POSTAL_CODE_COUNTRIES = {
    "US", "GB", "CA", "DE", "FR", "IN", "CN", "ZA", "NG", "KE", "TZ", "UG",
    "RW", "CM", "SN", "BF", "BJ", "TG", "CI", "NL", "BE", "IT", "ES", "PT",
    "AU", "NZ", "JP", "KR", "BR", "MX", "AR", "PL", "SE", "NO", "DK", "FI",
    "IE", "CH", "AT", "GR", "TR", "AE", "SA", "EG", "MA", "IL", "SG", "MY",
}

# Countries that expose a recognised national digital-address system we can
# collect as free text (we do not claim to validate it).
DIGITAL_ADDRESS_COUNTRIES = {
    "GH": {"label": "GhanaPost GPS digital address", "placeholder": "GA-123-4567"},
}


@functools.lru_cache(maxsize=1)
def _pycountry():
    import pycountry
    return pycountry


@functools.lru_cache(maxsize=1)
def _phonenumbers():
    import phonenumbers
    return phonenumbers


@functools.lru_cache(maxsize=1)
def country_list():
    """All ISO 3166-1 countries with dial code, sorted by name."""
    pc = _pycountry()
    pn = _phonenumbers()
    out = []
    for c in pc.countries:
        alpha2 = getattr(c, "alpha_2", None)
        if not alpha2:
            continue
        try:
            dial = pn.country_code_for_region(alpha2)
        except Exception:
            dial = None
        out.append({
            "code": alpha2,
            "name": c.name,
            "dial": f"+{dial}" if dial else None,
        })
    return sorted(out, key=lambda x: x["name"])


@functools.lru_cache(maxsize=1)
def country_codes():
    return {c["code"] for c in country_list()}


def is_valid_country(code):
    return bool(code) and str(code).upper() in country_codes()


def country_name(code):
    code = str(code or "").upper()
    for c in country_list():
        if c["code"] == code:
            return c["name"]
    return code


def id_types_for(country):
    """Identification options for a country (curated, else generic)."""
    return ID_TYPES_BY_COUNTRY.get(str(country or "").upper(), GENERIC_ID_TYPES)


def is_valid_id_type(country, id_type):
    return any(t["value"] == id_type for t in id_types_for(country))


def id_type_label(country, id_type):
    for t in id_types_for(country):
        if t["value"] == id_type:
            return t["label"]
    return id_type


@functools.lru_cache(maxsize=512)
def subdivisions(country):
    """ISO 3166-2 administrative divisions (states/provinces/regions).

    Returns [] when the dataset has no coverage for the country — callers must
    then fall back to a clearly-labelled free-text field rather than inventing
    divisions.
    """
    code = str(country or "").upper()
    if len(code) != 2:
        return []
    try:
        subs = _pycountry().subdivisions.get(country_code=code)
    except Exception:
        return []
    if not subs:
        return []
    return sorted(({"code": s.code, "name": s.name} for s in subs),
                  key=lambda x: x["name"])


def has_subdivisions(country):
    return bool(subdivisions(country))


def uses_postal_code(country):
    return str(country or "").upper() in POSTAL_CODE_COUNTRIES


def digital_address_field(country):
    return DIGITAL_ADDRESS_COUNTRIES.get(str(country or "").upper())


def normalize_id_number(raw):
    """Normalise an ID number without assuming a numeric-only format.

    Keeps letters, digits, spaces, hyphens and slashes; collapses repeats.
    Returns '' for empty input.
    """
    import re
    s = str(raw or "").strip().upper()
    s = re.sub(r"[^A-Z0-9\-/ ]+", "", s)
    s = re.sub(r"\s{2,}", " ", s)
    return s.strip()


def validate_id_number(country, id_type, raw):
    """Return (normalised, error). Length/shape check only — not verification."""
    n = normalize_id_number(raw)
    if not n:
        return "", "Identification number is required."
    # Ghana Card keeps its strict shape; every other document is 4-40 chars of
    # letters/digits/separators so international formats are never rejected.
    if str(country).upper() == "GH" and id_type == "ghana_card":
        import re
        if not re.fullmatch(r"GHA-\d{9}-\d", n):
            return n, "Ghana Card must look like GHA-123456789-0."
    if not (4 <= len(n) <= 40):
        return n, "Identification number must be between 4 and 40 characters."
    return n, None


def validate_phone(raw, country=None):
    """Validate an international phone number with libphonenumber.

    Returns (e164, error). Accepts any length the library accepts for the
    number's region; never assumes Ghanaian numbering.
    """
    pn = _phonenumbers()
    s = str(raw or "").strip()
    if not s:
        return "", "Phone number is required."
    region = str(country or "").upper() or None
    if region and region not in country_codes():
        region = None
    try:
        num = pn.parse(s, region)
        if not pn.is_valid_number(num):
            return s, "Enter a valid phone number for the selected country."
        return pn.format_number(num, pn.PhoneNumberFormat.E164), None
    except Exception:
        return s, "Enter a valid international phone number."


def profile_requirements(country):
    """What is required for an instructor in a given country.

    Drives both frontend field visibility and backend validation so the two can
    never drift apart.
    """
    code = str(country or "").upper()
    digital = digital_address_field(code)
    return {
        "country": code,
        "country_name": country_name(code),
        "id_types": id_types_for(code),
        "has_subdivisions": has_subdivisions(code),
        "subdivisions": subdivisions(code),
        "postal_required": uses_postal_code(code),
        "digital_address": digital,
        "digital_address_required": False,
    }


def public_config():
    """Everything the frontend needs to render the country-aware form."""
    return {
        "countries": country_list(),
        "id_types_by_country": ID_TYPES_BY_COUNTRY,
        "generic_id_types": GENERIC_ID_TYPES,
        "postal_code_countries": sorted(POSTAL_CODE_COUNTRIES),
        "digital_address_countries": DIGITAL_ADDRESS_COUNTRIES,
    }
