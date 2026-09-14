"""
Project plan views
"""

from django.conf import settings
from rest_framework.exceptions import NotFound
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

from ..models import Endorsement, ProjectPlan
from ..permissions import can_edit_document_content, strip_protected_fields
from ..serializers import ProjectPlanSerializer, TinyProjectPlanSerializer

LOCKED_DOCUMENT_ERROR = {
    "detail": (
        "This document is locked and you do not have an active edit exception. "
        "Contact an administrator to request temporary edit access."
    )
}


class ProjectPlans(APIView):
    """List and create project plans"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List all project plans"""
        all_project_plans = (
            ProjectPlan.objects.select_related(
                "document",
            )
            .prefetch_related(
                "document__project__business_area__division__approvers",
                "document__project__business_area__division__directorate_email_list",
            )
            .select_related(
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
        )
        serializer = TinyProjectPlanSerializer(
            all_project_plans,
            many=True,
            context={"request": request},
        )
        return Response(serializer.data, status=HTTP_200_OK)

    def post(self, request):
        """Create a new project plan"""
        settings.LOGGER.info(f"{request.user} is posting a new project plan")
        serializer = ProjectPlanSerializer(data=request.data)

        if not serializer.is_valid():
            settings.LOGGER.error(f"{serializer.errors}")
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        project_plan = serializer.save()
        return Response(
            TinyProjectPlanSerializer(project_plan).data,
            status=HTTP_201_CREATED,
        )


class ProjectPlanDetail(APIView):
    """Get, update, and delete project plans"""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Get project plan by ID"""
        try:
            project_plan = (
                ProjectPlan.objects.select_related(
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
        except ProjectPlan.DoesNotExist:
            raise NotFound

        serializer = ProjectPlanSerializer(
            project_plan,
            context={"request": request, "include_edit_exception_details": True},
        )
        return Response(serializer.data, status=HTTP_200_OK)

    def patch(self, request, pk):
        """Partial update project plan"""
        settings.LOGGER.info(
            f"{request.user} is partially updating project plan details for project plan id: {pk}"
        )

        try:
            project_plan = ProjectPlan.objects.get(pk=pk)
        except ProjectPlan.DoesNotExist:
            raise NotFound

        if not can_edit_document_content(request.user, project_plan.document):
            settings.LOGGER.warning(
                f"{request.user} was denied editing locked project plan {pk}"
            )
            return Response(LOCKED_DOCUMENT_ERROR, status=HTTP_403_FORBIDDEN)

        # Approval-state fields can never be changed through a content edit.
        data = strip_protected_fields(request.data)

        # Handle endorsement updates
        if (
            "data_management" in request.data
            or "specimens" in request.data
            or "involves_animals" in request.data
            or "involves_plants" in request.data
        ):
            endorsement_to_edit = Endorsement.objects.filter(project_plan=pk).first()

            if endorsement_to_edit:
                if "specimens" in request.data:
                    endorsement_to_edit.no_specimens = request.data["specimens"]

                if "data_management" in request.data:
                    endorsement_to_edit.data_management = request.data[
                        "data_management"
                    ]

                if (
                    "involves_animals" in request.data
                    or "involves_plants" in request.data
                ):
                    involves_animals_value = request.data.get("involves_animals")
                    request.data.get("involves_plants")
                    aec_approval_value = request.data.get("ae_endorsement_provided")

                    if involves_animals_value:
                        endorsement_to_edit.ae_endorsement_provided = aec_approval_value
                    else:
                        endorsement_to_edit.ae_endorsement_provided = False

                endorsement_to_edit.save()

        serializer = ProjectPlanSerializer(
            project_plan,
            data=data,
            partial=True,
        )

        if not serializer.is_valid():
            settings.LOGGER.error(f"{serializer.errors}")
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        updated_project_plan = serializer.save()
        updated_project_plan.document.modifier = request.user
        updated_project_plan.document.save()

        return Response(
            TinyProjectPlanSerializer(updated_project_plan).data,
            status=HTTP_200_OK,
        )

    def put(self, request, pk):
        """Full update project plan"""
        settings.LOGGER.info(
            f"{request.user} is updating project plan details for project plan id: {pk}"
        )

        try:
            project_plan = ProjectPlan.objects.get(pk=pk)
        except ProjectPlan.DoesNotExist:
            raise NotFound

        if not can_edit_document_content(request.user, project_plan.document):
            settings.LOGGER.warning(
                f"{request.user} was denied editing locked project plan {pk}"
            )
            return Response(LOCKED_DOCUMENT_ERROR, status=HTTP_403_FORBIDDEN)

        # Approval-state fields can never be changed through a content edit.
        data = strip_protected_fields(request.data)

        # Handle endorsement updates
        if (
            "data_management" in request.data
            or "specimens" in request.data
            or "involves_animals" in request.data
            or "involves_plants" in request.data
        ):
            endorsement_to_edit = Endorsement.objects.filter(project_plan=pk).first()

            if endorsement_to_edit:
                if "specimens" in request.data:
                    endorsement_to_edit.no_specimens = request.data["specimens"]

                if "data_management" in request.data:
                    endorsement_to_edit.data_management = request.data[
                        "data_management"
                    ]

                if (
                    "involves_animals" in request.data
                    or "involves_plants" in request.data
                ):
                    involves_animals_value = request.data.get("involves_animals")
                    request.data.get("involves_plants")
                    aec_approval_value = request.data.get("ae_endorsement_provided")

                    if involves_animals_value:
                        endorsement_to_edit.ae_endorsement_provided = aec_approval_value
                    else:
                        endorsement_to_edit.ae_endorsement_provided = False

                endorsement_to_edit.save()

        serializer = ProjectPlanSerializer(
            project_plan,
            data=data,
            partial=True,  # Allow partial updates for PUT as well
        )

        if not serializer.is_valid():
            settings.LOGGER.error(f"{serializer.errors}")
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        updated_project_plan = serializer.save()
        updated_project_plan.document.modifier = request.user
        updated_project_plan.document.save()

        return Response(
            TinyProjectPlanSerializer(updated_project_plan).data,
            status=HTTP_202_ACCEPTED,  # Match expected status code
        )

    def delete(self, request, pk):
        """Delete project plan and revert project status"""
        settings.LOGGER.info(
            f"{request.user} is deleting project plan details for {pk}"
        )

        try:
            project_plan = ProjectPlan.objects.get(pk=pk)
        except ProjectPlan.DoesNotExist:
            raise NotFound

        # Use DocumentService to handle status rollback
        from ..services.document_service import DocumentService

        DocumentService.delete_document(project_plan.document.pk, request.user)
        return Response(status=HTTP_204_NO_CONTENT)


class CreateProjectPlanFromConcept(APIView):
    """
    Create a project plan (with document and endorsement) for a project
    whose concept plan has been approved.

    This is the manual trigger for when the auto-creation didn't happen
    or the project plan was deleted and needs to be recreated.

    POST /documents/create-project-plan/<project_pk>
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, project_pk):
        from projects.models import Project

        from ..models import ProjectDocument
        from ..services.approval_service import ApprovalService

        settings.LOGGER.info(
            f"{request.user} is manually creating project plan for project {project_pk}"
        )

        # Get the project
        try:
            project = Project.objects.get(pk=project_pk)
        except Project.DoesNotExist:
            return Response({"error": "Project not found"}, status=HTTP_400_BAD_REQUEST)

        # Check if a project plan already exists
        existing = ProjectDocument.objects.filter(
            project=project,
            kind="projectplan",
        ).exists()
        if existing:
            return Response(
                {"error": "A project plan already exists for this project"},
                status=HTTP_400_BAD_REQUEST,
            )

        # Get the concept plan document to pass to the helper
        concept_doc = ProjectDocument.objects.filter(
            project=project,
            kind="concept",
        ).first()

        if not concept_doc:
            return Response(
                {"error": "No concept plan found for this project"},
                status=HTTP_400_BAD_REQUEST,
            )

        try:
            ApprovalService._create_project_plan_from_concept(concept_doc, request.user)
        except Exception as e:
            settings.LOGGER.error(f"Failed to create project plan: {e}", exc_info=True)
            return Response(
                {"error": "Failed to create project plan"},
                status=HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"message": "Project plan created successfully"},
            status=HTTP_201_CREATED,
        )
