"""
Tests for matching legacy related projects text to projects.

These are pure functions, so no database is needed.
"""

import pytest

from documents.utils.related_project_matching import (
    CODE,
    DATE_RANGE,
    EXISTING,
    LINKED,
    REPEATED,
    SELF_REFERENCE,
    SUGGESTED,
    TITLE,
    UNRESOLVED,
    ProjectIndex,
    find_code_references,
    match_plan,
    split_segments,
    title_score,
)

CURRENT_YEAR = 2026


def codes(text):
    return [
        (ref.year, ref.number, ref.prefix, ref.is_date_range)
        for ref in find_code_references(text, current_year=CURRENT_YEAR)
    ]


class TestFindCodeReferences:
    @pytest.mark.parametrize(
        "text, expected",
        [
            ("SPP 2006-003 Forestcheck", [(2006, 3, "SPP", False)]),
            ("2006_003 Forestcheck", [(2006, 3, None, False)]),
            ("SPP 2019 068, which is my other project", [(2019, 68, "SPP", False)]),
            ("SPP 2019 - 048, which is my other project", [(2019, 48, "SPP", False)]),
            ("SPP-2024-11 Species Distribution Modelling", [(2024, 11, "SPP", False)]),
            ("SP 2022-033: Ellen Brook catchment", [(2022, 33, "SP", False)]),
            ("1999/0010 Seed biology", [(1999, 10, None, False)]),
            ("Previously 1993-008", [(1993, 8, None, False)]),
            ("SPP 2010-01: Systematics", [(2010, 1, "SPP", False)]),
            ("stp 2015-002 thesis", [(2015, 2, "STP", False)]),
            ("SP2012-025 Barrow Island translocation", [(2012, 25, "SP", False)]),
            ("SPP2006-003 Forestcheck", [(2006, 3, "SPP", False)]),
        ],
    )
    def test_formats_found_in_existing_data(self, text, expected):
        assert codes(text) == expected

    def test_prefix_without_a_space_allows_a_space_separator(self):
        assert codes("SP2019 068 is my other project") == [(2019, 68, "SP", False)]

    def test_prefix_letters_inside_a_word_are_not_a_prefix(self):
        # "SPPX" and "ESP" are not project prefixes; the code is unprefixed
        assert codes("SPPX2006-003 and ESP2007-004") == [
            (2006, 3, None, False),
            (2007, 4, None, False),
        ]

    def test_prefix_carries_forward_across_a_list_of_codes(self):
        assert codes("SPP 1993/042 1998/003 1999/010") == [
            (1993, 42, "SPP", False),
            (1998, 3, "SPP", False),
            (1999, 10, "SPP", False),
        ]

    def test_prefix_carries_forward_across_and(self):
        assert codes("SPP 1993/160 and 1993/092") == [
            (1993, 160, "SPP", False),
            (1993, 92, "SPP", False),
        ]

    def test_prefix_does_not_carry_across_other_text(self):
        assert codes("SPP 2006-003 Forestcheck. Also 2019 15 sites") == [
            (2006, 3, "SPP", False),
        ]

    def test_date_range_is_not_a_code(self):
        assert codes("Monitoring ran 2006-2012") == [(2006, 2012, None, True)]

    def test_prefixed_four_digit_number_is_a_code(self):
        assert codes("SPP 1999 2010") == [(1999, 2010, "SPP", False)]

    def test_space_separated_numbers_need_a_prefix(self):
        assert codes("In 2019 15 sites were surveyed") == []

    def test_years_outside_the_valid_range_are_ignored(self):
        assert codes("SPP 1850-003 and SPP 2099-001") == []


class TestSplitSegments:
    def test_splits_on_blocks_line_breaks_semicolons_and_bullets(self):
        html = (
            "<p>Pilbara Biological Survey</p>"
            "<ul><li>Ravensthorpe Range survey</li></ul>"
            "<p>Fire regimes in woodlands<br>Feral cat control trials; "
            "Seed biology and storage • Wetland mapping</p>"
        )

        assert split_segments(html) == [
            "Pilbara Biological Survey",
            "Ravensthorpe Range survey",
            "Fire regimes in woodlands",
            "Feral cat control trials",
            "Seed biology and storage",
            "Wetland mapping",
        ]

    def test_removes_codes_and_short_fragments(self):
        html = "<p>SPP 2006-003: Forestcheck monitoring</p><p>N/A</p>"

        assert split_segments(html) == ["Forestcheck monitoring"]

    def test_removes_a_prefix_written_against_the_year(self):
        html = "<ul><li>SP1996-006 Gilbert&rsquo;s potoroo recovery plan</li></ul>"

        assert split_segments(html) == ["Gilbert’s potoroo recovery plan"]

    def test_keeps_balanced_brackets_in_the_text(self):
        html = (
            "<p>SP 2014-003 Cat eradication on Dirk Hartog Island (D Algar et al)</p>"
        )

        assert split_segments(html) == [
            "Cat eradication on Dirk Hartog Island (D Algar et al)"
        ]

    def test_removes_brackets_left_around_a_removed_code(self):
        html = (
            "<p>Forestcheck monitoring (SPP 2006-003)</p>"
            "<p>(SPP 2007-006) Ravensthorpe Range survey</p>"
            "<p>Wetland mapping [2008-004]</p>"
        )

        assert split_segments(html) == [
            "Forestcheck monitoring",
            "Ravensthorpe Range survey",
            "Wetland mapping",
        ]

    def test_trims_a_bracket_without_a_partner(self):
        html = "<p>Seed biology and storage)</p><p>(Fire regimes in woodlands</p>"

        assert split_segments(html) == [
            "Seed biology and storage",
            "Fire regimes in woodlands",
        ]

    def test_inline_formatting_does_not_split_a_title(self):
        html = "<p>Systematics of the triggerplant genus <em>Stylidium</em></p>"

        assert split_segments(html) == [
            "Systematics of the triggerplant genus Stylidium"
        ]


class TestTitleScore:
    def test_identical_words_score_one(self):
        words = frozenset({"pilbara", "biological", "survey"})
        assert title_score(words, words) == 1.0

    def test_no_shared_words_score_zero(self):
        assert title_score(frozenset({"seed"}), frozenset({"fire"})) == 0.0

    def test_partial_overlap_is_the_harmonic_mean(self):
        segment = frozenset({"cat", "eradication", "dirk", "hartog", "island"})
        title = frozenset({"christmas", "island", "cat", "eradication"})
        # 3 shared: coverage 3/4, precision 3/5
        assert title_score(segment, title) == pytest.approx(2 * 0.75 * 0.6 / 1.35)


OWN = 1

PROJECTS = [
    # (pk, kind, year, number, title)
    (OWN, "science", 2020, 1, "<p>The plan's own project</p>"),
    (2, "science", 2006, 3, "<p>Forestcheck: integrated forest monitoring</p>"),
    (3, "science", 2022, 33, "Ellen Brook catchment nutrient export"),
    (4, "external", 2012, 494, "Pilbara biological survey"),
    (5, "science", 2007, 6, "Biological survey of the Ravensthorpe Range"),
    (6, "external", 2012, 434, "Christmas Island cat eradication"),
    (7, "science", 2016, 30, "(DUPLICATE 1) Pilbara biological survey"),
    (8, "science", 2015, 7, "Seed bank"),
    # Same year and number, different kinds
    (9, "science", 2018, 12, "Science project eighteen twelve"),
    (10, "student", 2018, 12, "Student project eighteen twelve"),
]


@pytest.fixture
def index():
    return ProjectIndex.from_projects(PROJECTS)


def outcomes(matches):
    return [
        (match.outcome, match.match_type, match.project.pk if match.project else None)
        for match in matches
    ]


class TestMatchPlanCodes:
    def test_code_naming_one_project_is_linked(self, index):
        matches = match_plan(OWN, "<p>SPP 2006-003 Forestcheck</p>", index)

        assert (LINKED, CODE, 2) in outcomes(matches)
        assert matches[0].matched_text == "SPP 2006-003"

    def test_own_project_is_a_self_reference(self, index):
        assert outcomes(match_plan(OWN, "<p>SPP 2020-001</p>", index)) == [
            (SELF_REFERENCE, CODE, OWN)
        ]

    def test_code_with_no_project_is_unresolved(self, index):
        assert outcomes(match_plan(OWN, "<p>SPP 1993/042</p>", index)) == [
            (UNRESOLVED, CODE, None)
        ]

    def test_date_range_is_reported_and_not_matched(self, index):
        assert outcomes(match_plan(OWN, "<p>Ran 2006-2012</p>", index)) == [
            (DATE_RANGE, CODE, None)
        ]

    def test_project_with_an_existing_row_is_not_added_again(self, index):
        matches = match_plan(OWN, "<p>SPP 2006-003</p>", index, frozenset({2}))

        assert outcomes(matches) == [(EXISTING, CODE, 2)]

    def test_repeated_code_is_reported_once_as_repeated(self, index):
        matches = match_plan(OWN, "<p>SPP 2006-003 and later SPP 2006-003</p>", index)

        assert outcomes(matches) == [(LINKED, CODE, 2), (REPEATED, CODE, 2)]

    def test_prefix_chooses_between_kinds(self, index):
        assert outcomes(match_plan(OWN, "<p>STP 2018-012</p>", index)) == [
            (LINKED, CODE, 10)
        ]

    def test_prefix_written_against_the_year_chooses_between_kinds(self, index):
        assert outcomes(match_plan(OWN, "<p>STP2018-012</p>", index)) == [
            (LINKED, CODE, 10)
        ]

    def test_ambiguous_code_becomes_suggestions(self, index):
        assert outcomes(match_plan(OWN, "<p>2018-012</p>", index)) == [
            (SUGGESTED, CODE, 9),
            (SUGGESTED, CODE, 10),
        ]


class TestMatchPlanTitles:
    def test_exact_title_is_linked(self, index):
        matches = match_plan(
            OWN, "<p>Ellen Brook Catchment Nutrient Export.</p>", index
        )

        assert outcomes(matches) == [(LINKED, TITLE, 3)]
        assert matches[0].matched_text == "Ellen Brook Catchment Nutrient Export"

    def test_exact_title_ignores_titles_marked_duplicate(self, index):
        # Project 7 has the same words but is marked "(DUPLICATE 1)"; only 4 matches
        assert outcomes(match_plan(OWN, "<p>Pilbara Biological Survey</p>", index)) == [
            (LINKED, TITLE, 4)
        ]

    def test_short_exact_title_is_not_linked(self, index):
        # "Seed bank" has fewer than three significant words
        assert match_plan(OWN, "<p>Seed bank</p>", index) == []

    def test_close_title_is_a_suggestion(self, index):
        assert outcomes(match_plan(OWN, "<p>Ravensthorpe Range survey</p>", index)) == [
            (SUGGESTED, TITLE, 5)
        ]

    def test_weak_resemblance_is_not_suggested(self, index):
        html = "<p>Island survey work across many remote biological sites</p>"

        assert match_plan(OWN, html, index) == []

    def test_title_matching_a_coded_project_adds_nothing(self, index):
        html = "<p>SPP 2006-003 Forestcheck integrated forest monitoring</p>"

        assert outcomes(match_plan(OWN, html, index)) == [(LINKED, CODE, 2)]

    def test_own_and_existing_projects_are_never_suggested(self, index):
        html = "<p>Biological survey of the Ravensthorpe Range area</p>"

        assert match_plan(5, html, index) == []
        assert match_plan(OWN, html, index, frozenset({5})) == []

    def test_at_most_three_suggestions_per_segment(self):
        similar = [
            (pk, "science", 2000 + pk, pk, f"Fire regimes woodland study area {pk}")
            for pk in range(20, 26)
        ]
        index = ProjectIndex.from_projects(similar)

        matches = match_plan(OWN, "<p>Fire regimes woodland area</p>", index)

        assert len(matches) == 3
        assert all(match.outcome == SUGGESTED for match in matches)

    def test_empty_or_placeholder_text_matches_nothing(self, index):
        assert match_plan(OWN, "", index) == []
        assert match_plan(OWN, "<p>N/A</p>", index) == []
        assert match_plan(OWN, None, index) == []
