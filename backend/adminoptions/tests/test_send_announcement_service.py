"""
Tests for NotificationService.send_announcement_emails.

Covers:
- Recipient resolution (BA leads, project leads, team members)
- Deduplication by highest role priority
- Excluded user filtering
- Custom message sanitisation
- Per-group messaging
- Division scoping
- Email sending (mocked)
"""

from unittest.mock import patch

import pytest

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
        name="Biodiversity and Conservation Science",
        slug="bcs",
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
def team_member(db):
    return UserFactory(
        username="team_member",
        email="team_member@dbca.wa.gov.au",
        is_staff=True,
        is_active=True,
        first_name="Team",
        last_name="Member",
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
def active_project(db, business_area):
    return Project.objects.create(
        title="Active Project",
        description="Test",
        business_area=business_area,
        status=Project.StatusChoices.NEW,
        kind=Project.CategoryKindChoices.SCIENCE,
    )


@pytest.fixture
def project_with_members(db, active_project, project_lead, team_member):
    ProjectMember.objects.create(
        project=active_project,
        user=project_lead,
        is_leader=True,
    )
    ProjectMember.objects.create(
        project=active_project,
        user=team_member,
        is_leader=False,
    )
    return active_project


@pytest.mark.django_db
class TestAnnouncementRecipientResolution:
    """Tests for recipient resolution in send_announcement_emails."""

    @patch(PATCH_SEND_EMAIL)
    def test_ba_leads_only(self, mock_send, actioning_user, business_area, ba_lead):
        """Should send only to BA leads when that group is selected."""
        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message="<p>Test</p>",
        )

        assert result["emails_sent"] == 1
        assert result["errors"] == []
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args[1]
        assert call_kwargs["recipient_email"] == [ba_lead.email]

    @patch(PATCH_SEND_EMAIL)
    def test_project_leads_only(
        self, mock_send, actioning_user, project_with_members, project_lead
    ):
        """Should send only to project leads when that group is selected."""
        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["project_leads"],
            custom_message="<p>Test</p>",
        )

        assert result["emails_sent"] == 1
        emails_sent = [c[1]["recipient_email"][0] for c in mock_send.call_args_list]
        assert project_lead.email in emails_sent

    @patch(PATCH_SEND_EMAIL)
    def test_team_members_only(
        self, mock_send, actioning_user, project_with_members, team_member
    ):
        """Should send only to team members when that group is selected."""
        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["team_members"],
            custom_message="<p>Test</p>",
        )

        assert result["emails_sent"] == 1
        emails_sent = [c[1]["recipient_email"][0] for c in mock_send.call_args_list]
        assert team_member.email in emails_sent

    @patch(PATCH_SEND_EMAIL)
    def test_all_groups(
        self,
        mock_send,
        actioning_user,
        business_area,
        project_with_members,
        ba_lead,
        project_lead,
        team_member,
    ):
        """Should send to all groups when all are selected."""
        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads", "project_leads", "team_members"],
            custom_message="<p>Test</p>",
        )

        assert result["emails_sent"] == 3
        emails_sent = [c[1]["recipient_email"][0] for c in mock_send.call_args_list]
        assert ba_lead.email in emails_sent
        assert project_lead.email in emails_sent
        assert team_member.email in emails_sent


@pytest.mark.django_db
class TestAnnouncementDeduplication:
    """Tests for deduplication by highest role priority."""

    @patch(PATCH_SEND_EMAIL)
    def test_user_in_multiple_groups_receives_one_email(
        self, mock_send, actioning_user, division, ba_lead
    ):
        """A user who is both BA lead and project lead should get one email."""
        agency = Agency.objects.create(name="Dedup Agency")
        ba = BusinessArea.objects.create(
            name="Dedup BA",
            slug="dedup-ba",
            agency=agency,
            division=division,
            leader=ba_lead,
            finance_admin=ba_lead,
            data_custodian=ba_lead,
        )
        project = Project.objects.create(
            title="Dedup Project",
            business_area=ba,
            status=Project.StatusChoices.NEW,
            kind=Project.CategoryKindChoices.SCIENCE,
        )
        # Same user is also a project lead
        ProjectMember.objects.create(project=project, user=ba_lead, is_leader=True)

        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads", "project_leads"],
            custom_message="<p>Test</p>",
        )

        # Should only send one email despite being in both groups
        assert result["emails_sent"] == 1
        mock_send.assert_called_once()


@pytest.mark.django_db
class TestAnnouncementExclusion:
    """Tests for excluded user filtering."""

    @patch(PATCH_SEND_EMAIL)
    def test_excluded_users_not_emailed(
        self, mock_send, actioning_user, business_area, ba_lead
    ):
        """Excluded users should not receive the announcement."""
        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            excluded_user_ids=[ba_lead.pk],
            custom_message="<p>Test</p>",
        )

        assert result["emails_sent"] == 0
        mock_send.assert_not_called()


@pytest.mark.django_db
class TestAnnouncementMessageSanitisation:
    """Tests for message sanitisation."""

    @patch(PATCH_SEND_EMAIL)
    def test_strips_dangerous_html(
        self, mock_send, actioning_user, business_area, ba_lead
    ):
        """Should strip script tags and other dangerous HTML."""
        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message='<p>Hello</p><script>alert("xss")</script>',
        )

        assert result["emails_sent"] == 1
        call_kwargs = mock_send.call_args[1]
        html_content = call_kwargs["html_content"]
        assert "<script>" not in html_content
        assert "Hello" in html_content

    @patch(PATCH_SEND_EMAIL)
    def test_allows_safe_html(self, mock_send, actioning_user, business_area, ba_lead):
        """Should allow safe HTML tags like p, strong, em, a."""
        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message='<p><strong>Important</strong>: <a href="https://example.com">Link</a></p>',
        )

        assert result["emails_sent"] == 1
        call_kwargs = mock_send.call_args[1]
        html_content = call_kwargs["html_content"]
        assert "<strong>Important</strong>" in html_content
        assert 'href="https://example.com"' in html_content


@pytest.mark.django_db
class TestAnnouncementPerGroupMessages:
    """Tests for per-group custom messages."""

    @patch(PATCH_SEND_EMAIL)
    def test_per_group_messages_applied(
        self,
        mock_send,
        actioning_user,
        business_area,
        project_with_members,
        ba_lead,
        project_lead,
    ):
        """Each group should receive their specific message."""
        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads", "project_leads"],
            custom_messages={
                "ba_leads": "<p>BA specific message</p>",
                "project_leads": "<p>PL specific message</p>",
            },
        )

        assert result["emails_sent"] == 2

        # Check that different messages were sent
        calls = mock_send.call_args_list
        ba_call = next(c for c in calls if c[1]["recipient_email"] == [ba_lead.email])
        pl_call = next(
            c for c in calls if c[1]["recipient_email"] == [project_lead.email]
        )

        assert "BA specific message" in ba_call[1]["html_content"]
        assert "PL specific message" in pl_call[1]["html_content"]


@pytest.mark.django_db
class TestAnnouncementDivisionScoping:
    """Tests for division-scoped announcements."""

    @patch(PATCH_SEND_EMAIL)
    def test_scoped_to_division(
        self, mock_send, actioning_user, division, business_area, ba_lead
    ):
        """Should only include recipients from the specified division."""
        # Create another division with a different BA lead
        other_division = Division.objects.create(name="Other Division", slug="other")
        other_lead = UserFactory(
            username="other_lead",
            email="other@dbca.wa.gov.au",
            is_staff=True,
            is_active=True,
        )
        other_agency = Agency.objects.create(name="Other Agency")
        BusinessArea.objects.create(
            name="Other BA",
            slug="other-ba",
            agency=other_agency,
            division=other_division,
            leader=other_lead,
            finance_admin=other_lead,
            data_custodian=other_lead,
        )

        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message="<p>BCS only</p>",
            division_slug="bcs",
        )

        # Only the BCS division BA lead should receive the email
        assert result["emails_sent"] == 1
        call_kwargs = mock_send.call_args[1]
        assert call_kwargs["recipient_email"] == [ba_lead.email]


@pytest.mark.django_db
class TestAnnouncementInvalidRecipients:
    """Tests for filtering invalid recipients."""

    @patch(PATCH_SEND_EMAIL)
    def test_excludes_inactive_users(self, mock_send, actioning_user, division):
        """Inactive users should not receive announcements."""
        inactive_lead = UserFactory(
            username="inactive",
            email="inactive@dbca.wa.gov.au",
            is_staff=True,
            is_active=False,
        )
        agency = Agency.objects.create(name="Inactive Agency")
        BusinessArea.objects.create(
            name="Inactive BA",
            slug="inactive-ba",
            agency=agency,
            division=division,
            leader=inactive_lead,
            finance_admin=inactive_lead,
            data_custodian=inactive_lead,
        )

        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message="<p>Test</p>",
        )

        assert result["emails_sent"] == 0
        mock_send.assert_not_called()

    @patch(PATCH_SEND_EMAIL)
    def test_excludes_non_dbca_emails(self, mock_send, actioning_user, division):
        """Users without @dbca.wa.gov.au emails should not receive announcements."""
        external_lead = UserFactory(
            username="external",
            email="external@gmail.com",
            is_staff=True,
            is_active=True,
        )
        agency = Agency.objects.create(name="External Agency")
        BusinessArea.objects.create(
            name="External BA",
            slug="external-ba",
            agency=agency,
            division=division,
            leader=external_lead,
            finance_admin=external_lead,
            data_custodian=external_lead,
        )

        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message="<p>Test</p>",
        )

        assert result["emails_sent"] == 0
        mock_send.assert_not_called()


@pytest.mark.django_db
class TestAnnouncementTestSend:
    """Tests for the single-recipient test-send path (test_recipient_pk)."""

    @patch(PATCH_SEND_EMAIL)
    def test_sends_single_email_to_test_recipient(
        self,
        mock_send,
        actioning_user,
        business_area,
        project_with_members,
        ba_lead,
        project_lead,
        team_member,
    ):
        """Only the test recipient is emailed, even with all groups selected."""
        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads", "project_leads", "team_members"],
            custom_message="<p>Test body</p>",
            test_recipient_pk=actioning_user.pk,
        )

        assert result["emails_sent"] == 1
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args[1]
        assert call_kwargs["recipient_email"] == [actioning_user.email]

    @patch(PATCH_SEND_EMAIL)
    def test_bypasses_group_resolution(
        self, mock_send, actioning_user, business_area, ba_lead
    ):
        """The test recipient need not belong to any selected group."""
        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message="<p>Test body</p>",
            test_recipient_pk=actioning_user.pk,
        )

        assert result["emails_sent"] == 1
        call_kwargs = mock_send.call_args[1]
        # actioning_user is not the BA lead, yet still receives the test email.
        assert call_kwargs["recipient_email"] == [actioning_user.email]

    @patch(PATCH_SEND_EMAIL)
    def test_subject_is_prefixed_with_test(
        self, mock_send, actioning_user, business_area
    ):
        """The test email subject is prefixed with [TEST]."""
        NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message="<p>Test body</p>",
            subject="SPMS: Big News",
            test_recipient_pk=actioning_user.pk,
        )

        call_kwargs = mock_send.call_args[1]
        assert call_kwargs["subject"] == "[TEST] SPMS: Big News"

    @patch(PATCH_SEND_EMAIL)
    def test_records_as_test_send(self, mock_send, actioning_user, business_area):
        """A test send is recorded and flagged as a test in the history."""
        from adminoptions.models import EmailRecord

        NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message="<p>Test body</p>",
            test_recipient_pk=actioning_user.pk,
        )

        record = EmailRecord.objects.filter(
            kind=EmailRecord.EmailKind.ANNOUNCEMENT
        ).latest("id")
        assert record.is_test is True
        assert record.emails_sent == 1
        assert record.recipients[0]["email"] == actioning_user.email

    @patch(PATCH_SEND_EMAIL)
    def test_missing_recipient_returns_error(
        self, mock_send, actioning_user, business_area
    ):
        """A non-existent test recipient sends nothing and reports an error."""
        result = NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["ba_leads"],
            custom_message="<p>Test body</p>",
            test_recipient_pk=999999,
        )

        assert result["emails_sent"] == 0
        assert result["errors"]
        mock_send.assert_not_called()

    @patch(PATCH_SEND_EMAIL)
    def test_uses_selected_group_message_for_per_group(
        self, mock_send, actioning_user, business_area
    ):
        """With per-group messages, the first selected group's message is used."""
        NotificationService.send_announcement_emails(
            actioning_user=actioning_user,
            recipient_groups=["project_leads", "team_members"],
            custom_messages={
                "ba_leads": "<p>BA message</p>",
                "project_leads": "<p>PL message</p>",
                "team_members": "<p>TM message</p>",
            },
            test_recipient_pk=actioning_user.pk,
        )

        html = mock_send.call_args[1]["html_content"]
        assert "PL message" in html
