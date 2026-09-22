"""
Tests that sending announcement and new-cycle emails records an EmailRecord.

Verifies the end-to-end recording contract at the notification-service layer:
a record is created only when at least one recipient received the email, with
the correct fields, and per-group vs single-message bodies are stored correctly.
"""

from unittest.mock import patch

import pytest

from adminoptions.models import EmailRecord
from agencies.models import Agency, BusinessArea, Division
from common.tests.factories import UserFactory
from documents.services.notification_service import NotificationService
from projects.models import Project, ProjectMember

PATCH_SEND_EMAIL = (
    "documents.services.notification_service.send_email_with_embedded_image"
)


@pytest.fixture
def division(db):
    return Division.objects.create(
        name="Biodiversity and Conservation Science", slug="bcs"
    )


@pytest.fixture
def ba_lead(db):
    return UserFactory(
        username="ba_lead",
        email="ba_lead@dbca.wa.gov.au",
        is_staff=True,
        is_active=True,
        first_name="BA",
        last_name="Lead",
    )


@pytest.fixture
def project_lead(db):
    return UserFactory(
        username="project_lead",
        email="project_lead@dbca.wa.gov.au",
        is_staff=True,
        is_active=True,
        first_name="Project",
        last_name="Lead",
    )


@pytest.fixture
def actioning_user(db):
    return UserFactory(
        username="admin_sender",
        email="admin@dbca.wa.gov.au",
        is_staff=True,
        is_superuser=True,
        first_name="Admin",
        last_name="Sender",
    )


@pytest.fixture
def business_area(db, division, ba_lead):
    agency = Agency.objects.create(name="Test Agency")
    return BusinessArea.objects.create(
        name="Test BA",
        slug="test-ba",
        agency=agency,
        division=division,
        leader=ba_lead,
        finance_admin=ba_lead,
        data_custodian=ba_lead,
    )


@pytest.fixture
def project_with_lead(db, business_area, project_lead):
    project = Project.objects.create(
        title="Active Project",
        description="Test",
        business_area=business_area,
        status=Project.StatusChoices.NEW,
        kind=Project.CategoryKindChoices.SCIENCE,
    )
    ProjectMember.objects.create(project=project, user=project_lead, is_leader=True)
    return project


@pytest.mark.django_db
class TestAnnouncementRecording:
    @patch(PATCH_SEND_EMAIL)
    def test_records_when_sent(self, mock_send, actioning_user, business_area, ba_lead):
        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message="<p>Important</p>",
        )

        assert result["emails_sent"] == 1
        assert EmailRecord.objects.count() == 1

        record = EmailRecord.objects.first()
        assert record.kind == EmailRecord.EmailKind.ANNOUNCEMENT
        assert record.initiator == actioning_user
        assert record.emails_sent == 1
        assert record.recipient_groups == ["ba_leads"]
        assert "Important" in record.body
        assert len(record.recipients) == 1
        assert record.recipients[0]["email"] == "ba_lead@dbca.wa.gov.au"

    @patch(PATCH_SEND_EMAIL)
    def test_no_record_when_no_recipients(self, mock_send, actioning_user):
        """No BA leads exist, so nothing is sent and no record is created."""
        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message="<p>Hello</p>",
        )

        assert result["emails_sent"] == 0
        assert EmailRecord.objects.count() == 0

    @patch(PATCH_SEND_EMAIL)
    def test_records_flagged_as_test_in_testing_mode(
        self, mock_send, actioning_user, business_area, ba_lead
    ):
        from adminoptions.models import AdminOptions

        AdminOptions.objects.create(
            email_testing_mode=True,
            email_test_user=actioning_user,
        )

        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message="<p>Testing</p>",
        )

        assert result["emails_sent"] == 1
        record = EmailRecord.objects.first()
        assert record.is_test is True

    @patch(PATCH_SEND_EMAIL)
    def test_records_not_flagged_when_testing_off(
        self, mock_send, actioning_user, business_area, ba_lead
    ):
        from adminoptions.models import AdminOptions

        AdminOptions.objects.create(
            email_testing_mode=False,
            email_test_user=None,
        )

        NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message="<p>Official</p>",
        )

        record = EmailRecord.objects.first()
        assert record.is_test is False

    @patch(PATCH_SEND_EMAIL)
    def test_per_group_messages_stored(
        self, mock_send, actioning_user, business_area, ba_lead, project_with_lead
    ):
        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads", "project_leads"],
            custom_messages={
                "ba_leads": "<p>BA message</p>",
                "project_leads": "<p>PL message</p>",
            },
        )

        assert result["emails_sent"] >= 1
        record = EmailRecord.objects.first()
        assert record.group_messages.get("ba_leads") == "<p>BA message</p>"
        assert record.group_messages.get("project_leads") == "<p>PL message</p>"
        assert record.body == ""


@pytest.mark.django_db
class TestNewCycleRecording:
    def _make_report(self, year=2026):
        from documents.models import AnnualReport

        return AnnualReport.objects.create(
            year=year,
            date_open="2025-01-01",
            date_closed="2025-12-31",
            dm="<p>dm</p>",
            publications="<p>pubs</p>",
            research_intro="<p>intro</p>",
            service_delivery_intro="<p>sd</p>",
            student_intro="<p>student</p>",
        )

    @patch(PATCH_SEND_EMAIL)
    def test_records_new_cycle_when_sent(
        self, mock_send, actioning_user, business_area, ba_lead
    ):
        report = self._make_report()

        result = NotificationService.notify_new_cycle_open(
            last_report=report,
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message="<p>Cycle is open</p>",
        )

        assert result["emails_sent"] == 1
        assert EmailRecord.objects.count() == 1

        record = EmailRecord.objects.first()
        assert record.kind == EmailRecord.EmailKind.NEW_CYCLE
        assert record.initiator == actioning_user
        assert "Cycle is open" in record.body
        assert record.recipient_groups == ["ba_leads"]

    @patch(PATCH_SEND_EMAIL)
    def test_no_record_when_no_recipients(self, mock_send, actioning_user):
        report = self._make_report(year=2027)

        result = NotificationService.notify_new_cycle_open(
            last_report=report,
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message="<p>Nobody</p>",
        )

        assert result["emails_sent"] == 0
        assert EmailRecord.objects.count() == 0
