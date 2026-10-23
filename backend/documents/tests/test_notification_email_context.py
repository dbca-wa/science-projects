"""
Comprehensive tests for notification service email template context.

Verifies that EVERY notification method passes the correct template variables,
that rendered emails contain expected content, and that recipient logic works
correctly for all stages and scenarios.
"""

from unittest.mock import patch

import pytest
from django.conf import settings
from django.utils.html import strip_tags

from common.tests.factories import ProjectFactory, UserFactory
from documents.services.notification_service import (
    DOCUMENT_KIND_MAP,
    URL_KIND_MAP,
    NotificationService,
    _build_document_context,
    _build_project_url,
)
from documents.tests.factories import ConceptPlanFactory, ProjectPlanFactory

# Shared mock recipient for tests that need to bypass recipient-finding logic
MOCK_RECIPIENT = [
    {"name": "Test User", "email": "test@dbca.wa.gov.au", "kind": "Team Member"}
]


# ─── Helper Tests ─────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestBuildDocumentContext:
    """Test the shared _build_document_context helper."""

    def test_concept_plan_context(self):
        concept_plan = ConceptPlanFactory()
        ctx = _build_document_context(concept_plan.document)

        assert ctx["document_type_title"] == "Concept Plan"
        assert ctx["document_type"] == "concept"
        assert ctx["plain_project_name"] != ""
        assert (
            f"/projects/{concept_plan.document.project.pk}/concept"
            in ctx["document_url"]
        )
        assert ctx["site_url"] == settings.SITE_URL

    def test_project_plan_context(self):
        project_plan = ProjectPlanFactory()
        ctx = _build_document_context(project_plan.document)

        assert ctx["document_type_title"] == "Project Plan"
        assert ctx["document_type"] == "projectplan"
        assert (
            f"/projects/{project_plan.document.project.pk}/project"
            in ctx["document_url"]
        )

    def test_plain_project_name_strips_html(self):
        concept_plan = ConceptPlanFactory()
        concept_plan.document.project.title = "<b>Bold</b> <i>Title</i>"
        concept_plan.document.project.save()

        ctx = _build_document_context(concept_plan.document)

        assert "<b>" not in ctx["plain_project_name"]
        assert "Bold" in ctx["plain_project_name"]

    def test_all_document_kinds_mapped(self):
        expected = [
            "concept",
            "projectplan",
            "progressreport",
            "studentreport",
            "projectclosure",
        ]
        for kind in expected:
            assert kind in DOCUMENT_KIND_MAP
            assert kind in URL_KIND_MAP


@pytest.mark.django_db
class TestBuildProjectUrl:
    """Test the _build_project_url helper."""

    def test_builds_correct_url(self):
        project = ProjectFactory()
        url = _build_project_url(project)
        assert f"/projects/{project.pk}" in url
        assert url.startswith(settings.SITE_URL)


# ─── Document Approval Email Tests ────────────────────────────────────────────


@pytest.mark.django_db
class TestNotifyDocumentApproved:
    """Test notify_document_approved — all stages, all content."""

    @patch(
        "documents.services.notification_service.NotificationService._get_stage_approval_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_stage_1_contains_project_lead_prefix(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        approver = UserFactory(first_name="Alice", last_name="Leader")

        NotificationService.notify_document_approved(
            concept_plan.document, approver, stage=1
        )

        assert mock_send.called
        html = mock_send.call_args[1]["html_content"]
        assert "Project Lead" in html

    @patch(
        "documents.services.notification_service.NotificationService._get_stage_approval_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_stage_2_contains_ba_lead_prefix(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        approver = UserFactory()

        NotificationService.notify_document_approved(
            concept_plan.document, approver, stage=2
        )

        assert mock_send.called
        html = mock_send.call_args[1]["html_content"]
        assert "Business Area Lead" in html

    @patch(
        "documents.services.notification_service.NotificationService._get_stage_approval_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_document_type_title(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        approver = UserFactory()

        NotificationService.notify_document_approved(
            concept_plan.document, approver, stage=2
        )

        html = mock_send.call_args[1]["html_content"]
        assert "Concept Plan" in html

    @patch(
        "documents.services.notification_service.NotificationService._get_stage_approval_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_project_name(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        approver = UserFactory()

        NotificationService.notify_document_approved(
            concept_plan.document, approver, stage=2
        )

        html = mock_send.call_args[1]["html_content"]
        plain_title = strip_tags(concept_plan.document.project.title)
        assert plain_title in html

    @patch(
        "documents.services.notification_service.NotificationService._get_stage_approval_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_document_url(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        approver = UserFactory()

        NotificationService.notify_document_approved(
            concept_plan.document, approver, stage=2
        )

        html = mock_send.call_args[1]["html_content"]
        assert f"/projects/{concept_plan.document.project.pk}/concept" in html

    @patch(
        "documents.services.notification_service.NotificationService._get_stage_approval_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_approver_name_and_email(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        approver = UserFactory(
            first_name="Ben", last_name="Miller", email="ben@dbca.wa.gov.au"
        )

        NotificationService.notify_document_approved(
            concept_plan.document, approver, stage=2
        )

        html = mock_send.call_args[1]["html_content"]
        assert "Ben Miller" in html
        assert "ben@dbca.wa.gov.au" in html

    @patch(
        "documents.services.notification_service.NotificationService._get_stage_approval_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_feedback_when_provided(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        approver = UserFactory()

        NotificationService.notify_document_approved(
            concept_plan.document,
            approver,
            stage=2,
            feedback_html="<p>Looks good, approved.</p>",
        )

        html = mock_send.call_args[1]["html_content"]
        assert "Looks good, approved." in html

    @patch(
        "documents.services.notification_service.NotificationService._get_stage_approval_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_recipient_name_in_greeting(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        approver = UserFactory()

        NotificationService.notify_document_approved(
            concept_plan.document, approver, stage=2
        )

        html = mock_send.call_args[1]["html_content"]
        assert "Test User" in html


# ─── Directorate Approval Email Tests ─────────────────────────────────────────


@pytest.mark.django_db
class TestNotifyDocumentApprovedDirectorate:
    """Test notify_document_approved_directorate."""

    @patch(
        "documents.services.notification_service.NotificationService._get_directorate_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_document_type_and_project(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        approver = UserFactory()

        NotificationService.notify_document_approved_directorate(
            concept_plan.document, approver
        )

        html = mock_send.call_args[1]["html_content"]
        assert "Concept Plan" in html
        assert strip_tags(concept_plan.document.project.title) in html

    @patch(
        "documents.services.notification_service.NotificationService._get_directorate_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_document_url(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        approver = UserFactory()

        NotificationService.notify_document_approved_directorate(
            concept_plan.document, approver
        )

        html = mock_send.call_args[1]["html_content"]
        assert f"/projects/{concept_plan.document.project.pk}/concept" in html


# ─── Recalled Email Tests ─────────────────────────────────────────────────────


@pytest.mark.django_db
class TestNotifyDocumentRecalled:
    """Test notify_document_recalled."""

    @patch(
        "documents.services.notification_service.NotificationService._get_recall_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_all_required_vars(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        recaller = UserFactory(first_name="John", last_name="Recaller")

        NotificationService.notify_document_recalled(
            concept_plan.document, recaller, feedback_html="<p>Revise methodology.</p>"
        )

        html = mock_send.call_args[1]["html_content"]
        assert "Concept Plan" in html
        assert strip_tags(concept_plan.document.project.title) in html
        assert f"/projects/{concept_plan.document.project.pk}/concept" in html
        assert "John Recaller" in html
        assert "Revise methodology." in html


# ─── Sent Back Email Tests ────────────────────────────────────────────────────


@pytest.mark.django_db
class TestNotifyDocumentSentBack:
    """Test notify_document_sent_back."""

    @patch(
        "documents.services.notification_service.NotificationService._get_sent_back_recipient",
        return_value=MOCK_RECIPIENT[0],
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_all_required_vars(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        sender = UserFactory(first_name="Sarah", last_name="Reviewer")

        NotificationService.notify_document_sent_back(
            concept_plan.document, sender, feedback_html="<p>Budget incomplete.</p>"
        )

        html = mock_send.call_args[1]["html_content"]
        assert "Concept Plan" in html
        assert strip_tags(concept_plan.document.project.title) in html
        assert f"/projects/{concept_plan.document.project.pk}/concept" in html
        assert "Sarah Reviewer" in html
        assert "Budget incomplete." in html


# ─── Document Ready Email Tests ───────────────────────────────────────────────


@pytest.mark.django_db
class TestNotifyDocumentReady:
    """Test notify_document_ready."""

    @patch(
        "documents.services.notification_service.NotificationService._get_approver_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_all_required_vars(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        submitter = UserFactory(first_name="Alex", last_name="Submitter")

        NotificationService.notify_document_ready(concept_plan.document, submitter)

        html = mock_send.call_args[1]["html_content"]
        assert "Concept Plan" in html
        assert strip_tags(concept_plan.document.project.title) in html
        assert f"/projects/{concept_plan.document.project.pk}/concept" in html
        assert "Alex Submitter" in html


# ─── Feedback Received Email Tests ────────────────────────────────────────────


@pytest.mark.django_db
class TestNotifyFeedbackReceived:
    """Test notify_feedback_received."""

    @patch(
        "documents.services.notification_service.NotificationService._get_document_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_all_required_vars(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        provider = UserFactory(first_name="Mike", last_name="Feedback")

        NotificationService.notify_feedback_received(
            concept_plan.document, provider, "Methodology needs more detail."
        )

        html = mock_send.call_args[1]["html_content"]
        assert "Concept Plan" in html
        assert strip_tags(concept_plan.document.project.title) in html
        assert f"/projects/{concept_plan.document.project.pk}/concept" in html
        assert "Mike Feedback" in html
        assert "Methodology needs more detail." in html


# ─── Review Request Email Tests ───────────────────────────────────────────────


@pytest.mark.django_db
class TestNotifyReviewRequest:
    """Test notify_review_request."""

    @patch(
        "documents.services.notification_service.NotificationService._get_approver_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_all_required_vars(self, mock_send, _):
        concept_plan = ConceptPlanFactory()
        requester = UserFactory(first_name="Lisa", last_name="Requester")

        NotificationService.notify_review_request(concept_plan.document, requester)

        html = mock_send.call_args[1]["html_content"]
        assert "Concept Plan" in html
        assert strip_tags(concept_plan.document.project.title) in html
        assert f"/projects/{concept_plan.document.project.pk}/concept" in html
        assert "Lisa Requester" in html


# ─── Project Closed/Reopened Email Tests ──────────────────────────────────────


@pytest.mark.django_db
class TestNotifyProjectClosed:
    """Test notify_project_closed."""

    @patch(
        "documents.services.notification_service.NotificationService._get_project_team_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_project_title_and_url(self, mock_send, _):
        project = ProjectFactory(title="Fauna Survey 2026")
        closer = UserFactory(first_name="Admin", last_name="Closer")

        NotificationService.notify_project_closed(project, closer)

        html = mock_send.call_args[1]["html_content"]
        assert "Fauna Survey 2026" in html
        assert f"/projects/{project.pk}" in html
        assert "Admin Closer" in html


@pytest.mark.django_db
class TestNotifyProjectReopened:
    """Test notify_project_reopened."""

    @patch(
        "documents.services.notification_service.NotificationService._get_project_team_recipients",
        return_value=MOCK_RECIPIENT,
    )
    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_project_title_and_url(self, mock_send, _):
        project = ProjectFactory(title="Flora Mapping WA")
        reopener = UserFactory(first_name="Admin", last_name="Reopener")

        NotificationService.notify_project_reopened(project, reopener)

        html = mock_send.call_args[1]["html_content"]
        assert "Flora Mapping WA" in html
        assert f"/projects/{project.pk}" in html
        assert "Admin Reopener" in html


# ─── SPMS Invite Email Tests ─────────────────────────────────────────────────


@pytest.mark.django_db
class TestSendSpmsInvite:
    """Test send_spms_invite."""

    @patch("documents.services.email_service.send_email_with_embedded_image")
    def test_contains_inviter_and_link(self, mock_send):
        inviter = UserFactory(first_name="Admin", last_name="Inviter")

        class FakeUser:
            def get_full_name(self):
                return "New Person"

            email = "new@dbca.wa.gov.au"

        NotificationService.send_spms_invite(
            FakeUser(), inviter, "https://spms.dbca.wa.gov.au"
        )

        assert mock_send.called
        html = mock_send.call_args[1]["html_content"]
        assert "Admin Inviter" in html
        assert "https://spms.dbca.wa.gov.au" in html
        assert "New Person" in html


# ─── Bump Email Tests ─────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestSendBumpEmails:
    """Test send_bump_emails — aggressive and consolidated modes."""

    @patch("documents.services.notification_service.send_email_with_embedded_image")
    def test_aggressive_mode_contains_all_vars(self, mock_send):
        user = UserFactory(is_staff=True, is_active=True, email="staff@dbca.wa.gov.au")
        admin = UserFactory(is_superuser=True)

        docs = [
            {
                "userToTakeAction": user.pk,
                "documentKind": "progressreport",
                "projectTitle": "Fauna Survey 2026",
                "projectId": 42,
                "actionCapacity": "Project Lead",
                "documentId": 100,
            }
        ]

        result = NotificationService.send_bump_emails(docs, admin, send_aggressive=True)

        assert result["emails_sent"] == 1
        html = mock_send.call_args[1]["html_content"]
        assert "Fauna Survey 2026" in html
        assert "Progress Report" in html
        assert "Project Lead" in html
        assert "/projects/42/progress" in html

    @patch("documents.services.notification_service.send_email_with_embedded_image")
    def test_consolidated_mode_multiple_docs(self, mock_send):
        user = UserFactory(is_staff=True, is_active=True, email="staff@dbca.wa.gov.au")
        admin = UserFactory(is_superuser=True)

        docs = [
            {
                "userToTakeAction": user.pk,
                "documentKind": "progressreport",
                "projectTitle": "Project A",
                "projectId": 10,
                "actionCapacity": "Project Lead",
                "documentId": 1,
            },
            {
                "userToTakeAction": user.pk,
                "documentKind": "concept",
                "projectTitle": "Project B",
                "projectId": 20,
                "actionCapacity": "Business Area Lead",
                "documentId": 2,
            },
        ]

        result = NotificationService.send_bump_emails(
            docs, admin, send_aggressive=False
        )

        assert result["emails_sent"] == 1
        html = mock_send.call_args[1]["html_content"]
        # Consolidated template should have both projects
        assert "Project A" in html
        assert "Project B" in html
        assert "/projects/10/progress" in html
        assert "/projects/20/concept" in html

    @patch("documents.services.notification_service.send_email_with_embedded_image")
    def test_skips_inactive_users(self, mock_send):
        user = UserFactory(
            is_staff=True, is_active=False, email="inactive@dbca.wa.gov.au"
        )
        admin = UserFactory(is_superuser=True)

        docs = [
            {
                "userToTakeAction": user.pk,
                "documentKind": "concept",
                "projectTitle": "Test",
                "projectId": 1,
                "actionCapacity": "Project Lead",
                "documentId": 1,
            }
        ]

        result = NotificationService.send_bump_emails(docs, admin, send_aggressive=True)

        assert result["emails_sent"] == 0
        assert len(result["errors"]) > 0

    @patch("documents.services.notification_service.send_email_with_embedded_image")
    def test_skips_external_users(self, mock_send):
        user = UserFactory(is_staff=False, is_active=True, email="external@example.com")
        admin = UserFactory(is_superuser=True)

        docs = [
            {
                "userToTakeAction": user.pk,
                "documentKind": "concept",
                "projectTitle": "Test",
                "projectId": 1,
                "actionCapacity": "Project Lead",
                "documentId": 1,
            }
        ]

        result = NotificationService.send_bump_emails(docs, admin, send_aggressive=True)

        assert result["emails_sent"] == 0


# ─── Comment Mention Email Tests ──────────────────────────────────────────────


@pytest.mark.django_db
class TestNotifyCommentMention:
    """Test notify_comment_mention."""

    @patch("documents.services.notification_service.send_email_with_embedded_image")
    def test_contains_all_required_vars(self, mock_send):
        mentioned = UserFactory(
            first_name="Jane",
            last_name="Smith",
            email="jane.smith@dbca.wa.gov.au",
            is_active=True,
            is_staff=True,
        )
        concept_plan = ConceptPlanFactory()

        NotificationService.notify_comment_mention(
            document_id=concept_plan.document.pk,
            project_id=concept_plan.document.project.pk,
            commenter_data={"name": "John Doe"},
            mentioned_users=[
                {
                    "id": mentioned.pk,
                    "name": "Jane Smith",
                    "email": "jane.smith@dbca.wa.gov.au",
                }
            ],
            comment_content="Hey @jane, can you review this?",
        )

        assert mock_send.called
        html = mock_send.call_args[1]["html_content"]
        assert "Jane Smith" in html
        assert "John Doe" in html
        assert "can you review this" in html
        assert f"/projects/{concept_plan.document.project.pk}/concept" in html

    @patch("documents.services.notification_service.send_email_with_embedded_image")
    def test_skips_non_dbca_emails(self, mock_send):
        mentioned = UserFactory(
            first_name="External",
            last_name="User",
            email="external@gmail.com",
            is_active=True,
            is_staff=True,
        )
        concept_plan = ConceptPlanFactory()

        result = NotificationService.notify_comment_mention(
            document_id=concept_plan.document.pk,
            project_id=concept_plan.document.project.pk,
            commenter_data={"name": "John"},
            mentioned_users=[
                {
                    "id": mentioned.pk,
                    "name": "External User",
                    "email": "external@gmail.com",
                }
            ],
            comment_content="test",
        )

        assert not mock_send.called
        assert result["recipients"] == 0

    @patch("documents.services.notification_service.send_email_with_embedded_image")
    def test_skips_inactive_users(self, mock_send):
        mentioned = UserFactory(
            first_name="Inactive",
            last_name="User",
            email="inactive@dbca.wa.gov.au",
            is_active=False,
            is_staff=True,
        )
        concept_plan = ConceptPlanFactory()

        result = NotificationService.notify_comment_mention(
            document_id=concept_plan.document.pk,
            project_id=concept_plan.document.project.pk,
            commenter_data={"name": "John"},
            mentioned_users=[
                {
                    "id": mentioned.pk,
                    "name": "Inactive User",
                    "email": "inactive@dbca.wa.gov.au",
                }
            ],
            comment_content="test",
        )

        assert not mock_send.called
        assert result["recipients"] == 0

    @patch("documents.services.notification_service.send_email_with_embedded_image")
    def test_deduplicates_mentioned_users(self, mock_send):
        mentioned = UserFactory(
            first_name="Jane",
            last_name="Smith",
            email="jane@dbca.wa.gov.au",
            is_active=True,
            is_staff=True,
        )
        concept_plan = ConceptPlanFactory()

        # Same user mentioned twice
        NotificationService.notify_comment_mention(
            document_id=concept_plan.document.pk,
            project_id=concept_plan.document.project.pk,
            commenter_data={"name": "John"},
            mentioned_users=[
                {
                    "id": mentioned.pk,
                    "name": "Jane Smith",
                    "email": "jane@dbca.wa.gov.au",
                },
                {
                    "id": mentioned.pk,
                    "name": "Jane Smith",
                    "email": "jane@dbca.wa.gov.au",
                },
            ],
            comment_content="test",
        )

        # Should only send one email despite duplicate mention
        assert mock_send.call_count == 1

    @patch("documents.services.notification_service.send_email_with_embedded_image")
    def test_returns_sent_and_emailed_ids_for_sent_recipient(self, mock_send):
        mentioned = UserFactory(
            first_name="Jane",
            last_name="Smith",
            email="jane.smith@dbca.wa.gov.au",
            is_active=True,
            is_staff=True,
        )
        concept_plan = ConceptPlanFactory()

        result = NotificationService.notify_comment_mention(
            document_id=concept_plan.document.pk,
            project_id=concept_plan.document.project.pk,
            commenter_data={"name": "John Doe"},
            mentioned_users=[
                {
                    "id": mentioned.pk,
                    "name": "Jane Smith",
                    "email": "jane.smith@dbca.wa.gov.au",
                }
            ],
            comment_content="Please review",
        )

        assert result["sent"] is True
        assert mentioned.pk in result["emailed_user_ids"]

    @patch("documents.services.notification_service.send_email_with_embedded_image")
    def test_returns_not_sent_and_empty_ids_for_unsent_recipient(self, mock_send):
        mentioned = UserFactory(
            first_name="External",
            last_name="User",
            email="external@gmail.com",
            is_active=True,
            is_staff=True,
        )
        concept_plan = ConceptPlanFactory()

        result = NotificationService.notify_comment_mention(
            document_id=concept_plan.document.pk,
            project_id=concept_plan.document.project.pk,
            commenter_data={"name": "John"},
            mentioned_users=[
                {
                    "id": mentioned.pk,
                    "name": "External User",
                    "email": "external@gmail.com",
                }
            ],
            comment_content="test",
        )

        assert result["sent"] is False
        assert result["emailed_user_ids"] == []


# ─── Comment Reply Email Tests ────────────────────────────────────────────────


@pytest.mark.django_db
class TestNotifyCommentReply:
    """Test notify_comment_reply."""

    @patch("documents.services.notification_service.send_email_with_embedded_image")
    def test_eligible_parent_author_receives_reply_email(self, mock_send):
        parent_author = UserFactory(
            first_name="Pat",
            last_name="Author",
            email="pat.author@dbca.wa.gov.au",
            is_active=True,
            is_staff=True,
        )
        concept_plan = ConceptPlanFactory()

        result = NotificationService.notify_comment_reply(
            document_id=concept_plan.document.pk,
            project_id=concept_plan.document.project.pk,
            replier_data={"name": "Robin Replier"},
            parent_author={
                "id": parent_author.pk,
                "name": "Pat Author",
                "email": "pat.author@dbca.wa.gov.au",
            },
            comment_content="Thanks for raising this.",
        )

        assert result["sent"] is True
        assert mock_send.call_count == 1
        assert mock_send.call_args[1]["recipient_email"] == [
            "pat.author@dbca.wa.gov.au"
        ]
        html = mock_send.call_args[1]["html_content"]
        assert "Robin Replier" in html
        assert "Thanks for raising this." in html

    @patch("documents.services.notification_service.send_email_with_embedded_image")
    def test_ineligible_parent_author_receives_no_reply_email(self, mock_send):
        parent_author = UserFactory(
            first_name="Sam",
            last_name="External",
            email="sam.external@gmail.com",
            is_active=True,
            is_staff=True,
        )
        concept_plan = ConceptPlanFactory()

        result = NotificationService.notify_comment_reply(
            document_id=concept_plan.document.pk,
            project_id=concept_plan.document.project.pk,
            replier_data={"name": "Robin Replier"},
            parent_author={
                "id": parent_author.pk,
                "name": "Sam External",
                "email": "sam.external@gmail.com",
            },
            comment_content="Thanks for raising this.",
        )

        assert result["sent"] is False
        assert not mock_send.called


# ─── Batch Approved Email Tests ───────────────────────────────────────────────


@pytest.mark.django_db
class TestNotifyBatchApproved:
    """Test notify_batch_approved."""

    @patch("documents.services.notification_service.send_email_with_embedded_image")
    def test_contains_all_document_info(self, mock_send):
        concept_plan = ConceptPlanFactory()
        approver = UserFactory()

        # Add a project lead so _get_batch_approval_recipients finds someone
        from projects.models import ProjectMember

        lead = UserFactory(is_active=True, email="lead@dbca.wa.gov.au")
        ProjectMember.objects.create(
            project=concept_plan.document.project, user=lead, is_leader=True
        )

        NotificationService.notify_batch_approved([concept_plan.document], approver)

        assert mock_send.called
        html = mock_send.call_args[1]["html_content"]
        assert strip_tags(concept_plan.document.project.title) in html
        assert "Concept Plan" in html
        assert f"/projects/{concept_plan.document.project.pk}/concept" in html


# ─── Recipient Logic Tests ────────────────────────────────────────────────────


@pytest.mark.django_db
class TestRecipientLogic:
    """Test recipient-finding methods return correct recipients."""

    def test_get_project_team_recipients_filters_inactive(self):
        project = ProjectFactory()
        from projects.models import ProjectMember

        active_user = UserFactory(is_active=True, email="active@dbca.wa.gov.au")
        inactive_user = UserFactory(is_active=False, email="inactive@dbca.wa.gov.au")
        ProjectMember.objects.create(project=project, user=active_user, is_leader=True)
        ProjectMember.objects.create(
            project=project, user=inactive_user, is_leader=False
        )

        recipients = NotificationService._get_project_team_recipients(project)

        emails = [r["email"] for r in recipients]
        assert "active@dbca.wa.gov.au" in emails
        assert "inactive@dbca.wa.gov.au" not in emails

    def test_get_project_team_recipients_filters_no_email(self):
        project = ProjectFactory()
        from projects.models import ProjectMember

        # Clear auto-created members from factory
        ProjectMember.objects.filter(project=project).delete()

        user_with_email = UserFactory(is_active=True, email="has@dbca.wa.gov.au")
        user_no_email = UserFactory(is_active=True, email="")
        ProjectMember.objects.create(
            project=project, user=user_with_email, is_leader=True
        )
        ProjectMember.objects.create(
            project=project, user=user_no_email, is_leader=False
        )

        recipients = NotificationService._get_project_team_recipients(project)

        assert len(recipients) == 1
        assert recipients[0]["email"] == "has@dbca.wa.gov.au"

    def test_get_document_recipients_deduplicates(self):
        concept_plan = ConceptPlanFactory()
        doc = concept_plan.document
        from projects.models import ProjectMember

        # Make the BA leader also a project member
        ba = doc.project.business_area
        if ba and ba.leader:
            ProjectMember.objects.get_or_create(
                project=doc.project, user=ba.leader, defaults={"is_leader": False}
            )

        recipients = NotificationService._get_document_recipients(doc)

        # Should not have duplicate emails
        emails = [r["email"] for r in recipients]
        assert len(emails) == len(set(emails)), f"Duplicate emails found: {emails}"

    def test_get_stage_approval_recipients_stage_1_returns_ba_lead(self):
        concept_plan = ConceptPlanFactory()
        doc = concept_plan.document
        ba = doc.project.business_area

        # Ensure BA has an active leader
        if ba and ba.leader and ba.leader.is_active:
            recipients = NotificationService._get_stage_approval_recipients(doc, 1)
            assert len(recipients) == 1
            assert recipients[0]["email"] == ba.leader.email
            assert recipients[0]["kind"] == "Business Area Leader"

    def test_get_stage_approval_recipients_stage_3_returns_project_leads(self):
        concept_plan = ConceptPlanFactory()
        doc = concept_plan.document
        from projects.models import ProjectMember

        lead = UserFactory(is_active=True, email="lead@dbca.wa.gov.au")
        ProjectMember.objects.create(project=doc.project, user=lead, is_leader=True)

        recipients = NotificationService._get_stage_approval_recipients(doc, 3)

        emails = [r["email"] for r in recipients]
        assert "lead@dbca.wa.gov.au" in emails
