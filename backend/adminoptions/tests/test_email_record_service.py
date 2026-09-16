"""
Tests for EmailRecordService.

Covers the best-effort recording contract: no record when nothing was sent,
a record created when at least one email was sent, and exception safety.
"""

from unittest.mock import patch

import pytest

from adminoptions.models import EmailRecord
from adminoptions.services.email_record_service import EmailRecordService
from common.tests.factories import UserFactory


@pytest.mark.django_db
class TestEmailRecordService:
    def test_no_record_when_nothing_sent(self):
        """No record is created when emails_sent is 0."""
        result = EmailRecordService.record(
            kind=EmailRecord.EmailKind.ANNOUNCEMENT,
            subject="Nothing sent",
            initiator=None,
            recipient_groups=["ba_leads"],
            recipients=[],
            emails_sent=0,
        )

        assert result is None
        assert EmailRecord.objects.count() == 0

    def test_creates_record_when_sent(self):
        """A record is created with the provided fields when emails_sent >= 1."""
        user = UserFactory()
        result = EmailRecordService.record(
            kind=EmailRecord.EmailKind.ANNOUNCEMENT,
            subject="Sent",
            initiator=user,
            recipient_groups=["ba_leads", "project_leads"],
            recipients=[
                {
                    "pk": user.pk,
                    "name": "X",
                    "email": "x@dbca.wa.gov.au",
                    "group": "ba_leads",
                }
            ],
            emails_sent=1,
            body="<p>Hello</p>",
        )

        assert result is not None
        assert EmailRecord.objects.count() == 1
        assert result.subject == "Sent"
        assert result.body == "<p>Hello</p>"
        assert result.recipient_groups == ["ba_leads", "project_leads"]
        assert result.initiator == user

    def test_stores_group_messages(self):
        result = EmailRecordService.record(
            kind=EmailRecord.EmailKind.ANNOUNCEMENT,
            subject="Per group",
            initiator=None,
            recipient_groups=["ba_leads"],
            recipients=[],
            emails_sent=5,
            group_messages={"ba_leads": "<p>BA</p>"},
        )

        assert result.group_messages == {"ba_leads": "<p>BA</p>"}

    def test_records_is_test_flag(self):
        result = EmailRecordService.record(
            kind=EmailRecord.EmailKind.ANNOUNCEMENT,
            subject="Test send",
            initiator=None,
            recipient_groups=["ba_leads"],
            recipients=[],
            emails_sent=1,
            is_test=True,
        )

        assert result is not None
        assert result.is_test is True

    def test_defaults_is_test_false(self):
        result = EmailRecordService.record(
            kind=EmailRecord.EmailKind.ANNOUNCEMENT,
            subject="Official send",
            initiator=None,
            recipient_groups=["ba_leads"],
            recipients=[],
            emails_sent=1,
        )

        assert result.is_test is False

    def test_is_email_testing_active_reflects_admin_options(self):
        from adminoptions.models import AdminOptions

        # No AdminOptions -> False
        assert EmailRecordService.is_email_testing_active() is False

        user = UserFactory()
        opts = AdminOptions.objects.create(
            email_testing_mode=True,
            email_test_user=user,
        )
        assert EmailRecordService.is_email_testing_active() is True

        opts.email_testing_mode = False
        opts.save()
        assert EmailRecordService.is_email_testing_active() is False

    def test_exception_is_swallowed(self):
        """A persistence failure returns None and does not raise."""
        with patch(
            "adminoptions.services.email_record_service.EmailRecord.objects.create",
            side_effect=Exception("db down"),
        ):
            result = EmailRecordService.record(
                kind=EmailRecord.EmailKind.ANNOUNCEMENT,
                subject="Boom",
                initiator=None,
                recipient_groups=["ba_leads"],
                recipients=[],
                emails_sent=1,
            )

        assert result is None
