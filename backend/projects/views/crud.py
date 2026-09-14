"""
Project CRUD views
"""

from datetime import datetime as dt

from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.status import (
    HTTP_200_OK,
    HTTP_201_CREATED,
    HTTP_202_ACCEPTED,
    HTTP_204_NO_CONTENT,
    HTTP_400_BAD_REQUEST,
)
from rest_framework.views import APIView

from common.utils.pagination import paginate_queryset
from documents.models import ProjectDocument
from documents.serializers import (
    ConceptPlanCreateSerializer,
    ProjectDocumentCreateSerializer,
)
from medias.models import IMAGE_MAX_SIZE, ProjectPhoto
from projects.constants import FULL_WORKFLOW_KINDS

from ..permissions.project_permissions import CanEditProject
from ..serializers import (
    CreateProjectSerializer,
    ExternalProjectDetailSerializer,
    MiniProjectMemberSerializer,
    ProjectAreaSerializer,
    ProjectDetailSerializer,
    ProjectDetailViewSerializer,
    ProjectMemberSerializer,
    ProjectSerializer,
    ProjectUpdateSerializer,
    StudentProjectDetailSerializer,
    TinyExternalProjectDetailSerializer,
    TinyStudentProjectDetailSerializer,
)
from ..services.project_service import ProjectService


class Projects(APIView):
    """List and create projects"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List projects with filtering and pagination"""
        # Delegate filtering to service
        projects = ProjectService.list_projects(
            user=request.user, filters=request.query_params
        )

        # Paginate results
        paginated = paginate_queryset(projects, request)

        # Serialize and return
        serializer = ProjectSerializer(
            paginated["items"],
            many=True,
            context={"request": request, "projects": paginated["items"]},
        )

        return Response(
            {
                "projects": serializer.data,
                "total_results": paginated["total_results"],
                "total_pages": paginated["total_pages"],
            },
            status=HTTP_200_OK,
        )

    def post(self, request):
        """Create a new project"""
        data = request.data
        kind = data.get("kind")

        settings.LOGGER.info(f"{request.user} is creating a {kind} project")

        # Parse dates
        start_date = None
        end_date = None
        if data.get("startDate"):
            start_date = dt.strptime(data["startDate"], "%Y-%m-%dT%H:%M:%S.%fZ").date()
        if data.get("endDate"):
            end_date = dt.strptime(data["endDate"], "%Y-%m-%dT%H:%M:%S.%fZ").date()

        # Parse keywords
        keywords_str = data.get("keywords", "")
        keywords_str = keywords_str.strip("[]").replace('"', "")
        keywords_list = keywords_str.split(",")

        # Parse year safely
        year = data.get("year")
        if year is not None:
            try:
                year = int(year)
            except (ValueError, TypeError):
                year = None

        # Prepare project data
        project_data = {
            "kind": kind,
            "status": "active" if kind not in FULL_WORKFLOW_KINDS else "new",
            "year": year,
            "title": data.get("title"),
            "description": data.get("description", ""),
            "tagline": "",
            "keywords": ",".join(keywords_list),
            "start_date": start_date,
            "end_date": end_date,
            "business_area": data.get("businessArea"),
        }

        # Validate project data
        serializer = CreateProjectSerializer(data=project_data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        # Reject an oversized image before writing anything to the database so
        # the caller gets an actionable error instead of a partial project.
        image_data = request.FILES.get("imageData")
        if image_data and image_data.size > IMAGE_MAX_SIZE:
            actual_mb = image_data.size / (1024 * 1024)
            max_mb = IMAGE_MAX_SIZE / (1024 * 1024)
            return Response(
                {
                    "error": (
                        f"Image is too large ({actual_mb:.2f}MB). "
                        f"The maximum size is {max_mb:.0f}MB. "
                        "Please choose a smaller image."
                    )
                },
                status=HTTP_400_BAD_REQUEST,
            )

        # Create project with all related data.
        #
        # Every failure inside this block must raise so the transaction rolls
        # back. Returning a Response from inside an atomic block exits the
        # context manager cleanly, which COMMITS the partial project and leaves
        # it without an area, members or details.
        with transaction.atomic():
            project = serializer.save()

            # Handle project image. The uploaded file is passed straight to the
            # model, which validates before writing to storage — matching every
            # other media type. Pre-saving to storage first would leave the file
            # behind when validation rejects it.
            if image_data:
                try:
                    ProjectPhoto.objects.create(
                        file=image_data,
                        uploader=request.user,
                        project=project,
                    )
                except Exception as e:
                    settings.LOGGER.error(f"Image upload error: {e}")
                    raise ValidationError(
                        {"error": "Image upload failed. Please try a different file."}
                    ) from e

            # Create project areas
            location_data_list = data.getlist("locations")
            area_data = {
                "project": project.pk,
                "areas": location_data_list,
            }
            area_serializer = ProjectAreaSerializer(data=area_data)
            if not area_serializer.is_valid():
                settings.LOGGER.error(
                    f"Project area creation error: {area_serializer.errors}"
                )
                raise ValidationError(area_serializer.errors)
            area_serializer.save()

            # Add project leader as member
            member_data = {
                "project": project.pk,
                "user": int(data.get("projectLead")),
                "is_leader": True,
                "role": "supervising",
            }
            member_serializer = ProjectMemberSerializer(data=member_data)
            if not member_serializer.is_valid():
                settings.LOGGER.error(
                    f"Project member creation error: {member_serializer.errors}"
                )
                raise ValidationError(member_serializer.errors)
            member_serializer.save()

            # Create project details
            detail_data = {
                "project": project.pk,
                "creator": data.get("creator"),
                "modifier": data.get("creator"),
                "owner": data.get("creator"),
                "data_custodian": data.get("dataCustodian"),
            }
            detail_serializer = ProjectDetailSerializer(data=detail_data)
            if not detail_serializer.is_valid():
                settings.LOGGER.error(
                    f"Project detail creation error: {detail_serializer.errors}"
                )
                raise ValidationError(detail_serializer.errors)
            detail_serializer.save()

            # Create kind-specific details
            if kind == "student":
                student_data = {
                    "project": project.pk,
                    "organisation": data.get("organisation"),
                    "level": data.get("level"),
                }
                student_serializer = StudentProjectDetailSerializer(data=student_data)
                if not student_serializer.is_valid():
                    settings.LOGGER.error(
                        f"Student detail creation error: {student_serializer.errors}"
                    )
                    raise ValidationError(student_serializer.errors)
                student_serializer.save()

            elif kind == "external":
                external_data = {
                    "project": project.pk,
                    "description": data.get("externalDescription"),
                    "aims": data.get("aims"),
                    "budget": data.get("budget"),
                    "collaboration_with": data.get("collaborationWith"),
                }
                external_serializer = ExternalProjectDetailSerializer(
                    data=external_data
                )
                if not external_serializer.is_valid():
                    settings.LOGGER.error(
                        f"External detail creation error: {external_serializer.errors}"
                    )
                    raise ValidationError(external_serializer.errors)
                external_serializer.save()

            # Only create initial documents for full-workflow kinds (science, core_function)
            if kind in FULL_WORKFLOW_KINDS:
                document_data = {
                    "old_id": 1,
                    "kind": ProjectDocument.CategoryKindChoices.CONCEPTPLAN,
                    "status": "new",
                    "project": project.pk,
                    "creator": request.user.pk,
                    "modifier": request.user.pk,
                }
                doc_serializer = ProjectDocumentCreateSerializer(data=document_data)
                if not doc_serializer.is_valid():
                    settings.LOGGER.error(
                        f"Project Document creation error: {doc_serializer.errors}"
                    )
                    raise ValidationError(doc_serializer.errors)

                doc = doc_serializer.save()
                concept_data = {"document": doc.pk, "project": project.pk}
                concept_serializer = ConceptPlanCreateSerializer(data=concept_data)
                if not concept_serializer.is_valid():
                    settings.LOGGER.error(
                        f"Concept Plan creation error: {concept_serializer.errors}"
                    )
                    raise ValidationError(concept_serializer.errors)
                concept_serializer.save()

        # Return created project
        result_serializer = ProjectSerializer(project)
        return Response(result_serializer.data, status=HTTP_201_CREATED)


class ProjectDetails(APIView):
    """Get, update, and delete a specific project"""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Get full project details including project, details, documents, and members"""
        from documents.models import (
            ConceptPlan,
            ProgressReport,
            ProjectClosure,
            ProjectPlan,
            StudentReport,
        )
        from documents.serializers import (
            TinyConceptPlanSerializer,
            TinyProgressReportSerializer,
            TinyProjectClosureSerializer,
            TinyProjectPlanSerializer,
            TinyStudentReportSerializer,
        )

        from ..models import (
            ExternalProjectDetails,
            ProjectDetail,
            ProjectMember,
            StudentProjectDetails,
        )

        # Get project
        project = ProjectService.get_project(pk)
        project_data = ProjectSerializer(project).data

        # Get project details (base)
        try:
            base_detail = ProjectDetail.objects.select_related(
                "creator",
                "modifier",
                "owner",
                "data_custodian",
                "site_custodian",
            ).get(project=project)
            base_data = ProjectDetailViewSerializer(base_detail).data
        except ProjectDetail.DoesNotExist:
            base_data = None

        # Get student details if applicable
        try:
            student_detail = StudentProjectDetails.objects.get(project=project)
            student_data = TinyStudentProjectDetailSerializer(student_detail).data
        except StudentProjectDetails.DoesNotExist:
            student_data = []

        # Get external details if applicable
        try:
            external_detail = ExternalProjectDetails.objects.get(project=project)
            external_data = TinyExternalProjectDetailSerializer(external_detail).data
        except ExternalProjectDetails.DoesNotExist:
            external_data = []

        # Get project members
        members = (
            ProjectMember.objects.filter(project=project)
            .select_related(
                "user", "user__profile", "user__work", "user__work__affiliation"
            )
            .prefetch_related("user__caretakers")
            .order_by("position")
        )
        members_data = (
            MiniProjectMemberSerializer(members, many=True).data
            if members.exists()
            else None
        )

        # Get documents
        documents = {
            "concept_plan": None,
            "project_plan": None,
            "progress_reports": [],
            "student_reports": [],
            "project_closure": None,
        }

        # Context enabling edit-exception fields on nested documents so the
        # frontend can determine temporary edit access and admin management.
        doc_context = {
            "request": request,
            "include_edit_exception_details": True,
        }

        # Get concept plan
        try:
            concept_plan = ConceptPlan.objects.select_related(
                "document", "document__project"
            ).get(project=project)
            documents["concept_plan"] = TinyConceptPlanSerializer(
                concept_plan, context=doc_context
            ).data
        except ConceptPlan.DoesNotExist:
            pass

        # Get project plan
        try:
            project_plan = ProjectPlan.objects.select_related(
                "document", "document__project"
            ).get(project=project)
            documents["project_plan"] = TinyProjectPlanSerializer(
                project_plan, context=doc_context
            ).data
        except ProjectPlan.DoesNotExist:
            pass

        # Get progress reports
        progress_reports = (
            ProgressReport.objects.filter(project=project)
            .select_related("document", "document__project")
            .order_by("-year", "-id")
        )
        documents["progress_reports"] = TinyProgressReportSerializer(
            progress_reports, many=True, context=doc_context
        ).data

        # Get student reports
        student_reports = (
            StudentReport.objects.filter(project=project)
            .select_related("document", "document__project")
            .order_by("-id")
        )
        documents["student_reports"] = TinyStudentReportSerializer(
            student_reports, many=True, context=doc_context
        ).data

        # Get project closure
        try:
            project_closure = ProjectClosure.objects.select_related(
                "document", "document__project"
            ).get(project=project)
            documents["project_closure"] = TinyProjectClosureSerializer(
                project_closure, context=doc_context
            ).data
        except ProjectClosure.DoesNotExist:
            pass

        # Construct full response
        response_data = {
            "project": project_data,
            "details": {
                "base": base_data,
                "external": external_data,
                "student": student_data,
            },
            "documents": documents,
            "members": members_data,
        }

        return Response(response_data, status=HTTP_200_OK)

    def get_permissions(self):
        """
        Instantiate and return the list of permissions that this view requires.
        """
        if self.request.method in ["PUT", "PATCH", "DELETE"]:
            return [IsAuthenticated(), CanEditProject()]
        return [IsAuthenticated()]

    def patch(self, request, pk):
        """Partial update project"""
        settings.LOGGER.info(f"{request.user} is updating project (pk={pk})")
        project = ProjectService.get_project(pk)
        self.check_object_permissions(request, project)

        serializer = ProjectUpdateSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        project = ProjectService.update_project(
            pk=pk, user=request.user, data=serializer.validated_data
        )

        # Handle project image upload (separate from serializer — image is a related model)
        image_file = request.FILES.get("image")
        if image_file:
            try:
                # Update existing photo or create new one
                photo, _created = ProjectPhoto.objects.update_or_create(
                    project=project,
                    defaults={
                        "file": image_file,
                        "uploader": request.user,
                    },
                )
            except Exception as e:
                settings.LOGGER.error(f"Image upload error: {e}")
                # A rejected upload is a client error, not a server fault.
                return Response(
                    {"error": "Image upload failed. Please try a different file."},
                    status=HTTP_400_BAD_REQUEST,
                )

        result_serializer = ProjectSerializer(project)
        return Response(result_serializer.data, status=HTTP_202_ACCEPTED)

    def put(self, request, pk):
        """Full update project (replace entire resource)"""
        settings.LOGGER.info(f"{request.user} is updating project (pk={pk})")
        project = ProjectService.get_project(pk)
        self.check_object_permissions(request, project)

        serializer = ProjectUpdateSerializer(data=request.data, partial=False)
        if not serializer.is_valid():
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        project = ProjectService.update_project(
            pk=pk, user=request.user, data=serializer.validated_data
        )

        result_serializer = ProjectSerializer(project)
        return Response(result_serializer.data, status=HTTP_202_ACCEPTED)

    def delete(self, request, pk):
        """Delete project"""
        settings.LOGGER.warning(f"{request.user} is deleting project (pk={pk})")
        project = ProjectService.get_project(pk)
        self.check_object_permissions(request, project)

        ProjectService.delete_project(pk, request.user)
        return Response(status=HTTP_204_NO_CONTENT)
