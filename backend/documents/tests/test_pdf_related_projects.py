"""
Tests for the Related Projects section of the project plan PDF.
"""

import pytest

from common.tests.factories import ProjectFactory
from documents.models import ProjectPlanRelatedProject
from documents.services.related_project_service import RelatedProjectService
from documents.tests.factories import ProjectPlanFactory

Status = ProjectPlanRelatedProject.StatusChoices


def build(plan):
    return RelatedProjectService.build_pdf_html(plan, plan.related_projects)


@pytest.mark.django_db
class TestBuildPdfHtml:
    def test_links_only(self):
        plan = ProjectPlanFactory(related_projects="<p></p>")
        ProjectPlanRelatedProject.objects.create(
            project_plan=plan,
            related_project=ProjectFactory(
                kind="science",
                year=2022,
                number=33,
                title="<p>Ellen Brook &amp; catchment</p>",
            ),
        )

        assert (
            build(plan)
            == "<ul><li>SP-2022-33 &ndash; Ellen Brook &amp; catchment</li></ul>"
        )

    def test_legacy_text_only(self):
        plan = ProjectPlanFactory(related_projects="<p>SPP 2006-003 Forestcheck</p>")

        assert build(plan) == "<p>SPP 2006-003 Forestcheck</p>"

    def test_links_then_legacy_text(self):
        plan = ProjectPlanFactory(related_projects="<p>Earlier notes</p>")
        ProjectPlanRelatedProject.objects.create(
            project_plan=plan,
            related_project=ProjectFactory(
                kind="student", year=2019, number=4, title="Thesis"
            ),
        )

        assert (
            build(plan)
            == "<ul><li>STP-2019-4 &ndash; Thesis</li></ul><p>Earlier notes</p>"
        )

    def test_nothing_to_show(self):
        plan = ProjectPlanFactory(related_projects="<p><br></p>")

        assert build(plan) == ""

    def test_suggestions_and_dismissed_rows_are_not_printed(self):
        plan = ProjectPlanFactory(related_projects="")
        for status in (Status.SUGGESTED, Status.DISMISSED):
            ProjectPlanRelatedProject.objects.create(
                project_plan=plan, related_project=ProjectFactory(), status=status
            )

        assert build(plan) == ""

    def test_project_titles_are_escaped(self):
        plan = ProjectPlanFactory(related_projects="")
        ProjectPlanRelatedProject.objects.create(
            project_plan=plan,
            related_project=ProjectFactory(
                kind="science",
                year=2020,
                number=1,
                title="&lt;script&gt;x&lt;/script&gt;",
            ),
        )

        assert "<script>" not in build(plan)
