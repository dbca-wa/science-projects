"""
Tests for the match_related_projects management command.
"""

import csv
from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from common.tests.factories import ProjectFactory, UserFactory
from documents.models import ProjectPlan, ProjectPlanRelatedProject
from documents.tests.factories import ProjectPlanFactory

Status = ProjectPlanRelatedProject.StatusChoices
Source = ProjectPlanRelatedProject.SourceChoices

LEGACY_TEXT = (
    "<p>SPP 2006-003 Forestcheck</p>"
    "<p>Ravensthorpe Range survey</p>"
    "<p>SPP 1993/042 (an old project not in SPMS)</p>"
)


@pytest.fixture
def projects(db):
    return {
        "forestcheck": ProjectFactory(
            kind="science", year=2006, number=3, title="Forestcheck monitoring"
        ),
        "ravensthorpe": ProjectFactory(
            kind="science",
            year=2007,
            number=6,
            title="Biological survey of the Ravensthorpe Range",
        ),
        "other": ProjectFactory(
            kind="science", year=2015, number=40, title="Unrelated wetland mapping"
        ),
    }


@pytest.fixture
def plan(db, projects):
    return ProjectPlanFactory(
        document__project=ProjectFactory(year=2020, number=99),
        related_projects=LEGACY_TEXT,
    )


def run(*args):
    out = StringIO()
    call_command("match_related_projects", *args, stdout=out, stderr=StringIO())
    return out.getvalue()


def legacy_texts():
    return dict(ProjectPlan.objects.values_list("pk", "related_projects"))


@pytest.mark.django_db
class TestDryRun:
    def test_makes_no_changes(self, plan):
        output = run()

        assert "Dry run" in output
        assert "linked: 1" in output
        assert "suggested: 1" in output
        assert "unresolved: 1" in output
        assert not ProjectPlanRelatedProject.objects.exists()

    def test_writes_a_report(self, plan, projects, tmp_path):
        report = tmp_path / "report.csv"

        run("--report", str(report))

        with open(report, newline="", encoding="utf-8") as report_file:
            rows = list(csv.DictReader(report_file))
        assert list(rows[0].keys()) == [
            "plan_id",
            "plan_project_tag",
            "matched_text",
            "match_type",
            "outcome",
            "project_id",
            "project_tag",
            "project_title",
        ]
        linked = next(row for row in rows if row["outcome"] == "linked")
        assert linked["plan_id"] == str(plan.pk)
        assert linked["plan_project_tag"] == "SP-2020-99"
        assert linked["matched_text"] == "SPP 2006-003"
        assert linked["project_tag"] == "SP-2006-3"
        assert linked["project_title"] == "Forestcheck monitoring"


@pytest.mark.django_db
class TestApply:
    def test_creates_links_and_suggestions(self, plan, projects):
        run("--apply")

        linked = ProjectPlanRelatedProject.objects.get(
            related_project=projects["forestcheck"]
        )
        assert linked.status == Status.LINKED
        assert linked.source == Source.SCRIPT
        assert linked.match_type == "code"
        assert linked.matched_text == "SPP 2006-003"
        assert linked.created_by is None
        assert linked.status_changed_by is None

        suggested = ProjectPlanRelatedProject.objects.get(
            related_project=projects["ravensthorpe"]
        )
        assert suggested.status == Status.SUGGESTED
        assert suggested.match_type == "title"
        assert suggested.matched_text == "Ravensthorpe Range survey"

    def test_running_again_changes_nothing(self, plan):
        run("--apply")
        before = list(
            ProjectPlanRelatedProject.objects.order_by("pk").values_list(
                "pk", "status", "updated_at"
            )
        )

        output = run("--apply")

        after = list(
            ProjectPlanRelatedProject.objects.order_by("pk").values_list(
                "pk", "status", "updated_at"
            )
        )
        assert after == before
        # The code is reported as existing; title matches for projects that
        # already have a row are not reported at all
        assert "existing: 1" in output
        assert "linked:" not in output
        assert "suggested:" not in output

    def test_dismissed_and_manual_rows_are_left_alone(self, plan, projects):
        person = UserFactory()
        dismissed = ProjectPlanRelatedProject.objects.create(
            project_plan=plan,
            related_project=projects["forestcheck"],
            status=Status.DISMISSED,
            source=Source.SCRIPT,
            status_changed_by=person,
        )
        manual = ProjectPlanRelatedProject.objects.create(
            project_plan=plan,
            related_project=projects["other"],
            created_by=person,
            status_changed_by=person,
        )

        run("--apply")

        dismissed.refresh_from_db()
        manual.refresh_from_db()
        assert dismissed.status == Status.DISMISSED
        assert manual.status == Status.LINKED
        assert manual.source == Source.MANUAL

    def test_plan_option_limits_the_run(self, plan, projects):
        other_plan = ProjectPlanFactory(related_projects="<p>SPP 2015-040</p>")

        run("--apply", "--plan", str(other_plan.pk))

        assert list(
            ProjectPlanRelatedProject.objects.values_list(
                "project_plan_id", "related_project_id"
            )
        ) == [(other_plan.pk, projects["other"].pk)]

    def test_unknown_plan_is_an_error(self, plan):
        with pytest.raises(CommandError):
            run("--plan", "999999")


@pytest.mark.django_db
class TestUndo:
    def test_deletes_only_untouched_script_rows(self, plan, projects):
        run("--apply")
        person = UserFactory()
        # A person accepts the suggestion
        accepted = ProjectPlanRelatedProject.objects.get(
            related_project=projects["ravensthorpe"]
        )
        accepted.status = Status.LINKED
        accepted.status_changed_by = person
        accepted.save()
        manual = ProjectPlanRelatedProject.objects.create(
            project_plan=plan, related_project=projects["other"], created_by=person
        )

        run("--undo")

        assert set(ProjectPlanRelatedProject.objects.values_list("pk", flat=True)) == {
            accepted.pk,
            manual.pk,
        }

    def test_cannot_be_combined_with_apply(self, plan):
        with pytest.raises(CommandError):
            run("--apply", "--undo")


@pytest.mark.django_db
def test_legacy_text_is_unchanged_in_every_mode(plan):
    ProjectPlanFactory(related_projects="<p>SPP 2015-040 &amp; notes</p>")
    before = legacy_texts()

    run()
    assert legacy_texts() == before
    run("--apply")
    assert legacy_texts() == before
    run("--undo")
    assert legacy_texts() == before
