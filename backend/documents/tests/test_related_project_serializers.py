"""
Tests for how a project plan's related projects are serialised.
"""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from common.tests.factories import ProjectFactory, UserFactory
from documents.models import ProjectPlanRelatedProject
from documents.serializers import (
    ProjectPlanSerializer,
    TinyProjectPlanSerializer,
    TinyProjectPlanWithRelatedProjectsSerializer,
)
from documents.tests.factories import ProjectPlanFactory

Status = ProjectPlanRelatedProject.StatusChoices


def add_row(plan, project, status=Status.LINKED, **extra):
    return ProjectPlanRelatedProject.objects.create(
        project_plan=plan, related_project=project, status=status, **extra
    )


@pytest.fixture
def superuser_client(db):
    client = APIClient()
    client.force_authenticate(user=UserFactory(is_superuser=True, is_staff=True))
    return client


@pytest.mark.django_db
class TestRelatedProjectsFields:
    def test_links_and_suggestions_are_separate_and_dismissed_is_hidden(self):
        plan = ProjectPlanFactory()
        linked = add_row(plan, ProjectFactory())
        suggested = add_row(
            plan,
            ProjectFactory(),
            status=Status.SUGGESTED,
            source="script",
            match_type="title",
            matched_text="Pilbara Biological Survey",
        )
        add_row(plan, ProjectFactory(), status=Status.DISMISSED)

        data = ProjectPlanSerializer(plan).data

        assert [item["id"] for item in data["related_project_links"]] == [linked.pk]
        assert [item["id"] for item in data["related_project_suggestions"]] == [
            suggested.pk
        ]
        suggestion = data["related_project_suggestions"][0]
        assert suggestion["matched_text"] == "Pilbara Biological Survey"
        assert suggestion["match_type"] == "title"
        assert suggestion["source"] == "script"

    def test_linked_projects_are_ordered_newest_year_then_number(self):
        plan = ProjectPlanFactory()
        older = add_row(plan, ProjectFactory(year=2010, number=5))
        newer_high = add_row(plan, ProjectFactory(year=2020, number=9))
        newer_low = add_row(plan, ProjectFactory(year=2020, number=2))

        data = TinyProjectPlanWithRelatedProjectsSerializer(plan).data

        assert [item["id"] for item in data["related_project_links"]] == [
            newer_low.pk,
            newer_high.pk,
            older.pk,
        ]

    def test_summary_includes_tag_and_leader_name(self):
        plan = ProjectPlanFactory()
        leader = UserFactory(display_first_name="Jo", display_last_name="Citizen")
        project = ProjectFactory(kind="science", year=2022, number=33, members=[])
        project.members.create(user=leader, is_leader=True, role="supervising")
        add_row(plan, project)

        summary = ProjectPlanSerializer(plan).data["related_project_links"][0][
            "related_project"
        ]

        assert summary["tag"] == "SP-2022-33"
        assert summary["leader"] == "Jo Citizen"
        assert summary["kind"] == "science"

    def test_leader_is_none_without_a_leader(self):
        plan = ProjectPlanFactory()
        add_row(plan, ProjectFactory(members=[]))

        summary = ProjectPlanSerializer(plan).data["related_project_links"][0][
            "related_project"
        ]

        assert summary["leader"] is None

    def test_list_serializer_is_unchanged(self):
        # Used for lists of plans, so it must not run per-plan queries
        assert "related_project_links" not in TinyProjectPlanSerializer.Meta.fields


@pytest.mark.django_db
class TestRelatedProjectsInEndpoints:
    def test_project_detail_includes_links_and_suggestions(self, superuser_client):
        plan = ProjectPlanFactory()
        linked = add_row(plan, ProjectFactory())
        suggested = add_row(plan, ProjectFactory(), status=Status.SUGGESTED)

        response = superuser_client.get(f"/api/v1/projects/{plan.project_id}")

        assert response.status_code == 200
        project_plan = response.data["documents"]["project_plan"]
        assert [item["id"] for item in project_plan["related_project_links"]] == [
            linked.pk
        ]
        assert [item["id"] for item in project_plan["related_project_suggestions"]] == [
            suggested.pk
        ]
        # The legacy text is still returned for existing clients
        assert "related_projects" in project_plan

    @pytest.mark.parametrize(
        "url",
        [
            "/api/v1/documents/projectplans/{plan_pk}",
            "/api/v1/projects/{project_pk}",
        ],
    )
    def test_query_count_does_not_grow_with_the_number_of_rows(
        self, superuser_client, url
    ):
        def count_queries(row_count):
            plan = ProjectPlanFactory()
            for _ in range(row_count):
                project = ProjectFactory()
                add_row(plan, project)
            with CaptureQueriesContext(connection) as queries:
                response = superuser_client.get(
                    url.format(plan_pk=plan.pk, project_pk=plan.project_id)
                )
            assert response.status_code == 200
            return len(queries.captured_queries)

        assert count_queries(1) == count_queries(5)
