"""
Tests for the email helper functions in config/helpers.py.

Focuses on send_email_with_embedded_image which is the single gateway
for all outgoing emails. Tests verify:
- Test mode redirection
- Test mode deduplication
- Test mode banner injection
- Normal mode passthrough
- Logo CID attachment
"""

from unittest.mock import MagicMock, mock_open, patch

import pytest


@pytest.fixture
def mock_admin_opts_test_mode(db):
    """Create AdminOptions with test mode enabled."""
    from adminoptions.models import AdminOptions
    from common.tests.factories import UserFactory

    test_user = UserFactory(
        username="test_recipient",
        email="test@dbca.wa.gov.au",
        first_name="Test",
        last_name="Recipient",
    )
    opts = AdminOptions.objects.create(
        email_testing_mode=True,
        email_test_user=test_user,
    )
    return opts, test_user


@pytest.fixture
def mock_admin_opts_normal(db):
    """Create AdminOptions with test mode disabled."""
    from adminoptions.models import AdminOptions

    return AdminOptions.objects.create(
        email_testing_mode=False,
        email_test_user=None,
    )


class TestSendEmailWithEmbeddedImage:
    """Tests for the send_email_with_embedded_image function."""

    @patch("smtplib.SMTP")
    @patch("os.path.exists", return_value=False)
    @pytest.mark.integration
    def test_normal_mode_sends_to_original_recipient(
        self, mock_exists, mock_smtp_cls, mock_admin_opts_normal
    ):
        """In normal mode, email goes to the original recipient."""
        from config.helpers import send_email_with_embedded_image

        mock_smtp_instance = MagicMock()
        mock_smtp_cls.return_value.__enter__ = MagicMock(
            return_value=mock_smtp_instance
        )
        mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

        send_email_with_embedded_image(
            recipient_email=["user@dbca.wa.gov.au"],
            subject="Test Subject",
            html_content="<p>Hello</p>",
        )

        mock_smtp_cls.assert_called_once()
        mock_smtp_instance.send_message.assert_called_once()
        sent_msg = mock_smtp_instance.send_message.call_args[0][0]
        assert sent_msg["To"] == "user@dbca.wa.gov.au"

    @patch("smtplib.SMTP")
    @patch("os.path.exists", return_value=False)
    @patch("django.core.cache.cache.get", return_value=None)
    @patch("django.core.cache.cache.set")
    @pytest.mark.integration
    def test_test_mode_redirects_to_test_user(
        self,
        mock_cache_set,
        mock_cache_get,
        mock_exists,
        mock_smtp_cls,
        mock_admin_opts_test_mode,
    ):
        """In test mode, email is redirected to the test user."""
        from config.helpers import send_email_with_embedded_image

        mock_smtp_instance = MagicMock()
        mock_smtp_cls.return_value.__enter__ = MagicMock(
            return_value=mock_smtp_instance
        )
        mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)
        _, test_user = mock_admin_opts_test_mode

        send_email_with_embedded_image(
            recipient_email=["original@dbca.wa.gov.au"],
            subject="Test Subject",
            html_content="<p>Hello</p>",
        )

        mock_smtp_cls.assert_called_once()
        mock_smtp_instance.send_message.assert_called_once()
        sent_msg = mock_smtp_instance.send_message.call_args[0][0]
        # Recipient should be redirected to test user
        assert test_user.email in sent_msg["To"]
        # Subject should have [TEST] prefix
        assert sent_msg["Subject"].startswith("[TEST]")

    @patch("smtplib.SMTP")
    @patch("os.path.exists", return_value=False)
    @patch("django.core.cache.cache.get", return_value=None)
    @patch("django.core.cache.cache.set")
    @pytest.mark.integration
    def test_test_mode_does_not_double_prefix_subject(
        self,
        mock_cache_set,
        mock_cache_get,
        mock_exists,
        mock_smtp_cls,
        mock_admin_opts_test_mode,
    ):
        """An already-[TEST]-prefixed subject is not prefixed a second time."""
        from config.helpers import send_email_with_embedded_image

        mock_smtp_instance = MagicMock()
        mock_smtp_cls.return_value.__enter__ = MagicMock(
            return_value=mock_smtp_instance
        )
        mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

        send_email_with_embedded_image(
            recipient_email=["original@dbca.wa.gov.au"],
            subject="[TEST] Already Prefixed",
            html_content="<p>Hello</p>",
        )

        sent_msg = mock_smtp_instance.send_message.call_args[0][0]
        assert sent_msg["Subject"] == "[TEST] Already Prefixed"
        assert not sent_msg["Subject"].startswith("[TEST] [TEST]")

    @patch("smtplib.SMTP")
    @patch("os.path.exists", return_value=False)
    @patch("django.core.cache.cache.get", return_value=True)
    @pytest.mark.integration
    def test_test_mode_deduplication_skips_duplicate(
        self,
        mock_cache_get,
        mock_exists,
        mock_smtp_cls,
        mock_admin_opts_test_mode,
    ):
        """In test mode, duplicate emails (same subject within window) are skipped."""
        from config.helpers import send_email_with_embedded_image

        send_email_with_embedded_image(
            recipient_email=["original@dbca.wa.gov.au"],
            subject="Duplicate Subject",
            html_content="<p>Hello</p>",
        )

        # Email should NOT be sent (dedup cache hit)
        mock_smtp_cls.assert_not_called()

    @patch("smtplib.SMTP")
    @patch("os.path.exists", return_value=False)
    @patch("django.core.cache.cache.get", return_value=None)
    @patch("django.core.cache.cache.set")
    @pytest.mark.integration
    def test_test_mode_injects_banner(
        self,
        mock_cache_set,
        mock_cache_get,
        mock_exists,
        mock_smtp_cls,
        mock_admin_opts_test_mode,
    ):
        """In test mode, a test banner is injected into the HTML content."""
        from config.helpers import send_email_with_embedded_image

        mock_smtp_instance = MagicMock()
        mock_smtp_cls.return_value.__enter__ = MagicMock(
            return_value=mock_smtp_instance
        )
        mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

        send_email_with_embedded_image(
            recipient_email=["original@dbca.wa.gov.au"],
            subject="Banner Test",
            html_content='<html><body style="margin:0"><p>Hello</p></body></html>',
        )

        # Get the sent message and extract HTML content from it
        mock_smtp_instance.send_message.assert_called_once()
        sent_msg = mock_smtp_instance.send_message.call_args[0][0]
        # Walk the MIME parts to find the HTML content
        html_content = None
        for part in sent_msg.walk():
            if part.get_content_type() == "text/html":
                html_content = part.get_payload(decode=True).decode("utf-8")
                break
        assert html_content is not None
        assert "Test Mode" in html_content
        assert "redirected" in html_content
        assert "original@dbca.wa.gov.au" in html_content

    @patch("smtplib.SMTP")
    @pytest.mark.integration
    def test_logo_attachment_when_file_exists(
        self, mock_smtp_cls, mock_admin_opts_normal
    ):
        """Logo should be attached as CID image when file exists."""
        from config.helpers import send_email_with_embedded_image

        mock_smtp_instance = MagicMock()
        mock_smtp_cls.return_value.__enter__ = MagicMock(
            return_value=mock_smtp_instance
        )
        mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

        # Mock os.path.exists to return True for logo, and provide fake image data
        with (
            patch("os.path.exists", return_value=True),
            patch("builtins.open", mock_open(read_data=b"\x89PNG\r\n")),
        ):
            send_email_with_embedded_image(
                recipient_email=["user@dbca.wa.gov.au"],
                subject="Logo Test",
                html_content="<p>Hello</p>",
            )

        # Should have sent the message (with logo attached in the MIME structure)
        mock_smtp_instance.send_message.assert_called_once()
        sent_msg = mock_smtp_instance.send_message.call_args[0][0]
        # Check that the message has an image part (the logo)
        content_types = [part.get_content_type() for part in sent_msg.walk()]
        assert "image/png" in content_types

    @patch("smtplib.SMTP")
    @patch("os.path.exists", return_value=False)
    @pytest.mark.integration
    def test_no_logo_when_file_missing(
        self, mock_exists, mock_smtp_cls, mock_admin_opts_normal
    ):
        """Email should still send when logo file is missing."""
        from config.helpers import send_email_with_embedded_image

        mock_smtp_instance = MagicMock()
        mock_smtp_cls.return_value.__enter__ = MagicMock(
            return_value=mock_smtp_instance
        )
        mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

        send_email_with_embedded_image(
            recipient_email=["user@dbca.wa.gov.au"],
            subject="No Logo Test",
            html_content="<p>Hello</p>",
        )

        mock_smtp_instance.send_message.assert_called_once()
        sent_msg = mock_smtp_instance.send_message.call_args[0][0]
        # Logo should NOT be attached — no image parts
        content_types = [part.get_content_type() for part in sent_msg.walk()]
        assert "image/png" not in content_types
