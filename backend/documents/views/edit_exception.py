"""
Document edit exception views.

Administrators use these endpoints to grant, view, extend, and revoke
time-limited edit access to locked project documents. All endpoints are
restricted to superusers.
"""

from django.conf import settings
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.status import (
    HTTP_200_OK,
    HTTP_201_CREATED,
    HTTP_204_NO_CONTENT,
    HTTP_400_BAD_REQUEST,
)
from rest_framework.views import APIView

from users.models import User

from ..models import DocumentEditException, ProjectDocument
from ..serializers import (
    DocumentEditExceptionSerializer,
    EditExceptionUserSerializer,
)
from ..services.edit_exception_service import EditExceptionService


def _require_admin(request):
    """Raise PermissionDenied if the requester is not a superuser."""
    if not request.user.is_superuser:
        raise PermissionDenied("Only administrators can manage edit exceptions.")


class DocumentEditExceptions(APIView):
    """List active exceptions and eligible users, and create new exceptions."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """List active exceptions and eligible users for a document."""
        _require_admin(request)

        try:
            document = ProjectDocument.objects.get(pk=pk)
        except ProjectDocument.DoesNotExist:
            raise NotFound

        active = EditExceptionService.list_active(document)
        active_user_ids = set(active.values_list("user_id", flat=True))

        eligible = EditExceptionService.get_eligible_users(document)
        # Do not offer users who already hold an active exception.
        eligible = eligible.exclude(pk__in=active_user_ids)

        return Response(
            {
                "active_exceptions": DocumentEditExceptionSerializer(
                    active, many=True
                ).data,
                "eligible_users": EditExceptionUserSerializer(eligible, many=True).data,
            },
            status=HTTP_200_OK,
        )

    def post(self, request, pk):
        """Grant an edit exception to an eligible user for a document."""
        _require_admin(request)

        try:
            document = ProjectDocument.objects.get(pk=pk)
        except ProjectDocument.DoesNotExist:
            raise NotFound

        user_id = request.data.get("user_id")
        if not user_id:
            return Response(
                {"detail": "user_id is required."}, status=HTTP_400_BAD_REQUEST
            )

        try:
            grantee = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=HTTP_400_BAD_REQUEST)

        settings.LOGGER.info(
            f"{request.user} is granting an edit exception on document {pk} to {grantee}"
        )

        exception = EditExceptionService.create(
            document=document,
            user=grantee,
            granted_by=request.user,
            days=request.data.get("days"),
        )

        return Response(
            DocumentEditExceptionSerializer(exception).data,
            status=HTTP_201_CREATED,
        )


class DocumentEditExceptionDetail(APIView):
    """Extend or revoke a single edit exception."""

    permission_classes = [IsAuthenticated]

    def _get_exception(self, exception_pk):
        try:
            return DocumentEditException.objects.get(pk=exception_pk)
        except DocumentEditException.DoesNotExist:
            raise NotFound

    def patch(self, request, exception_pk):
        """Extend an existing exception."""
        _require_admin(request)

        exception = self._get_exception(exception_pk)

        settings.LOGGER.info(
            f"{request.user} is extending edit exception {exception_pk}"
        )

        updated = EditExceptionService.extend(
            exception=exception,
            granted_by=request.user,
            days=request.data.get("days"),
        )

        return Response(
            DocumentEditExceptionSerializer(updated).data,
            status=HTTP_200_OK,
        )

    def delete(self, request, exception_pk):
        """Revoke (delete) an exception."""
        _require_admin(request)

        exception = self._get_exception(exception_pk)

        settings.LOGGER.info(
            f"{request.user} is revoking edit exception {exception_pk}"
        )

        EditExceptionService.revoke(exception)
        return Response(status=HTTP_204_NO_CONTENT)
