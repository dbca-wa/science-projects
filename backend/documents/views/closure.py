"""
Project closure views
"""

from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.status import (
    HTTP_200_OK,
    HTTP_201_CREATED,
    HTTP_202_ACCEPTED,
    HTTP_204_NO_CONTENT,
    HTTP_400_BAD_REQUEST,
    HTTP_403_FORBIDDEN,
)
from rest_framework.views import APIView

from ..models import ProjectClosure
from ..permissions import can_edit_document_content, strip_protected_fields
from ..serializers import (
    ProjectClosureCreateSerializer,
    ProjectClosureSerializer,
    ProjectDocumentCreateSerializer,
    TinyProjectClosureSerializer,
)

LOCKED_DOCUMENT_ERROR = {
    "detail": (
        "This document is locked and you do not have an active edit exception. "
        "Contact an administrator to request temporary edit access."
    )
}


class ProjectClosures(APIView):
    """List and create project closures"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List all project closures"""
        all_project_closures = ProjectClosure.objects.select_related(
            "document",
            "document__project",
            "document__project__business_area",
            "document__project__business_area__image",
            "document__project__business_area__division",
            "document__project__business_area__division__director",
            "document__project__business_area__division__approver",
            "document__project__business_area__division__key_stakeholder",
            "document__project__business_area__leader",
            "document__project__business_area__caretaker",
            "document__project__business_area__finance_admin",
            "document__project__business_area__data_custodian",
            "document__project__image",
            "document__project__image__uploader",
            "document__pdf",
            "document__creator",
            "document__modifier",
        ).prefetch_related(
            "document__project__business_area__division__approvers",
            "document__project__business_area__division__directorate_email_list",
        )
        serializer = TinyProjectClosureSerializer(
            all_project_closures,
            many=True,
            context={"request": request},
        )
        return Response(serializer.data, status=HTTP_200_OK)

    def post(self, request):
        """Create a new project closure"""
        settings.LOGGER.info(f"{request.user} is creating new project closure")

        project = request.data.get("project")
        if not project:
            return Response(
                {"error": "'project' is required."},
                HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # Create the parent ProjectDocument first
            doc_ser = ProjectDocumentCreateSerializer(
                data={
                    "project": project,
                    "kind": "projectclosure",
                    "status": "new",
                    "creator": request.user.pk,
                    "modifier": request.user.pk,
                }
            )
            if not doc_ser.is_valid():
                settings.LOGGER.error(f"{doc_ser.errors}")
                raise ValidationError(doc_ser.errors)

            project_document = doc_ser.save()

            # Build closure data from request, linking to the new document and project
            closure_data = {
                "document": project_document.pk,
                "project": project,
                "reason": request.data.get("reason", ""),
                "intended_outcome": request.data.get("intended_outcome", "completed"),
                "scientific_outputs": request.data.get("scientific_outputs", ""),
                "knowledge_transfer": request.data.get("knowledge_transfer", ""),
                "data_location": request.data.get("data_location", ""),
                "hardcopy_location": request.data.get("hardcopy_location", ""),
                "backup_location": request.data.get("backup_location", ""),
            }
            closure_ser = ProjectClosureCreateSerializer(data=closure_data)
            if not closure_ser.is_valid():
                settings.LOGGER.error(f"{closure_ser.errors}")
                raise ValidationError(closure_ser.errors)

            project_closure = closure_ser.save()

        return Response(
            TinyProjectClosureSerializer(project_closure).data,
            status=HTTP_201_CREATED,
        )


class ProjectClosureDetail(APIView):
    """Get, update, and delete project closures"""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Get project closure by ID"""
        try:
            project_closure = (
                ProjectClosure.objects.select_related(
                    "document",
                    "document__project",
                    "document__project__business_area",
                    "document__project__business_area__image",
                    "document__project__business_area__division",
                    "document__project__business_area__division__director",
                    "document__project__business_area__division__approver",
                    "document__project__business_area__division__key_stakeholder",
                    "document__project__business_area__leader",
                    "document__project__business_area__caretaker",
                    "document__project__business_area__finance_admin",
                    "document__project__business_area__data_custodian",
                    "document__project__image",
                    "document__project__image__uploader",
                    "document__pdf",
                    "document__creator",
                    "document__modifier",
                )
                .prefetch_related(
                    "document__project__business_area__division__approvers",
                    "document__project__business_area__division__directorate_email_list",
                )
                .get(pk=pk)
            )
        except ProjectClosure.DoesNotExist:
            raise NotFound

        serializer = ProjectClosureSerializer(
            project_closure,
            context={"request": request, "include_edit_exception_details": True},
        )
        return Response(serializer.data, status=HTTP_200_OK)

    def patch(self, request, pk):
        """Partial update project closure"""
        try:
            project_closure = ProjectClosure.objects.get(pk=pk)
        except ProjectClosure.DoesNotExist:
            raise NotFound

        settings.LOGGER.info(
            f"{request.user} is partially updating project closure {project_closure}"
        )

        if not can_edit_document_content(request.user, project_closure.document):
            settings.LOGGER.warning(
                f"{request.user} was denied editing locked project closure {project_closure.pk}"
            )
            return Response(LOCKED_DOCUMENT_ERROR, status=HTTP_403_FORBIDDEN)

        serializer = ProjectClosureSerializer(
            project_closure,
            data=strip_protected_fields(request.data),
            partial=True,
        )

        if not serializer.is_valid():
            settings.LOGGER.error(f"{serializer.errors}")
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        updated_project_closure = serializer.save()
        updated_project_closure.document.modifier = request.user
        updated_project_closure.document.save()

        return Response(
            TinyProjectClosureSerializer(updated_project_closure).data,
            status=HTTP_200_OK,
        )

    def put(self, request, pk):
        """Full update project closure"""
        try:
            project_closure = ProjectClosure.objects.get(pk=pk)
        except ProjectClosure.DoesNotExist:
            raise NotFound

        settings.LOGGER.info(
            f"{request.user} is updating project closure {project_closure}"
        )

        if not can_edit_document_content(request.user, project_closure.document):
            settings.LOGGER.warning(
                f"{request.user} was denied editing locked project closure {project_closure.pk}"
            )
            return Response(LOCKED_DOCUMENT_ERROR, status=HTTP_403_FORBIDDEN)

        serializer = ProjectClosureSerializer(
            project_closure,
            data=strip_protected_fields(request.data),
            partial=True,
        )

        if not serializer.is_valid():
            settings.LOGGER.error(f"{serializer.errors}")
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        updated_project_closure = serializer.save()
        updated_project_closure.document.modifier = request.user
        updated_project_closure.document.save()

        return Response(
            TinyProjectClosureSerializer(updated_project_closure).data,
            status=HTTP_202_ACCEPTED,
        )

    def delete(self, request, pk):
        """Delete project closure and revert project status"""
        settings.LOGGER.info(f"{request.user} is deleting project closure {pk}")

        try:
            project_closure = ProjectClosure.objects.get(pk=pk)
        except ProjectClosure.DoesNotExist:
            raise NotFound

        # Use DocumentService to handle status rollback
        from ..services.document_service import DocumentService

        DocumentService.delete_document(project_closure.document.pk, request.user)
        return Response(status=HTTP_204_NO_CONTENT)
