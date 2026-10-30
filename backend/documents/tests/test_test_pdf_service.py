"""
Tests for TestPDFService — mock context generation and validation.
"""

import pytest

from documents.services.pdf_test_service import (
    DOCUMENT_KIND_MAP,
    VALID_DOCUMENT_KINDS,
    TestPDFService,
)

# Expected html_data_items keys per document kind
EXPECTED_SECTIONS = {
    "concept": [
        "background",
        "aims",
        "outcomes",
        "context",
        "collaborations",
        "staff_time_allocation",
        "budget",
    ],
    "projectplan": [
        "background",
        "aims",
        "outcomes",
        "methodology",
        "project_tasks",
        "knowledge_transfer",
        "listed_references",
        "related_projects",
        "consolidated_funds",
        "external_funds",
    ],
    "progressreport": ["context", "aims", "progress", "implications", "future"],
    "studentreport": ["progress_report"],
    "projectclosure": [
        "reason",
        "intended_outcome",
        "knowledge_transfer",
        "data_location",
        "hardcopy_location",
        "backup_location",
        "scientific_outputs",
    ],
}

# Required keys that must be present in every mock context
REQUIRED_CONTEXT_KEYS = [
    "rte_css_path",
    "prince_css_path",
    "fonts_folder_path",
    "dbca_image_path",
    "dbca_cropped_image_path",
    "no_image_path",
    "dbca_logo_path",
    "bcs_logo_path",
    "base_url",
    "server_url",
    "frontend_url",
    "project_title",
    "project_id",
    "project_tag",
    "project_status",
    "project_kind",
    "business_area_name",
    "division_name",
    "team_as_string",
    "document_kind_string",
    "document_kind_url",
    "current_date_time_string",
    "financial_year_string",
    "project_lead_approval",
    "business_area_lead_approval",
    "directorate_approval",
    "html_data_items",
    "methodology_image",
    "project_image_path",
]


class TestBuildMockContext:
    """Tests for TestPDFService._build_mock_context()."""

    @pytest.mark.parametrize("document_kind", VALID_DOCUMENT_KINDS)
    def test_context_has_all_required_keys(self, document_kind):
        """Mock context contains every required key for each document kind."""
        context = TestPDFService._build_mock_context(document_kind)
        missing = [key for key in REQUIRED_CONTEXT_KEYS if key not in context]
        assert not missing, f"Missing keys for {document_kind}: {missing}"

    @pytest.mark.parametrize("document_kind", VALID_DOCUMENT_KINDS)
    def test_context_has_non_empty_html_data_items(self, document_kind):
        """Mock context has non-empty html_data_items for each document kind."""
        context = TestPDFService._build_mock_context(document_kind)
        items = context["html_data_items"]
        assert isinstance(items, dict)
        assert len(items) > 0, f"html_data_items is empty for {document_kind}"

    @pytest.mark.parametrize("document_kind", VALID_DOCUMENT_KINDS)
    def test_html_data_items_have_title_and_data(self, document_kind):
        """Every html_data_items entry has both 'title' and 'data' keys."""
        context = TestPDFService._build_mock_context(document_kind)
        for section_key, section in context["html_data_items"].items():
            assert (
                "title" in section
            ), f"Missing 'title' in {document_kind}.{section_key}"
            assert "data" in section, f"Missing 'data' in {document_kind}.{section_key}"
            assert section["title"], f"Empty 'title' in {document_kind}.{section_key}"
            assert section["data"], f"Empty 'data' in {document_kind}.{section_key}"

    @pytest.mark.parametrize("document_kind", VALID_DOCUMENT_KINDS)
    def test_correct_sections_per_document_kind(self, document_kind):
        """Each document kind has exactly the expected sections."""
        context = TestPDFService._build_mock_context(document_kind)
        actual_keys = set(context["html_data_items"].keys())
        expected_keys = set(EXPECTED_SECTIONS[document_kind])
        assert actual_keys == expected_keys, (
            f"Section mismatch for {document_kind}: "
            f"extra={actual_keys - expected_keys}, "
            f"missing={expected_keys - actual_keys}"
        )

    @pytest.mark.parametrize("document_kind", VALID_DOCUMENT_KINDS)
    def test_correct_document_kind_string(self, document_kind):
        """Mock context has the correct document_kind_string for each kind."""
        context = TestPDFService._build_mock_context(document_kind)
        expected = DOCUMENT_KIND_MAP[document_kind]["kind_string"]
        assert context["document_kind_string"] == expected

    def test_progress_report_has_financial_year(self):
        """Progress report mock includes a non-empty financial_year_string."""
        context = TestPDFService._build_mock_context("progressreport")
        assert context["financial_year_string"] != ""

    def test_student_report_has_financial_year(self):
        """Student report mock includes a non-empty financial_year_string."""
        context = TestPDFService._build_mock_context("studentreport")
        assert context["financial_year_string"] != ""

    def test_concept_plan_has_empty_financial_year(self):
        """Concept plan mock has an empty financial_year_string."""
        context = TestPDFService._build_mock_context("concept")
        assert context["financial_year_string"] == ""

    def test_approvals_have_mixed_values(self):
        """At least one approval is True and one is False."""
        context = TestPDFService._build_mock_context("concept")
        approvals = [
            context["project_lead_approval"],
            context["business_area_lead_approval"],
            context["directorate_approval"],
        ]
        assert any(approvals), "Expected at least one True approval"
        assert not all(approvals), "Expected at least one False approval"

    def test_project_plan_related_projects_lists_linked_projects(self):
        """The preview shows linked projects as a list, then legacy free text."""
        context = TestPDFService._build_mock_context("projectplan")
        data = context["html_data_items"]["related_projects"]["data"]

        assert data.count("<li") == 2
        assert "SP-2024-3 &ndash;" in data
        assert data.index("</ul>") < data.index("<p")

    def test_invalid_document_kind_raises_value_error(self):
        """Invalid document kind raises ValueError."""
        with pytest.raises(ValueError, match="Invalid document_kind"):
            TestPDFService._build_mock_context("invalid_kind")

    def test_empty_string_raises_value_error(self):
        """Empty string raises ValueError."""
        with pytest.raises(ValueError, match="Invalid document_kind"):
            TestPDFService._build_mock_context("")

    @pytest.mark.parametrize("document_kind", VALID_DOCUMENT_KINDS)
    def test_string_context_values_are_non_empty(self, document_kind):
        """Key string values in the context are non-empty."""
        context = TestPDFService._build_mock_context(document_kind)
        non_empty_keys = [
            "project_title",
            "project_tag",
            "team_as_string",
            "business_area_name",
            "division_name",
            "document_kind_string",
            "current_date_time_string",
            "rte_css_path",
            "prince_css_path",
            "base_url",
            "no_image_path",
        ]
        for key in non_empty_keys:
            assert context[
                key
            ], f"Expected non-empty value for '{key}' ({document_kind})"


# ---------------------------------------------------------------------------
# Endpoint tests for TestPDFGeneration view
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTestPDFGenerationEndpoint:
    """Tests for the POST documents/test-pdf endpoint."""

    ENDPOINT = "/api/v1/documents/test-pdf"

    def test_invalid_document_kind_returns_400(self, api_client, superuser):
        """Endpoint returns 400 for an invalid document_kind."""
        api_client.force_authenticate(user=superuser)
        response = api_client.post(
            self.ENDPOINT,
            {"document_kind": "not_a_real_kind"},
            format="json",
        )
        assert response.status_code == 400
        assert "error" in response.json()

    def test_missing_document_kind_returns_400(self, api_client, superuser):
        """Endpoint returns 400 when document_kind is missing."""
        api_client.force_authenticate(user=superuser)
        response = api_client.post(self.ENDPOINT, {}, format="json")
        assert response.status_code == 400
        assert "error" in response.json()

    def test_non_admin_user_gets_403(self, api_client, db):
        """Non-admin (non-staff) user receives 403."""
        from common.tests.factories import UserFactory

        regular_user = UserFactory(
            username="regular",
            email="regular@example.com",
            is_staff=False,
            is_superuser=False,
        )
        api_client.force_authenticate(user=regular_user)
        response = api_client.post(
            self.ENDPOINT,
            {"document_kind": "concept"},
            format="json",
        )
        assert response.status_code == 403

    def test_unauthenticated_request_gets_403(self, api_client):
        """Unauthenticated request receives 403."""
        response = api_client.post(
            self.ENDPOINT,
            {"document_kind": "concept"},
            format="json",
        )
        assert response.status_code in (401, 403)
