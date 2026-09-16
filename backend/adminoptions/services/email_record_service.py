from django.conf import settings

from adminoptions.models import EmailRecord


class EmailRecordService:
    """Persistence and retrieval of outbound correspondence records."""

    @staticmethod
    def record(
        *,
        kind,
        subject,
        initiator,
        recipient_groups,
        recipients,
        emails_sent,
        body="",
        group_messages=None,
        is_test=False,
    ):
        """
        Create an EmailRecord for a completed send.

        Best-effort: never raises to the caller. A record is only created when
        at least one recipient received the email.

        When ``is_test`` is True, the send occurred while email testing mode was
        active (delivery redirected to the test user), so the record is flagged
        to distinguish it from official correspondence.

        Returns the created EmailRecord, or None when nothing was sent or when
        persistence failed.
        """
        if not emails_sent or emails_sent < 1:
            return None

        try:
            return EmailRecord.objects.create(
                kind=kind,
                subject=subject or "",
                body=body or "",
                group_messages=group_messages or {},
                recipient_groups=recipient_groups or [],
                recipients=recipients or [],
                emails_sent=emails_sent,
                is_test=bool(is_test),
                initiator=initiator,
            )
        except Exception as e:
            settings.LOGGER.error(f"Failed to record email correspondence: {e}")
            return None

    @staticmethod
    def is_email_testing_active():
        """
        Return True when email testing mode is active in AdminOptions.

        Mirrors the check inside send_email_with_embedded_image so a record can
        be flagged as a test send. Best-effort: returns False on any error.
        """
        try:
            from adminoptions.models import AdminOptions

            admin_opts = AdminOptions.objects.first()
            return bool(
                admin_opts
                and admin_opts.email_testing_mode
                and admin_opts.email_test_user
            )
        except Exception as e:
            settings.LOGGER.error(f"Failed to determine email testing mode: {e}")
            return False

    @staticmethod
    def list_records():
        """Return all email records, most recent first, with initiator prefetched."""
        return EmailRecord.objects.select_related("initiator").all()

    @staticmethod
    def get_record(pk):
        """Return a single email record by primary key (raises DoesNotExist)."""
        return EmailRecord.objects.select_related("initiator").get(pk=pk)
