"""
Tests for the EmailRecord model.

Covers creation, defaults, ordering, and initiator behaviour when the
initiating user is deleted.
"""

import pytest

from adminoptions.models import EmailRecord
from common.tests.factories import UserFactory


@pytest.mark.django_db
class TestEmailRecordModel:
    def test_create_with_defaults(self):
        """A record can be created with minimal fields and sensible defaults."""
        user = UserFactory()
        record = EmailRecord.objects.create(
            kind=EmailRecord.EmailKind.ANNOUNCEMENT,
            subject="SPMS: Announcement",
            initiator=user,
            emails_sent=3,
        )

        assert record.pk is not None
        assert record.body == ""
        assert record.group_messages == {}
        assert record.recipient_groups == []
        assert record.recipients == []
        assert record.is_test is False
        assert record.created_at is not None

    def test_is_test_flag(self):
        record = EmailRecord.objects.create(
            kind=EmailRecord.EmailKind.ANNOUNCEMENT,
            subject="Test send",
            emails_sent=1,
            is_test=True,
        )
        assert record.is_test is True
        assert str(record).startswith("[TEST]")

    def test_str_representation(self):
        record = EmailRecord.objects.create(
            kind=EmailRecord.EmailKind.NEW_CYCLE,
            subject="SPMS: New Reporting Cycle Open",
            emails_sent=1,
        )
        assert "New Reporting Cycle" in str(record)
        assert "New Reporting Cycle Open" in str(record)

    def test_ordering_most_recent_first(self):
        first = EmailRecord.objects.create(
            kind=EmailRecord.EmailKind.ANNOUNCEMENT,
            subject="First",
            emails_sent=1,
        )
        second = EmailRecord.objects.create(
            kind=EmailRecord.EmailKind.ANNOUNCEMENT,
            subject="Second",
            emails_sent=1,
        )

        records = list(EmailRecord.objects.all())
        assert records[0] == second
        assert records[1] == first

    def test_initiator_set_null_on_user_delete(self):
        """Deleting the initiating user retains the record with initiator=None."""
        user = UserFactory()
        record = EmailRecord.objects.create(
            kind=EmailRecord.EmailKind.ANNOUNCEMENT,
            subject="Kept after delete",
            initiator=user,
            emails_sent=2,
        )

        user.delete()
        record.refresh_from_db()

        assert EmailRecord.objects.filter(pk=record.pk).exists()
        assert record.initiator is None

    def test_stores_json_payloads(self):
        record = EmailRecord.objects.create(
            kind=EmailRecord.EmailKind.ANNOUNCEMENT,
            subject="With payloads",
            emails_sent=2,
            recipient_groups=["ba_leads", "project_leads"],
            recipients=[
                {
                    "pk": 1,
                    "name": "A",
                    "email": "a@dbca.wa.gov.au",
                    "group": "ba_leads",
                },
                {
                    "pk": 2,
                    "name": "B",
                    "email": "b@dbca.wa.gov.au",
                    "group": "project_leads",
                },
            ],
            group_messages={"ba_leads": "<p>Hi</p>"},
        )
        record.refresh_from_db()

        assert record.recipient_groups == ["ba_leads", "project_leads"]
        assert len(record.recipients) == 2
        assert record.group_messages["ba_leads"] == "<p>Hi</p>"
