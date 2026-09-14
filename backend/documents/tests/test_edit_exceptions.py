"""
Tests for the document edit exception feature.

Covers the model, the service, the content-edit permission helper, the
admin-only management endpoints, and enforcement on the rich text save paths.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from common.tests.factories import (
    BusinessAreaFactory,
    ProjectFactory,
    UserFactory,
)
from documents.models import DocumentEditException
from documents.permissions import (
    can_edit_document_content,
    is_document_locked,
    strip_protected_fields,
)
from documents.services.edit_exception_service import EditExceptionService

from .factories import ProjectDocumentFactory, ProjectPlanFactory


def _approve(document):
    """Mark a document as fully approved (locked)."""
    document.status = "approved"
    document.project_lead_approval_granted = True
    document.business_area_lead_approval_granted = True
    document.directorate_approval_granted = True
    document.save()
    return document


@pytest.fixture
def locked_project_plan(db):
    """A fully approved (locked) project plan with a lead and BA leader."""
    ba_leader = UserFactory(username="ba_leader_edit_exc")
    business_area = BusinessAreaFactory(leader=ba_leader)
    project = ProjectFactory(business_area=business_area)
    lead = UserFactory(username="lead_edit_exc")
    project.members.create(user=lead, is_leader=True, role="supervising")
    plan = ProjectPlanFactory(document__project=project, project=project)
    _approve(plan.document)
    return {
        "plan": plan,
        "document": plan.document,
        "project": project,
        "lead": lead,
        "ba_leader": ba_leader,
    }


# region ================== Model ==================


@pytest.mark.django_db
class TestDocumentEditExceptionModel:
    def test_is_active_true_when_future(self, locked_project_plan):
        exc = DocumentEditException.objects.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            expires_at=timezone.now() + timedelta(days=1),
        )
        assert exc.is_active() is True

    def test_is_active_false_when_past(self, locked_project_plan):
        exc = DocumentEditException.objects.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        assert exc.is_active() is False


# endregion


# region ================== Service ==================


@pytest.mark.django_db
class TestEditExceptionService:
    def test_eligible_users_include_team_and_ba_leader(self, locked_project_plan):
        eligible = EditExceptionService.get_eligible_users(
            locked_project_plan["document"]
        )
        ids = set(eligible.values_list("pk", flat=True))
        assert locked_project_plan["lead"].pk in ids
        assert locked_project_plan["ba_leader"].pk in ids

    def test_eligible_users_deduplicated_when_lead_is_ba_leader(self, db):
        shared = UserFactory(username="shared_lead_ba")
        business_area = BusinessAreaFactory(leader=shared)
        project = ProjectFactory(business_area=business_area)
        project.members.create(user=shared, is_leader=True, role="supervising")
        plan = ProjectPlanFactory(document__project=project, project=project)
        eligible = list(
            EditExceptionService.get_eligible_users(plan.document).values_list(
                "pk", flat=True
            )
        )
        assert eligible.count(shared.pk) == 1

    def test_eligible_users_without_ba_leader(self, db):
        # A project whose business area has no leader must still return its
        # team members without error, and must not include a None leader.
        project = ProjectFactory(business_area=BusinessAreaFactory(leader=None))
        lead = UserFactory(username="lead_no_ba")
        project.members.create(user=lead, is_leader=True, role="supervising")
        plan = ProjectPlanFactory(document__project=project, project=project)
        eligible_ids = set(
            EditExceptionService.get_eligible_users(plan.document).values_list(
                "pk", flat=True
            )
        )
        member_ids = set(project.members.values_list("user_id", flat=True))
        assert lead.pk in eligible_ids
        # Eligible set is exactly the team members (no BA leader to add).
        assert eligible_ids == member_ids
        assert None not in eligible_ids

    def test_create_default_duration_one_day(self, locked_project_plan):
        exc = EditExceptionService.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            granted_by=locked_project_plan["ba_leader"],
        )
        delta = exc.expires_at - timezone.now()
        assert timedelta(hours=23) < delta <= timedelta(days=1)

    def test_create_rejects_too_many_days(self, locked_project_plan):
        from rest_framework.exceptions import ValidationError

        with pytest.raises(ValidationError):
            EditExceptionService.create(
                document=locked_project_plan["document"],
                user=locked_project_plan["lead"],
                granted_by=locked_project_plan["ba_leader"],
                days=8,
            )

    def test_create_rejects_zero_days(self, locked_project_plan):
        from rest_framework.exceptions import ValidationError

        with pytest.raises(ValidationError):
            EditExceptionService.create(
                document=locked_project_plan["document"],
                user=locked_project_plan["lead"],
                granted_by=locked_project_plan["ba_leader"],
                days=0,
            )

    def test_create_rejects_ineligible_user(self, locked_project_plan):
        from rest_framework.exceptions import ValidationError

        outsider = UserFactory(username="outsider_edit_exc")
        with pytest.raises(ValidationError):
            EditExceptionService.create(
                document=locked_project_plan["document"],
                user=outsider,
                granted_by=locked_project_plan["ba_leader"],
            )

    def test_create_rejects_duplicate_active(self, locked_project_plan):
        from rest_framework.exceptions import ValidationError

        EditExceptionService.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            granted_by=locked_project_plan["ba_leader"],
        )
        with pytest.raises(ValidationError):
            EditExceptionService.create(
                document=locked_project_plan["document"],
                user=locked_project_plan["lead"],
                granted_by=locked_project_plan["ba_leader"],
            )

    def test_has_active_exception_purges_expired(self, locked_project_plan):
        DocumentEditException.objects.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        result = EditExceptionService.has_active_exception(
            locked_project_plan["lead"], locked_project_plan["document"]
        )
        assert result is False
        assert DocumentEditException.objects.count() == 0

    def test_list_active_purges_expired(self, locked_project_plan):
        DocumentEditException.objects.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        active = EditExceptionService.list_active(locked_project_plan["document"])
        assert active.count() == 0
        assert DocumentEditException.objects.count() == 0

    def test_extend_recomputes_expiry(self, locked_project_plan):
        exc = EditExceptionService.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            granted_by=locked_project_plan["ba_leader"],
            days=1,
        )
        EditExceptionService.extend(
            exc, granted_by=locked_project_plan["ba_leader"], days=7
        )
        delta = exc.expires_at - timezone.now()
        assert timedelta(days=6) < delta <= timedelta(days=7)

    def test_revoke_deletes(self, locked_project_plan):
        exc = EditExceptionService.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            granted_by=locked_project_plan["ba_leader"],
        )
        EditExceptionService.revoke(exc)
        assert DocumentEditException.objects.count() == 0


# endregion


# region ================== Permission helper ==================


@pytest.mark.django_db
class TestCanEditDocumentContent:
    def test_superuser_always_can_edit_locked(self, locked_project_plan):
        admin = UserFactory(username="admin_can_edit", is_superuser=True)
        assert can_edit_document_content(admin, locked_project_plan["document"])

    def test_locked_blocks_lead_without_exception(self, locked_project_plan):
        assert not can_edit_document_content(
            locked_project_plan["lead"], locked_project_plan["document"]
        )

    def test_locked_allows_lead_with_active_exception(self, locked_project_plan):
        EditExceptionService.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            granted_by=locked_project_plan["ba_leader"],
        )
        assert can_edit_document_content(
            locked_project_plan["lead"], locked_project_plan["document"]
        )

    def test_expired_exception_does_not_grant_access(self, locked_project_plan):
        DocumentEditException.objects.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        assert not can_edit_document_content(
            locked_project_plan["lead"], locked_project_plan["document"]
        )

    def test_unlocked_allows_authenticated_user(self, db):
        # The lock check is scoped to locked documents only; unlocked
        # documents preserve the existing authenticated-access behaviour.
        project = ProjectFactory()
        lead = UserFactory(username="unlocked_lead")
        project.members.create(user=lead, is_leader=True, role="supervising")
        document = ProjectDocumentFactory(project=project, status="new")
        assert can_edit_document_content(lead, document)

    def test_unlocked_does_not_block_non_member(self, db):
        # Unlocked documents are not newly restricted by this feature.
        project = ProjectFactory(business_area=BusinessAreaFactory(leader=None))
        document = ProjectDocumentFactory(project=project, status="new")
        outsider = UserFactory(username="unlocked_outsider")
        assert can_edit_document_content(outsider, document)

    def test_is_document_locked_requires_all_approvals(self, db):
        document = ProjectDocumentFactory(status="approved")
        document.project_lead_approval_granted = True
        document.business_area_lead_approval_granted = True
        document.directorate_approval_granted = False
        document.save()
        assert is_document_locked(document) is False


def test_strip_protected_fields_removes_approval_fields():
    data = {
        "background": "<p>x</p>",
        "status": "new",
        "project_lead_approval_granted": False,
        "directorate_approval_granted": False,
    }
    cleaned = strip_protected_fields(data)
    assert cleaned == {"background": "<p>x</p>"}


# endregion


# region ================== Endpoints ==================


@pytest.fixture
def api_client():
    from rest_framework.test import APIClient

    return APIClient()


@pytest.mark.django_db
class TestEditExceptionEndpoints:
    def _url(self, document):
        return f"/api/v1/documents/projectdocuments/{document.pk}/edit-exceptions"

    def test_list_requires_admin(self, api_client, locked_project_plan):
        api_client.force_authenticate(user=locked_project_plan["lead"])
        response = api_client.get(self._url(locked_project_plan["document"]))
        assert response.status_code == 403

    def test_admin_lists_eligible_users(self, api_client, locked_project_plan):
        admin = UserFactory(username="admin_list", is_superuser=True)
        api_client.force_authenticate(user=admin)
        response = api_client.get(self._url(locked_project_plan["document"]))
        assert response.status_code == 200
        eligible_ids = {u["id"] for u in response.data["eligible_users"]}
        assert locked_project_plan["lead"].pk in eligible_ids
        assert locked_project_plan["ba_leader"].pk in eligible_ids

    def test_admin_creates_exception(self, api_client, locked_project_plan):
        admin = UserFactory(username="admin_create", is_superuser=True)
        api_client.force_authenticate(user=admin)
        response = api_client.post(
            self._url(locked_project_plan["document"]),
            {"user_id": locked_project_plan["lead"].pk, "days": 3},
            format="json",
        )
        assert response.status_code == 201
        assert DocumentEditException.objects.count() == 1

    def test_non_admin_cannot_create(self, api_client, locked_project_plan):
        api_client.force_authenticate(user=locked_project_plan["lead"])
        response = api_client.post(
            self._url(locked_project_plan["document"]),
            {"user_id": locked_project_plan["lead"].pk, "days": 3},
            format="json",
        )
        assert response.status_code == 403
        assert DocumentEditException.objects.count() == 0

    def test_create_rejects_bad_duration(self, api_client, locked_project_plan):
        admin = UserFactory(username="admin_bad_days", is_superuser=True)
        api_client.force_authenticate(user=admin)
        response = api_client.post(
            self._url(locked_project_plan["document"]),
            {"user_id": locked_project_plan["lead"].pk, "days": 30},
            format="json",
        )
        assert response.status_code == 400

    def test_revoke_deletes_exception(self, api_client, locked_project_plan):
        admin = UserFactory(username="admin_revoke", is_superuser=True)
        exc = EditExceptionService.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            granted_by=admin,
        )
        api_client.force_authenticate(user=admin)
        response = api_client.delete(f"/api/v1/documents/edit-exceptions/{exc.pk}")
        assert response.status_code == 204
        assert DocumentEditException.objects.count() == 0


# endregion


# region ================== Enforcement on save paths ==================


@pytest.mark.django_db
class TestSaveEnforcement:
    def _url(self, plan):
        return f"/api/v1/documents/projectplans/{plan.pk}"

    def test_locked_plan_rejects_lead_without_exception(
        self, api_client, locked_project_plan
    ):
        api_client.force_authenticate(user=locked_project_plan["lead"])
        response = api_client.patch(
            self._url(locked_project_plan["plan"]),
            {"background": "<p>new</p>"},
            format="json",
        )
        assert response.status_code == 403

    def test_locked_plan_allows_lead_with_exception(
        self, api_client, locked_project_plan
    ):
        admin = UserFactory(username="admin_enf", is_superuser=True)
        EditExceptionService.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            granted_by=admin,
        )
        api_client.force_authenticate(user=locked_project_plan["lead"])
        response = api_client.patch(
            self._url(locked_project_plan["plan"]),
            {"background": "<p>edited under exception</p>"},
            format="json",
        )
        assert response.status_code == 200
        locked_project_plan["plan"].refresh_from_db()
        assert "edited under exception" in locked_project_plan["plan"].background

    def test_approval_fields_ignored_on_content_save(
        self, api_client, locked_project_plan
    ):
        admin = UserFactory(username="admin_strip", is_superuser=True)
        api_client.force_authenticate(user=admin)
        response = api_client.patch(
            self._url(locked_project_plan["plan"]),
            {
                "background": "<p>admin edit</p>",
                "status": "new",
                "directorate_approval_granted": False,
            },
            format="json",
        )
        assert response.status_code == 200
        locked_project_plan["document"].refresh_from_db()
        assert locked_project_plan["document"].status == "approved"
        assert locked_project_plan["document"].directorate_approval_granted is True


# endregion


# region ================== Enforcement across all document types ==================


def _lock_document(document):
    document.status = "approved"
    document.project_lead_approval_granted = True
    document.business_area_lead_approval_granted = True
    document.directorate_approval_granted = True
    document.save()


@pytest.fixture
def project_with_members(db):
    """A project with a lead member and a business area leader."""
    ba_leader = UserFactory(username="ba_leader_multi")
    business_area = BusinessAreaFactory(leader=ba_leader)
    project = ProjectFactory(business_area=business_area)
    lead = UserFactory(username="lead_multi")
    project.members.create(user=lead, is_leader=True, role="supervising")
    return {"project": project, "lead": lead, "ba_leader": ba_leader}


@pytest.mark.django_db
class TestConceptPlanEnforcement:
    def test_locked_concept_rejects_lead_without_exception(
        self, api_client, project_with_members
    ):
        from documents.models import ConceptPlan

        project = project_with_members["project"]
        document = ProjectDocumentFactory(project=project, kind="concept")
        concept = ConceptPlan.objects.create(
            document=document, project=project, background="<p>x</p>"
        )
        _lock_document(document)
        api_client.force_authenticate(user=project_with_members["lead"])
        response = api_client.patch(
            f"/api/v1/documents/conceptplans/{concept.pk}",
            {"background": "<p>new</p>"},
            format="json",
        )
        assert response.status_code == 403

    def test_locked_concept_allows_lead_with_exception(
        self, api_client, project_with_members
    ):
        from documents.models import ConceptPlan

        project = project_with_members["project"]
        document = ProjectDocumentFactory(project=project, kind="concept")
        concept = ConceptPlan.objects.create(
            document=document, project=project, background="<p>x</p>"
        )
        _lock_document(document)
        EditExceptionService.create(
            document=document,
            user=project_with_members["lead"],
            granted_by=UserFactory(username="admin_concept", is_superuser=True),
        )
        api_client.force_authenticate(user=project_with_members["lead"])
        response = api_client.patch(
            f"/api/v1/documents/conceptplans/{concept.pk}",
            {"background": "<p>edited</p>"},
            format="json",
        )
        assert response.status_code == 200


@pytest.mark.django_db
class TestProgressReportEnforcement:
    def _make(self, project):
        from datetime import date

        from documents.models import AnnualReport, ProgressReport

        report = AnnualReport.objects.create(
            year=2024,
            is_published=False,
            date_open=date(2024, 1, 1),
            date_closed=date(2024, 12, 31),
        )
        document = ProjectDocumentFactory(project=project, kind="progressreport")
        pr = ProgressReport.objects.create(
            document=document,
            project=project,
            report=report,
            year=2024,
            context="<p>x</p>",
        )
        return document, pr

    def test_locked_progress_report_rejects_without_exception(
        self, api_client, project_with_members
    ):
        document, _pr = self._make(project_with_members["project"])
        _lock_document(document)
        api_client.force_authenticate(user=project_with_members["lead"])
        response = api_client.post(
            "/api/v1/documents/progress_reports/update",
            {
                "main_document_id": document.pk,
                "section": "context",
                "html": "<p>new</p>",
            },
            format="json",
        )
        assert response.status_code == 403

    def test_locked_progress_report_allows_with_exception(
        self, api_client, project_with_members
    ):
        document, _pr = self._make(project_with_members["project"])
        _lock_document(document)
        EditExceptionService.create(
            document=document,
            user=project_with_members["lead"],
            granted_by=UserFactory(username="admin_pr", is_superuser=True),
        )
        api_client.force_authenticate(user=project_with_members["lead"])
        response = api_client.post(
            "/api/v1/documents/progress_reports/update",
            {
                "main_document_id": document.pk,
                "section": "context",
                "html": "<p>edited</p>",
            },
            format="json",
        )
        assert response.status_code == 202


@pytest.mark.django_db
class TestStudentReportEnforcement:
    def _make(self, project):
        from datetime import date

        from documents.models import AnnualReport, StudentReport

        report = AnnualReport.objects.create(
            year=2024,
            is_published=False,
            date_open=date(2024, 1, 1),
            date_closed=date(2024, 12, 31),
        )
        document = ProjectDocumentFactory(project=project, kind="studentreport")
        sr = StudentReport.objects.create(
            document=document,
            project=project,
            report=report,
            year=2024,
            progress_report="<p>x</p>",
        )
        return document, sr

    def test_locked_student_report_rejects_without_exception(
        self, api_client, project_with_members
    ):
        document, _sr = self._make(project_with_members["project"])
        _lock_document(document)
        api_client.force_authenticate(user=project_with_members["lead"])
        response = api_client.post(
            "/api/v1/documents/student_reports/update_progress",
            {"main_document_id": document.pk, "html": "<p>new</p>"},
            format="json",
        )
        assert response.status_code == 403

    def test_locked_student_report_allows_with_exception(
        self, api_client, project_with_members
    ):
        document, _sr = self._make(project_with_members["project"])
        _lock_document(document)
        EditExceptionService.create(
            document=document,
            user=project_with_members["lead"],
            granted_by=UserFactory(username="admin_sr", is_superuser=True),
        )
        api_client.force_authenticate(user=project_with_members["lead"])
        response = api_client.post(
            "/api/v1/documents/student_reports/update_progress",
            {"main_document_id": document.pk, "html": "<p>edited</p>"},
            format="json",
        )
        assert response.status_code == 202


@pytest.mark.django_db
class TestClosureEnforcement:
    def _make(self, project):
        from documents.models import ProjectClosure

        document = ProjectDocumentFactory(project=project, kind="projectclosure")
        closure = ProjectClosure.objects.create(
            document=document, project=project, reason="<p>x</p>"
        )
        return document, closure

    def test_locked_closure_rejects_without_exception(
        self, api_client, project_with_members
    ):
        document, closure = self._make(project_with_members["project"])
        _lock_document(document)
        api_client.force_authenticate(user=project_with_members["lead"])
        response = api_client.patch(
            f"/api/v1/documents/projectclosures/{closure.pk}",
            {"reason": "<p>new</p>"},
            format="json",
        )
        assert response.status_code == 403

    def test_locked_closure_allows_with_exception(
        self, api_client, project_with_members
    ):
        document, closure = self._make(project_with_members["project"])
        _lock_document(document)
        EditExceptionService.create(
            document=document,
            user=project_with_members["lead"],
            granted_by=UserFactory(username="admin_closure", is_superuser=True),
        )
        api_client.force_authenticate(user=project_with_members["lead"])
        response = api_client.patch(
            f"/api/v1/documents/projectclosures/{closure.pk}",
            {"reason": "<p>edited</p>"},
            format="json",
        )
        assert response.status_code == 200


# endregion


# region ================== Extend endpoint & expiry via request ==================


@pytest.mark.django_db
class TestExtendAndExpiry:
    def test_admin_extends_exception(self, api_client, locked_project_plan):
        admin = UserFactory(username="admin_extend_ep", is_superuser=True)
        exc = EditExceptionService.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            granted_by=admin,
            days=1,
        )
        api_client.force_authenticate(user=admin)
        response = api_client.patch(
            f"/api/v1/documents/edit-exceptions/{exc.pk}",
            {"days": 7},
            format="json",
        )
        assert response.status_code == 200
        exc.refresh_from_db()
        delta = exc.expires_at - timezone.now()
        assert timedelta(days=6) < delta <= timedelta(days=7)

    def test_extend_rejects_bad_duration(self, api_client, locked_project_plan):
        admin = UserFactory(username="admin_extend_bad", is_superuser=True)
        exc = EditExceptionService.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            granted_by=admin,
        )
        api_client.force_authenticate(user=admin)
        response = api_client.patch(
            f"/api/v1/documents/edit-exceptions/{exc.pk}",
            {"days": 99},
            format="json",
        )
        assert response.status_code == 400

    def test_non_admin_cannot_extend(self, api_client, locked_project_plan):
        admin = UserFactory(username="admin_extend_owner", is_superuser=True)
        exc = EditExceptionService.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            granted_by=admin,
        )
        api_client.force_authenticate(user=locked_project_plan["lead"])
        response = api_client.patch(
            f"/api/v1/documents/edit-exceptions/{exc.pk}",
            {"days": 3},
            format="json",
        )
        assert response.status_code == 403

    def test_expired_exception_blocks_save_via_request(
        self, api_client, locked_project_plan
    ):
        # An expired exception must not grant access on the save endpoint,
        # and is purged as a side effect.
        DocumentEditException.objects.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        api_client.force_authenticate(user=locked_project_plan["lead"])
        response = api_client.patch(
            f"/api/v1/documents/projectplans/{locked_project_plan['plan'].pk}",
            {"background": "<p>new</p>"},
            format="json",
        )
        assert response.status_code == 403
        assert DocumentEditException.objects.count() == 0


# endregion


# region ================== Serializer exposure (frontend contract) ==================


@pytest.mark.django_db
class TestSerializerExposure:
    def _detail_url(self, plan):
        return f"/api/v1/documents/projectplans/{plan.pk}"

    def test_grantee_sees_current_user_has_edit_exception_true(
        self, api_client, locked_project_plan
    ):
        admin = UserFactory(username="admin_ser1", is_superuser=True)
        EditExceptionService.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            granted_by=admin,
        )
        api_client.force_authenticate(user=locked_project_plan["lead"])
        response = api_client.get(self._detail_url(locked_project_plan["plan"]))
        assert response.status_code == 200
        assert response.data["document"]["current_user_has_edit_exception"] is True

    def test_non_grantee_sees_flag_false(self, api_client, locked_project_plan):
        api_client.force_authenticate(user=locked_project_plan["lead"])
        response = api_client.get(self._detail_url(locked_project_plan["plan"]))
        assert response.status_code == 200
        assert response.data["document"]["current_user_has_edit_exception"] is False

    def test_active_exceptions_visible_to_admin_only(
        self, api_client, locked_project_plan
    ):
        admin = UserFactory(username="admin_ser2", is_superuser=True)
        EditExceptionService.create(
            document=locked_project_plan["document"],
            user=locked_project_plan["lead"],
            granted_by=admin,
        )
        # Admin sees the list
        api_client.force_authenticate(user=admin)
        admin_response = api_client.get(self._detail_url(locked_project_plan["plan"]))
        assert admin_response.data["document"]["active_edit_exceptions"] is not None
        assert len(admin_response.data["document"]["active_edit_exceptions"]) == 1

        # Non-admin does not
        api_client.force_authenticate(user=locked_project_plan["lead"])
        lead_response = api_client.get(self._detail_url(locked_project_plan["plan"]))
        assert lead_response.data["document"]["active_edit_exceptions"] is None


# endregion
