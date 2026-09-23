"""
Tests for the Announcement and Homepage Banner API endpoints.

Covers:
- HomepageBannerSettings: GET (all users), PUT (superuser only)
- SendAnnouncement: POST with validation, recipient groups, permissions
- AnnouncementEmailPreview: POST rendering
- Model fields: show_homepage_message, homepage_message
"""

from unittest.mock import MagicMock, patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from adminoptions.models import AdminOptions
from common.tests.factories import UserFactory


@pytest.fixture
def superuser(db):
    return UserFactory(
        username="superadmin",
        email="superadmin@dbca.wa.gov.au",
        is_superuser=True,
        is_staff=True,
    )


@pytest.fixture
def regular_user(db):
    return UserFactory(
        username="regular",
        email="regular@dbca.wa.gov.au",
        is_superuser=False,
        is_staff=True,
    )


@pytest.fixture
def non_staff_user(db):
    return UserFactory(
        username="external",
        email="external@dbca.wa.gov.au",
        is_superuser=False,
        is_staff=False,
    )


@pytest.fixture
def admin_options(db, superuser):
    return AdminOptions.objects.create(
        maintainer=superuser,
        email_testing_mode=False,
    )


BANNER_URL = "/api/v1/adminoptions/homepage-banner"
SEND_ANNOUNCEMENT_URL = "/api/v1/adminoptions/send-announcement"
ANNOUNCEMENT_PREVIEW_URL = "/api/v1/adminoptions/announcement-email-preview"


# =============================================================================
# HomepageBannerSettings Tests
# =============================================================================


class TestHomepageBannerGet:
    """Tests for GET /api/v1/adminoptions/homepage-banner"""

    @pytest.mark.integration
    def test_requires_authentication(self, db, admin_options):
        """Unauthenticated request should be rejected."""
        client = APIClient()
        response = client.get(BANNER_URL)
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ]

    @pytest.mark.integration
    def test_returns_defaults_when_disabled(self, regular_user, admin_options):
        """Should return show_homepage_message=False by default."""
        client = APIClient()
        client.force_authenticate(user=regular_user)
        response = client.get(BANNER_URL)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["show_homepage_message"] is False
        assert response.data["homepage_message"] is None

    @pytest.mark.integration
    def test_returns_enabled_banner(self, regular_user, admin_options):
        """Should return banner data when enabled."""
        admin_options.show_homepage_message = True
        admin_options.homepage_message = "<p>System maintenance tonight.</p>"
        admin_options.save()

        client = APIClient()
        client.force_authenticate(user=regular_user)
        response = client.get(BANNER_URL)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["show_homepage_message"] is True
        assert response.data["homepage_message"] == "<p>System maintenance tonight.</p>"

    @pytest.mark.integration
    def test_regular_user_can_read(self, regular_user, admin_options):
        """Non-superusers should be able to read banner settings."""
        client = APIClient()
        client.force_authenticate(user=regular_user)
        response = client.get(BANNER_URL)

        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.integration
    def test_superuser_can_read(self, superuser, admin_options):
        """Superusers should be able to read banner settings."""
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.get(BANNER_URL)

        assert response.status_code == status.HTTP_200_OK


class TestHomepageBannerPut:
    """Tests for PUT /api/v1/adminoptions/homepage-banner"""

    @pytest.mark.integration
    def test_superuser_can_enable_banner(self, superuser, admin_options):
        """Superuser should be able to enable the banner."""
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.put(
            BANNER_URL,
            {
                "show_homepage_message": True,
                "homepage_message": "<p>Important update!</p>",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "updated"

        admin_options.refresh_from_db()
        assert admin_options.show_homepage_message is True
        assert admin_options.homepage_message == "<p>Important update!</p>"

    @pytest.mark.integration
    def test_superuser_can_disable_banner(self, superuser, admin_options):
        """Superuser should be able to disable the banner."""
        admin_options.show_homepage_message = True
        admin_options.homepage_message = "<p>Old message</p>"
        admin_options.save()

        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.put(
            BANNER_URL,
            {"show_homepage_message": False, "homepage_message": ""},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK

        admin_options.refresh_from_db()
        assert admin_options.show_homepage_message is False
        assert admin_options.homepage_message == ""

    @pytest.mark.integration
    def test_non_superuser_cannot_update(self, regular_user, admin_options):
        """Non-superusers should not be able to update banner settings."""
        client = APIClient()
        client.force_authenticate(user=regular_user)
        response = client.put(
            BANNER_URL,
            {"show_homepage_message": True, "homepage_message": "<p>Hack!</p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.integration
    def test_requires_authentication(self, db, admin_options):
        """Unauthenticated request should be rejected."""
        client = APIClient()
        response = client.put(
            BANNER_URL,
            {"show_homepage_message": True, "homepage_message": "<p>Test</p>"},
            format="json",
        )
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ]

    @pytest.mark.integration
    def test_defaults_to_false_when_missing(self, superuser, admin_options):
        """Should default show_homepage_message to False when not provided."""
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.put(BANNER_URL, {}, format="json")

        assert response.status_code == status.HTTP_200_OK

        admin_options.refresh_from_db()
        assert admin_options.show_homepage_message is False


# =============================================================================
# SendAnnouncement Tests
# =============================================================================


class TestSendAnnouncementValidation:
    """Tests for POST /api/v1/adminoptions/send-announcement validation"""

    @pytest.mark.integration
    def test_requires_admin(self, non_staff_user, admin_options):
        """Non-admin users should be rejected."""
        client = APIClient()
        client.force_authenticate(user=non_staff_user)
        response = client.post(
            SEND_ANNOUNCEMENT_URL,
            {
                "recipient_groups": ["ba_leads"],
                "custom_message": "<p>Hello</p>",
            },
            format="json",
        )
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ]

    @pytest.mark.integration
    def test_requires_authentication(self, db, admin_options):
        """Unauthenticated request should be rejected."""
        client = APIClient()
        response = client.post(
            SEND_ANNOUNCEMENT_URL,
            {
                "recipient_groups": ["ba_leads"],
                "custom_message": "<p>Hello</p>",
            },
            format="json",
        )
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ]

    @pytest.mark.integration
    def test_requires_recipient_groups(self, superuser, admin_options):
        """Should return 400 when no recipient groups are provided."""
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.post(
            SEND_ANNOUNCEMENT_URL,
            {"recipient_groups": [], "custom_message": "<p>Hello</p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "recipient group" in response.data["error"].lower()

    @pytest.mark.integration
    def test_requires_message(self, superuser, admin_options):
        """Should return 400 when no message is provided."""
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.post(
            SEND_ANNOUNCEMENT_URL,
            {"recipient_groups": ["ba_leads"]},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "message" in response.data["error"].lower()

    @pytest.mark.integration
    def test_rejects_invalid_group(self, superuser, admin_options):
        """Should return 400 for invalid recipient group names."""
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.post(
            SEND_ANNOUNCEMENT_URL,
            {
                "recipient_groups": ["invalid_group"],
                "custom_message": "<p>Hello</p>",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid" in response.data["error"].lower()


class TestSendAnnouncementExecution:
    """Tests for POST /api/v1/adminoptions/send-announcement execution"""

    @pytest.mark.integration
    @patch(
        "documents.services.notification_service.NotificationService.send_announcement_emails"
    )
    def test_successful_send(self, mock_send, superuser, admin_options):
        """Should call NotificationService and return result."""
        mock_send.return_value = {"emails_sent": 5, "errors": []}

        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.post(
            SEND_ANNOUNCEMENT_URL,
            {
                "recipient_groups": ["ba_leads", "project_leads"],
                "custom_message": "<p>Important announcement</p>",
                "subject": "SPMS: Test Announcement",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["emails_sent"] == 5
        assert response.data["errors"] == []

        mock_send.assert_called_once_with(
            actioning_user=superuser,
            recipient_groups=["ba_leads", "project_leads"],
            excluded_user_ids=[],
            recipient_user_pks=None,
            custom_message="<p>Important announcement</p>",
            custom_messages=None,
            subject="SPMS: Test Announcement",
            division_slug=None,
            test_recipient_pk=None,
        )

    @pytest.mark.integration
    @patch(
        "documents.services.notification_service.NotificationService.send_announcement_emails"
    )
    def test_send_with_excluded_users(self, mock_send, superuser, admin_options):
        """Should pass excluded_user_ids to the service."""
        mock_send.return_value = {"emails_sent": 3, "errors": []}

        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.post(
            SEND_ANNOUNCEMENT_URL,
            {
                "recipient_groups": ["ba_leads"],
                "custom_message": "<p>Hello</p>",
                "excluded_user_ids": [1, 2, 3],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args[1]
        assert call_kwargs["excluded_user_ids"] == [1, 2, 3]

    @pytest.mark.integration
    @patch(
        "documents.services.notification_service.NotificationService.send_announcement_emails"
    )
    def test_send_with_per_group_messages(self, mock_send, superuser, admin_options):
        """Should pass custom_messages dict for per-group messaging."""
        mock_send.return_value = {"emails_sent": 10, "errors": []}

        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.post(
            SEND_ANNOUNCEMENT_URL,
            {
                "recipient_groups": ["ba_leads", "project_leads"],
                "custom_messages": {
                    "ba_leads": "<p>BA Lead message</p>",
                    "project_leads": "<p>PL message</p>",
                },
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        call_kwargs = mock_send.call_args[1]
        assert call_kwargs["custom_messages"]["ba_leads"] == "<p>BA Lead message</p>"

    @pytest.mark.integration
    @patch(
        "documents.services.notification_service.NotificationService.send_announcement_emails"
    )
    def test_send_with_division(self, mock_send, superuser, admin_options):
        """Should pass division slug to the service."""
        mock_send.return_value = {"emails_sent": 2, "errors": []}

        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.post(
            SEND_ANNOUNCEMENT_URL,
            {
                "recipient_groups": ["ba_leads"],
                "custom_message": "<p>Division announcement</p>",
                "division": "bcs",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        call_kwargs = mock_send.call_args[1]
        assert call_kwargs["division_slug"] == "bcs"

    @pytest.mark.integration
    @patch(
        "documents.services.notification_service.NotificationService.send_announcement_emails"
    )
    def test_send_with_test_recipient(self, mock_send, superuser, admin_options):
        """Should pass test_recipient_pk to the service for a test send."""
        mock_send.return_value = {"emails_sent": 1, "errors": []}

        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.post(
            SEND_ANNOUNCEMENT_URL,
            {
                "recipient_groups": ["ba_leads"],
                "custom_message": "<p>Hello</p>",
                "test_recipient_pk": superuser.pk,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["emails_sent"] == 1
        call_kwargs = mock_send.call_args[1]
        assert call_kwargs["test_recipient_pk"] == superuser.pk

    @pytest.mark.integration
    @patch(
        "documents.services.notification_service.NotificationService.send_announcement_emails"
    )
    def test_handles_service_exception(self, mock_send, superuser, admin_options):
        """Should return 500 if the service raises an exception."""
        mock_send.side_effect = Exception("SMTP connection failed")

        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.post(
            SEND_ANNOUNCEMENT_URL,
            {
                "recipient_groups": ["ba_leads"],
                "custom_message": "<p>Hello</p>",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR


# =============================================================================
# AnnouncementEmailPreview Tests
# =============================================================================


class TestAnnouncementEmailPreview:
    """Tests for POST /api/v1/adminoptions/announcement-email-preview"""

    @pytest.mark.integration
    def test_requires_admin(self, non_staff_user, admin_options):
        """Non-admin users should be rejected."""
        client = APIClient()
        client.force_authenticate(user=non_staff_user)
        response = client.post(
            ANNOUNCEMENT_PREVIEW_URL,
            {"custom_message": "<p>Test</p>"},
            format="json",
        )
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ]

    @pytest.mark.integration
    def test_renders_template(self, superuser, admin_options):
        """Should render the announcement email template and return HTML."""
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.post(
            ANNOUNCEMENT_PREVIEW_URL,
            {
                "custom_message": "<p>Preview message</p>",
                "subject": "SPMS: Test",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert "html" in response.data
        assert "Preview message" in response.data["html"]
        assert "Announcement" in response.data["html"]

    @pytest.mark.integration
    def test_renders_without_custom_message(self, superuser, admin_options):
        """Should render with default text when no custom message provided."""
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.post(
            ANNOUNCEMENT_PREVIEW_URL,
            {},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert "html" in response.data
        assert "Please log in to SPMS" in response.data["html"]

    @pytest.mark.integration
    def test_includes_actioning_user_info(self, superuser, admin_options):
        """Should include the requesting user's name in the preview."""
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.post(
            ANNOUNCEMENT_PREVIEW_URL,
            {"custom_message": "<p>Test</p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        # The superuser's display name should appear
        assert superuser.email in response.data["html"]


# =============================================================================
# Model Field Tests
# =============================================================================


class TestAdminOptionsModelBannerFields:
    """Tests for the new banner fields on AdminOptions model"""

    @pytest.mark.integration
    def test_default_values(self, admin_options):
        """New fields should have correct defaults."""
        assert admin_options.show_homepage_message is False
        assert admin_options.homepage_message is None

    @pytest.mark.integration
    def test_can_set_banner_fields(self, admin_options):
        """Should be able to set and persist banner fields."""
        admin_options.show_homepage_message = True
        admin_options.homepage_message = "<p>Hello world</p>"
        admin_options.save()

        admin_options.refresh_from_db()
        assert admin_options.show_homepage_message is True
        assert admin_options.homepage_message == "<p>Hello world</p>"

    @pytest.mark.integration
    def test_banner_fields_in_serialiser(self, superuser, admin_options):
        """Banner fields should be included in the AdminOptions serialiser."""
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.get("/api/v1/adminoptions/list")

        assert response.status_code == status.HTTP_200_OK
        data = response.data[0]
        assert "show_homepage_message" in data
        assert "homepage_message" in data

    @pytest.mark.integration
    def test_banner_fields_updatable_via_put(self, superuser, admin_options):
        """Banner fields should be updatable via the AdminControlsDetail PUT."""
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.put(
            f"/api/v1/adminoptions/{admin_options.pk}",
            {
                "show_homepage_message": True,
                "homepage_message": "<p>Updated via PUT</p>",
                "maintainer": superuser.pk,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_202_ACCEPTED
        admin_options.refresh_from_db()
        assert admin_options.show_homepage_message is True
        assert admin_options.homepage_message == "<p>Updated via PUT</p>"


# =============================================================================
# SendAllTestEmails includes announcement template
# =============================================================================


class TestSendAllTestEmailsIncludesAnnouncement:
    """Verify the announcement template is in the SendAllTestEmails list."""

    @pytest.mark.integration
    def test_announcement_template_in_list(self, superuser, admin_options):
        """The announcement_email template should be in the TEMPLATES list."""
        from adminoptions.views import SendAllTestEmails

        template_names = [t["name"] for t in SendAllTestEmails.TEMPLATES]
        assert "announcement_email" in template_names

    @pytest.mark.integration
    def test_announcement_template_renders(self, superuser, admin_options):
        """The announcement template should render without errors."""
        admin_options.email_test_user = superuser
        admin_options.email_testing_mode = True
        admin_options.save()

        client = APIClient()
        client.force_authenticate(user=superuser)

        with patch("smtplib.SMTP") as mock_smtp:
            mock_instance = MagicMock()
            mock_smtp.return_value.__enter__ = MagicMock(return_value=mock_instance)
            mock_smtp.return_value.__exit__ = MagicMock(return_value=False)

            response = client.post(
                "/api/v1/adminoptions/send-all-test-emails",
                {"template_name": "announcement_email"},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        announcement_result = next(
            (r for r in results if r["template"] == "announcement_email"), None
        )
        assert announcement_result is not None
        assert announcement_result["status"] == "ok"
