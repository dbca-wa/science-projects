"""
Find the projects that a project plan's legacy related projects text refers to.

Two kinds of reference are recognised:

- Project codes such as "SPP 2006-003", "SPP 1993/042 1998/003" or
  "1999/0010", resolved by project year and number.
- Project titles. A line of text that equals exactly one project's title is
  treated as certain; lines that closely resemble titles produce suggestions.

The functions here are pure: they read text and an in-memory project index and
never touch the database, so they can be tested directly.
"""

import re
from dataclasses import dataclass
from datetime import date

from bs4 import BeautifulSoup

# region Outcomes ==============================================================

LINKED = "linked"
SUGGESTED = "suggested"
EXISTING = "existing"
SELF_REFERENCE = "self_reference"
UNRESOLVED = "unresolved"
DATE_RANGE = "date_range"
REPEATED = "repeated"

CODE = "code"
TITLE = "title"

# endregion

# region Codes ==================================================================

# The prefix may run straight into the year ("SP2012-025"), so it ends at the
# first character that is not a letter rather than at a word boundary
CODE_PATTERN = re.compile(
    r"(?P<prefix>\b(?:SPP?|STP|CF|EXT)(?![a-z])[\s\-]*)?"
    r"(?<!\d)(?P<year>(?:19|20)\d{2})"
    r"(?P<separator>\s*[-/_]\s*-?\s*|\s+)"
    r"(?P<number>\d{1,4})(?!\d)",
    re.IGNORECASE,
)

# Text allowed between codes for a prefix to carry forward
# ("SPP 1993/042, 1998/003 and 1999/010")
CARRY_FORWARD_GAP = re.compile(r"^[\s,;&/]*(?:and\b)?[\s,;&/]*$", re.IGNORECASE)

PREFIX_KINDS = {
    "SP": "science",
    "SPP": "science",
    "STP": "student",
    "CF": "core_function",
    "EXT": "external",
}

MIN_YEAR = 1900

# endregion

# region Titles =================================================================

MIN_SEGMENT_LENGTH = 8
MIN_SHARED_WORDS = 3
MIN_TITLE_SCORE = 0.6
MAX_SUGGESTIONS_PER_SEGMENT = 3
MIN_EXACT_TITLE_WORDS = 3

# Words too common in titles here to say anything about a match
STOP_WORDS = frozenset("""
    a an and the of in on for to with at by from into its their our is are be
    as or project projects program programme study studies research western
    australia australian wa dbca spp sp stp cf ext
    """.split())

BLOCK_TAGS = ["p", "li", "div", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "td"]

# endregion


@dataclass(frozen=True)
class CodeReference:
    """A project code found in text"""

    text: str
    year: int
    number: int
    prefix: str | None
    is_date_range: bool = False


@dataclass(frozen=True)
class ProjectCandidate:
    """The project details needed for matching"""

    pk: int
    kind: str
    year: int
    number: int
    title: str
    normalised_title: str
    words: frozenset
    is_duplicate: bool


@dataclass(frozen=True)
class Match:
    """One code or title reference and what to do about it"""

    outcome: str
    match_type: str
    matched_text: str
    project: ProjectCandidate | None = None


# region Text helpers ===========================================================


def html_to_text(html: str | None) -> str:
    """Plain text of an HTML fragment, with whitespace collapsed"""
    return BeautifulSoup(html or "", "html.parser").get_text(" ", strip=True)


def normalise(text: str) -> str:
    """Lower case, punctuation replaced by spaces, whitespace collapsed"""
    return re.sub(r"[\W_]+", " ", text.lower()).strip()


def significant_words(text: str) -> frozenset:
    """Words of three or more letters that are not stop words or numbers"""
    return frozenset(
        word
        for word in normalise(text).split()
        if len(word) >= 3 and not word.isdigit() and word not in STOP_WORDS
    )


def title_score(segment_words: frozenset, title_words: frozenset) -> float:
    """
    How closely a segment's words match a title's words, from 0 to 1.

    The harmonic mean of the share of the title's words found in the segment
    and the share of the segment's words found in the title.
    """
    shared = len(segment_words & title_words)
    if not shared:
        return 0.0
    coverage = shared / len(title_words)
    precision = shared / len(segment_words)
    return 2 * coverage * precision / (coverage + precision)


def split_segments(html: str | None) -> list[str]:
    """
    Lines of the legacy text that could each name one project.

    Splits on paragraphs, list items, line breaks, semicolons and bullet
    characters, removes project codes, and drops very short fragments.
    """
    soup = BeautifulSoup(html or "", "html.parser")
    for line_break in soup.find_all("br"):
        line_break.replace_with("\n")
    for block in soup.find_all(BLOCK_TAGS):
        block.append("\n")

    segments = []
    for part in re.split(r"[\n;•]+", soup.get_text()):
        cleaned = CODE_PATTERN.sub(" ", part)
        # Brackets left empty by a removed code: "Forestcheck (SPP 2006-003)"
        cleaned = re.sub(r"\(\s*\)|\[\s*\]", " ", cleaned)
        cleaned = _strip_unbalanced_brackets(re.sub(r"\s+", " ", cleaned))
        if len(cleaned) >= MIN_SEGMENT_LENGTH:
            segments.append(cleaned)
    return segments


def _strip_unbalanced_brackets(text: str) -> str:
    """
    Trim punctuation from both ends, and any bracket at an end that has no
    partner, so "(D Algar et al)" keeps both brackets.
    """
    edge = " :-–—,."
    text = text.strip(edge)
    while text.startswith("(") and text.count("(") > text.count(")"):
        text = text[1:].strip(edge)
    while text.endswith(")") and text.count(")") > text.count("("):
        text = text[:-1].strip(edge)
    return text


# endregion

# region Codes ==================================================================


def find_code_references(text: str, current_year: int | None = None) -> list:
    """Project codes in plain text, in the order they appear"""
    latest_year = current_year or date.today().year
    references = []
    carried_prefix = None
    previous_end = None

    for found in CODE_PATTERN.finditer(text):
        prefix = (found.group("prefix") or "").strip(" -").upper() or None
        gap = text[previous_end : found.start()] if previous_end is not None else None
        if prefix is None and carried_prefix and gap is not None:
            if CARRY_FORWARD_GAP.match(gap):
                prefix = carried_prefix
        previous_end = found.end()

        year = int(found.group("year"))
        number_text = found.group("number")
        if not MIN_YEAR <= year <= latest_year:
            continue

        # "in 2019 15 sites" is prose, not a code: a plain space needs a prefix
        if prefix is None and not re.search(r"[-/_]", found.group("separator")):
            continue

        matched_text = found.group(0).strip()

        # "2006-2012" is a date range unless a project prefix says otherwise
        number = int(number_text)
        if (
            prefix is None
            and len(number_text) == 4
            and year < number <= latest_year + 10
        ):
            references.append(
                CodeReference(matched_text, year, number, None, is_date_range=True)
            )
            continue

        carried_prefix = prefix or carried_prefix
        references.append(CodeReference(matched_text, year, number, prefix))

    return references


# endregion


# region Index ==================================================================


class ProjectIndex:
    """In-memory lookups by code and title for every project"""

    def __init__(self, candidates):
        self.candidates = list(candidates)
        self._by_code = {}
        self._by_title = {}
        for candidate in self.candidates:
            self._by_code.setdefault((candidate.year, candidate.number), []).append(
                candidate
            )
            self._by_title.setdefault(candidate.normalised_title, []).append(candidate)

    @classmethod
    def from_projects(cls, rows):
        """Build from (pk, kind, year, number, title) tuples"""
        candidates = []
        for pk, kind, year, number, title in rows:
            plain_title = html_to_text(title)
            normalised_title = normalise(plain_title)
            candidates.append(
                ProjectCandidate(
                    pk=pk,
                    kind=kind or "",
                    year=year,
                    number=number,
                    title=plain_title,
                    normalised_title=normalised_title,
                    words=significant_words(plain_title),
                    # Titles such as "(DUPLICATE 1) Fire regimes ..."
                    is_duplicate=normalised_title.startswith("duplicate"),
                )
            )
        return cls(candidates)

    def by_code(self, year: int, number: int) -> list:
        return self._by_code.get((year, number), [])

    def by_exact_title(self, normalised_title: str) -> list:
        return self._by_title.get(normalised_title, [])


# endregion

# region Matching ===============================================================


def match_plan(plan_project_pk, html, index, existing_project_pks=frozenset()):
    """
    Work out which projects a plan's legacy text refers to.

    Args:
        plan_project_pk: The plan's own project, which is never matched.
        html: The legacy related projects HTML.
        index: A ProjectIndex of all projects.
        existing_project_pks: Projects that already have a row for this plan
            in any status; they are reported but never added again.

    Returns:
        A list of Match, codes first, then titles.
    """
    matches = []
    proposed = set()

    def classify(candidate, outcome, match_type, matched_text):
        if candidate.pk == plan_project_pk:
            return Match(SELF_REFERENCE, match_type, matched_text, candidate)
        if candidate.pk in existing_project_pks:
            return Match(EXISTING, match_type, matched_text, candidate)
        if candidate.pk in proposed:
            return Match(REPEATED, match_type, matched_text, candidate)
        proposed.add(candidate.pk)
        return Match(outcome, match_type, matched_text, candidate)

    for reference in find_code_references(html_to_text(html)):
        if reference.is_date_range:
            matches.append(Match(DATE_RANGE, CODE, reference.text))
            continue

        candidates = index.by_code(reference.year, reference.number)
        if reference.prefix and len(candidates) > 1:
            kind = PREFIX_KINDS.get(reference.prefix)
            narrowed = [c for c in candidates if c.kind == kind]
            candidates = narrowed or candidates

        if not candidates:
            matches.append(Match(UNRESOLVED, CODE, reference.text))
            continue

        outcome = LINKED if len(candidates) == 1 else SUGGESTED
        for candidate in candidates:
            matches.append(classify(candidate, outcome, CODE, reference.text))

    def is_new(candidate):
        # Title matches for the own project, existing rows or projects already
        # matched by code add nothing, so they are not reported
        return (
            candidate.pk != plan_project_pk
            and candidate.pk not in existing_project_pks
            and candidate.pk not in proposed
        )

    for segment in split_segments(html):
        exact = [
            candidate
            for candidate in index.by_exact_title(normalise(segment))
            if not candidate.is_duplicate
        ]
        if len(exact) == 1 and len(exact[0].words) >= MIN_EXACT_TITLE_WORDS:
            if is_new(exact[0]):
                matches.append(classify(exact[0], LINKED, TITLE, segment))
            continue

        segment_words = significant_words(segment)
        if len(segment_words) < MIN_SHARED_WORDS:
            continue

        scored = []
        for candidate in index.candidates:
            if (
                candidate.is_duplicate
                or not is_new(candidate)
                or len(segment_words & candidate.words) < MIN_SHARED_WORDS
            ):
                continue
            score = title_score(segment_words, candidate.words)
            if score >= MIN_TITLE_SCORE:
                scored.append((score, candidate))

        scored.sort(key=lambda item: (-item[0], item[1].pk))
        for _, candidate in scored[:MAX_SUGGESTIONS_PER_SEGMENT]:
            matches.append(classify(candidate, SUGGESTED, TITLE, segment))

    return matches


# endregion
