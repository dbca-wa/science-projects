"""
Tests for the ProjectPlanRelatedProject model and its migration.
"""

import importlib

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from common.tests.factories import ProjectFactory
from documents.models import ProjectPlanRelatedProject
from documents.tests.factories import ProjectPlanFactory

Status = ProjectPlanRelatedProject.StatusChoices


@pytest.mark.django_db
class TestProjectPlanRelatedProject:
    def test_defaults_to_a_manual_link(self):
        plan = ProjectPlanFactory()
        row = ProjectPlanRelatedProject.objects.create(
            project_plan=plan, related_project=ProjectFactory()
        )

        assert row.status == Status.LINKED
        assert row.source == ProjectPlanRelatedProject.SourceChoices.MANUAL
        assert row.match_type == ""
        assert row.matched_text == ""

    def test_one_row_per_plan_and_project(self):
        plan = ProjectPlanFactory()
        project = ProjectFactory()
        ProjectPlanRelatedProject.objects.create(
            project_plan=plan, related_project=project
        )

        with pytest.raises(IntegrityError), transaction.atomic():
            ProjectPlanRelatedProject.objects.create(
                project_plan=plan, related_project=project, status=Status.SUGGESTED
            )

    def test_clean_rejects_the_plans_own_project(self):
        plan = ProjectPlanFactory()
        row = ProjectPlanRelatedProject(project_plan=plan, related_project=plan.project)

        with pytest.raises(ValidationError) as error:
            row.full_clean()

        assert "related_project" in error.value.message_dict

    def test_deleting_the_related_project_deletes_its_rows(self):
        plan = ProjectPlanFactory(related_projects="<p>SPP 2006-003</p>")
        project = ProjectFactory()
        ProjectPlanRelatedProject.objects.create(
            project_plan=plan, related_project=project
        )

        project.delete()

        assert not ProjectPlanRelatedProject.objects.exists()
        plan.refresh_from_db()
        assert plan.related_projects == "<p>SPP 2006-003</p>"

    def test_deleting_the_plan_deletes_its_rows(self):
        plan = ProjectPlanFactory()
        project = ProjectFactory()
        ProjectPlanRelatedProject.objects.create(
            project_plan=plan, related_project=project
        )

        plan.delete()

        assert not ProjectPlanRelatedProject.objects.exists()
        assert type(project).objects.filter(pk=project.pk).exists()


def test_migration_only_creates_the_new_table():
    migration = importlib.import_module(
        "documents.migrations.0017_projectplanrelatedproject"
    ).Migration

    operation_names = [type(operation).__name__ for operation in migration.operations]
    assert operation_names == ["CreateModel"]
    assert migration.operations[0].name == "ProjectPlanRelatedProject"
    # Nothing in the migration touches the project plan table or its text
    assert all(
        getattr(operation, "model_name", "") != "projectplan"
        for operation in migration.operations
    )
