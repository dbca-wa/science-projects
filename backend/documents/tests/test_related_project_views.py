"""
Tests for the project plan related projects API.

The list stays editable when a plan is locked; only who may edit the plan's
project (CanEditProject) decides access.
"""

from unittest.mock import patch

import pytest
from django.conf import settings
from rest_framework.test import APIClient

from caretakers.models import Caretaker
from common.tests.factories import BusinessAreaFactory, ProjectFactory, UserFactory
from documents.models import ProjectPlanRelatedProject
from documents.tests.factories import ProgressReportFactory, ProjectPlanFactory

Status = ProjectPlanRelatedProject.StatusChoices
Source = ProjectPlanRelatedProject.SourceChoices


@pytest.fixture
def leader(db):
    return UserFactory()


@pytest.fixture
def ba_leader(db):
    return UserFactory()


@pytest.fixture
def plan(db, leader, ba_leader):
    # members=[] stops the factory adding its own default leader
    project = ProjectFactory(
        business_area=BusinessAreaFactory(leader=ba_leader), members=[]
    )
    project.members.create(user=leader, is_leader=True, role="supervising")
    return ProjectPlanFactory(
        document__project=project,
        related_projects="<p>SPP 2006-003 Forestcheck</p>",
    )


@pytest.fixture
def other_project(db):
    return ProjectFactory(title="Forestcheck: integrated forest monitoring")


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def list_url(plan):
    return f"/api/v1/documents/projectplans/{plan.pk}/related_projects"


def detail_url(plan, row):
    return f"/api/v1/documents/projectplans/{plan.pk}/related_projects/{row.pk}"


@pytest.mark.django_db
class TestAddRelatedProject:
    def test_team_member_adds_a_project(self, plan, leader, other_project):
        response = client_for(leader).post(
            list_url(plan), {"related_project": other_project.pk}, format="json"
        )

        assert response.status_code == 201
        assert response.data["status"] == Status.LINKED
        assert response.data["source"] == Source.MANUAL
        assert response.data["related_project"]["id"] == other_project.pk
        assert (
            response.data["related_project"]["tag"] == other_project.get_project_tag()
        )
        row = ProjectPlanRelatedProject.objects.get()
        assert row.created_by == leader
        assert row.status_changed_by == leader

    def test_rejects_the_plans_own_project(self, plan, leader):
        response = client_for(leader).post(
            list_url(plan), {"related_project": plan.project_id}, format="json"
        )

        assert response.status_code == 400
        assert "related_project" in response.data
        assert not ProjectPlanRelatedProject.objects.exists()

    def test_rejects_a_project_already_in_the_list(self, plan, leader, other_project):
        ProjectPlanRelatedProject.objects.create(
            project_plan=plan, related_project=other_project
        )

        response = client_for(leader).post(
            list_url(plan), {"related_project": other_project.pk}, format="json"
        )

        assert response.status_code == 400
        assert ProjectPlanRelatedProject.objects.count() == 1

    def test_rejects_an_unknown_project(self, plan, leader):
        response = client_for(leader).post(
            list_url(plan), {"related_project": 999999}, format="json"
        )

        assert response.status_code == 400

    def test_accepts_a_suggestion(self, plan, leader, other_project):
        row = ProjectPlanRelatedProject.objects.create(
            project_plan=plan,
            related_project=other_project,
            status=Status.SUGGESTED,
            source=Source.SCRIPT,
            match_type="title",
            matched_text="Forestcheck",
        )

        response = client_for(leader).post(
            list_url(plan), {"related_project": other_project.pk}, format="json"
        )

        assert response.status_code == 200
        row.refresh_from_db()
        assert row.status == Status.LINKED
        assert row.source == Source.SCRIPT
        assert row.status_changed_by == leader

    def test_re_adds_a_removed_project(self, plan, leader, other_project):
        row = ProjectPlanRelatedProject.objects.create(
            project_plan=plan, related_project=other_project, status=Status.DISMISSED
        )

        response = client_for(leader).post(
            list_url(plan), {"related_project": other_project.pk}, format="json"
        )

        assert response.status_code == 200
        row.refresh_from_db()
        assert row.status == Status.LINKED

    def test_unknown_plan_is_not_found(self, leader, other_project):
        response = client_for(leader).post(
            "/api/v1/documents/projectplans/999999/related_projects",
            {"related_project": other_project.pk},
            format="json",
        )

        assert response.status_code == 404

    def test_never_changes_the_legacy_text(self, plan, leader, other_project):
        client_for(leader).post(
            list_url(plan), {"related_project": other_project.pk}, format="json"
        )

        plan.refresh_from_db()
        assert plan.related_projects == "<p>SPP 2006-003 Forestcheck</p>"


@pytest.mark.django_db
class TestRemoveRelatedProject:
    def test_removing_a_link_keeps_it_as_dismissed(self, plan, leader, other_project):
        row = ProjectPlanRelatedProject.objects.create(
            project_plan=plan, related_project=other_project
        )

        response = client_for(leader).delete(detail_url(plan, row))

        assert response.status_code == 204
        row.refresh_from_db()
        assert row.status == Status.DISMISSED
        assert row.status_changed_by == leader

    def test_dismissing_a_suggestion(self, plan, leader, other_project):
        row = ProjectPlanRelatedProject.objects.create(
            project_plan=plan,
            related_project=other_project,
            status=Status.SUGGESTED,
            source=Source.SCRIPT,
        )

        response = client_for(leader).delete(detail_url(plan, row))

        assert response.status_code == 204
        row.refresh_from_db()
        assert row.status == Status.DISMISSED

    def test_already_dismissed_is_not_found(self, plan, leader, other_project):
        row = ProjectPlanRelatedProject.objects.create(
            project_plan=plan, related_project=other_project, status=Status.DISMISSED
        )

        response = client_for(leader).delete(detail_url(plan, row))

        assert response.status_code == 404

    def test_row_on_another_plan_is_not_found(self, plan, leader, other_project):
        other_plan = ProjectPlanFactory()
        row = ProjectPlanRelatedProject.objects.create(
            project_plan=other_plan, related_project=other_project
        )

        response = client_for(leader).delete(detail_url(plan, row))

        assert response.status_code == 404
        row.refresh_from_db()
        assert row.status == Status.LINKED


@pytest.mark.django_db
class TestRelatedProjectPermissions:
    def add(self, user, plan, project):
        return client_for(user).post(
            list_url(plan), {"related_project": project.pk}, format="json"
        )

    def test_business_area_leader_may_edit(self, plan, ba_leader, other_project):
        assert self.add(ba_leader, plan, other_project).status_code == 201

    def test_caretaker_of_the_project_leader_may_edit(
        self, plan, leader, other_project
    ):
        caretaker = UserFactory()
        Caretaker.objects.create(user=leader, caretaker=caretaker)

        assert self.add(caretaker, plan, other_project).status_code == 201

    def test_superuser_may_edit(self, plan, other_project):
        superuser = UserFactory(is_superuser=True, is_staff=True)

        assert self.add(superuser, plan, other_project).status_code == 201

    def test_unrelated_user_is_forbidden(self, plan, other_project):
        response = self.add(UserFactory(), plan, other_project)

        assert response.status_code == 403
        assert "related projects" in response.data["detail"]
        assert not ProjectPlanRelatedProject.objects.exists()

    def test_unrelated_user_cannot_remove(self, plan, other_project):
        row = ProjectPlanRelatedProject.objects.create(
            project_plan=plan, related_project=other_project
        )

        response = client_for(UserFactory()).delete(detail_url(plan, row))

        assert response.status_code == 403
        row.refresh_from_db()
        assert row.status == Status.LINKED

    def test_unauthenticated_request_is_rejected(self, plan, other_project):
        response = APIClient().post(
            list_url(plan), {"related_project": other_project.pk}, format="json"
        )

        assert response.status_code in (401, 403)

    def test_team_member_may_edit_a_locked_plan(self, plan, leader, other_project):
        # Fully approved, with a progress report: locked for content editing
        document = plan.document
        document.project_lead_approval_granted = True
        document.business_area_lead_approval_granted = True
        document.directorate_approval_granted = True
        document.status = "approved"
        document.save()
        ProgressReportFactory(project=plan.project)

        added = self.add(leader, plan, other_project)
        row = ProjectPlanRelatedProject.objects.get()
        removed = client_for(leader).delete(detail_url(plan, row))

        assert added.status_code == 201
        assert removed.status_code == 204


def legacy_text_url(plan):
    return f"/api/v1/documents/projectplans/{plan.pk}/related_projects/legacy_text"


def lock(plan):
    """Fully approve the plan and add a progress report, locking its content"""
    document = plan.document
    document.project_lead_approval_granted = True
    document.business_area_lead_approval_granted = True
    document.directorate_approval_granted = True
    document.status = "approved"
    document.save()
    ProgressReportFactory(project=plan.project)


@pytest.mark.django_db
class TestClearLegacyText:
    def test_team_member_clears_the_legacy_text(self, plan, leader):
        response = client_for(leader).delete(legacy_text_url(plan))

        assert response.status_code == 204
        plan.refresh_from_db()
        assert plan.related_projects == ""

    def test_list_and_suggestions_are_unchanged(self, plan, leader, other_project):
        link = ProjectPlanRelatedProject.objects.create(
            project_plan=plan, related_project=other_project
        )
        suggestion = ProjectPlanRelatedProject.objects.create(
            project_plan=plan,
            related_project=ProjectFactory(),
            status=Status.SUGGESTED,
            source=Source.SCRIPT,
        )

        client_for(leader).delete(legacy_text_url(plan))

        link.refresh_from_db()
        suggestion.refresh_from_db()
        assert link.status == Status.LINKED
        assert suggestion.status == Status.SUGGESTED

    def test_other_plan_text_is_unchanged(self, plan, leader):
        plan.background = "<p>Background</p>"
        plan.aims = "<p>Aims</p>"
        plan.save()

        client_for(leader).delete(legacy_text_url(plan))

        plan.refresh_from_db()
        assert plan.background == "<p>Background</p>"
        assert plan.aims == "<p>Aims</p>"

    def test_clearing_empty_text_succeeds(self, plan, leader):
        plan.related_projects = None
        plan.save()

        first = client_for(leader).delete(legacy_text_url(plan))
        second = client_for(leader).delete(legacy_text_url(plan))

        assert (first.status_code, second.status_code) == (204, 204)
        plan.refresh_from_db()
        assert plan.related_projects is None

    def test_team_member_may_clear_a_locked_plan(self, plan, leader):
        lock(plan)

        response = client_for(leader).delete(legacy_text_url(plan))

        assert response.status_code == 204
        plan.refresh_from_db()
        assert plan.related_projects == ""

    def test_unrelated_user_is_forbidden(self, plan):
        response = client_for(UserFactory()).delete(legacy_text_url(plan))

        assert response.status_code == 403
        assert "related projects" in response.data["detail"]
        plan.refresh_from_db()
        assert plan.related_projects == "<p>SPP 2006-003 Forestcheck</p>"

    def test_unauthenticated_request_is_rejected(self, plan):
        response = APIClient().delete(legacy_text_url(plan))

        assert response.status_code in (401, 403)
        plan.refresh_from_db()
        assert plan.related_projects == "<p>SPP 2006-003 Forestcheck</p>"

    def test_unknown_plan_is_not_found(self, leader):
        response = client_for(leader).delete(
            "/api/v1/documents/projectplans/999999/related_projects/legacy_text"
        )

        assert response.status_code == 404

    def test_only_delete_is_allowed(self, plan, leader):
        response = client_for(leader).post(legacy_text_url(plan), {}, format="json")

        assert response.status_code == 405
        plan.refresh_from_db()
        assert plan.related_projects == "<p>SPP 2006-003 Forestcheck</p>"

    def test_cleared_text_is_logged_in_full(self, plan, leader):
        with patch.object(settings, "LOGGER") as logger:
            client_for(leader).delete(legacy_text_url(plan))

        messages = [call.args[0] for call in logger.info.call_args_list]
        assert any(
            f"project plan {plan.pk}" in message
            and "<p>SPP 2006-003 Forestcheck</p>" in message
            for message in messages
        )
