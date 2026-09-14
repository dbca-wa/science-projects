"""
Document edit exception service.

Manages time-limited grants that allow specific users to edit the rich text
fields of locked project documents, without ever conferring the ability to
change a document's approval status.

Expiry is handled lazily: any expired exception encountered during a fetch or
permission check is deleted, so persisted rows always represent access that is
still in effect.
"""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from users.models import User

from ..models import DocumentEditException


class EditExceptionService:
    """Business logic for document edit exceptions."""

    MIN_DAYS = 1
    MAX_DAYS = 7

    @staticmethod
    def purge_expired(document=None) -> int:
        """
        Delete expired exceptions.

        When a document is supplied, only that document's expired exceptions
        are removed; otherwise all expired exceptions are removed. Returns the
        number of rows deleted.
        """
        now = timezone.now()
        queryset = DocumentEditException.objects.filter(expires_at__lte=now)
        if document is not None:
            queryset = queryset.filter(document=document)
        deleted, _ = queryset.delete()
        return deleted

    @staticmethod
    def get_eligible_users(document):
        """
        Return the users who may be granted an exception for this document.

        Eligible users are every member of the document's project team
        (which includes the project leader) plus the leader of the project's
        business area. The list is deduplicated.
        """
        project = document.project

        member_ids = set(project.members.values_list("user_id", flat=True))

        business_area = getattr(project, "business_area", None)
        ba_leader = getattr(business_area, "leader", None)
        if ba_leader is not None:
            member_ids.add(ba_leader.pk)

        return User.objects.filter(pk__in=member_ids)

    @staticmethod
    def is_eligible_user(document, user) -> bool:
        """Whether the user may be granted an exception for this document."""
        return (
            EditExceptionService.get_eligible_users(document)
            .filter(pk=user.pk)
            .exists()
        )

    @staticmethod
    def has_active_exception(user, document, now=None) -> bool:
        """
        Whether the user currently holds an active exception for the document.

        Expired exceptions for the document are purged as a side effect so the
        table does not accumulate stale rows.
        """
        EditExceptionService.purge_expired(document)
        now = now or timezone.now()
        return DocumentEditException.objects.filter(
            document=document,
            user=user,
            expires_at__gt=now,
        ).exists()

    @staticmethod
    def list_active(document):
        """
        Return the active exceptions for a document, purging any expired ones.
        """
        EditExceptionService.purge_expired(document)
        return (
            DocumentEditException.objects.filter(
                document=document,
                expires_at__gt=timezone.now(),
            )
            .select_related("user", "granted_by")
            .order_by("expires_at")
        )

    @staticmethod
    def _validate_days(days):
        """Coerce and validate a requested duration in whole days."""
        if days is None:
            return EditExceptionService.MIN_DAYS
        try:
            days = int(days)
        except (TypeError, ValueError):
            raise ValidationError("Duration must be a whole number of days.")
        if not (EditExceptionService.MIN_DAYS <= days <= EditExceptionService.MAX_DAYS):
            raise ValidationError(
                f"Duration must be between {EditExceptionService.MIN_DAYS} "
                f"and {EditExceptionService.MAX_DAYS} days."
            )
        return days

    @staticmethod
    @transaction.atomic
    def create(document, user, granted_by, days=None):
        """
        Create an active exception for a user on a document.

        Validates the duration (1-7 days, default 1), that the user is
        eligible, and that the user does not already hold an active exception
        for this document.
        """
        days = EditExceptionService._validate_days(days)

        if not EditExceptionService.is_eligible_user(document, user):
            raise ValidationError(
                "User is not a member of the project or the business area leader."
            )

        if EditExceptionService.has_active_exception(user, document):
            raise ValidationError(
                "This user already has an active edit exception for this document."
            )

        return DocumentEditException.objects.create(
            document=document,
            user=user,
            granted_by=granted_by,
            expires_at=timezone.now() + timedelta(days=days),
        )

    @staticmethod
    @transaction.atomic
    def extend(exception, granted_by, days):
        """
        Extend an exception, recomputing expiry from now using the same
        1-7 day limit.
        """
        days = EditExceptionService._validate_days(days)
        exception.expires_at = timezone.now() + timedelta(days=days)
        exception.granted_by = granted_by
        exception.save(update_fields=["expires_at", "granted_by", "updated_at"])
        return exception

    @staticmethod
    def revoke(exception):
        """
        Revoke an exception by deleting it, so it no longer grants access and
        is not fetched again.
        """
        exception.delete()
