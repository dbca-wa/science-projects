"""
Related projects views for project plans

The related projects list stays editable when a plan is locked, so these views
check who may edit the plan's project (CanEditProject) and deliberately do not
apply document locking.
"""

from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.status import HTTP_200_OK, HTTP_201_CREATED, HTTP_204_NO_CONTENT
from rest_framework.views import APIView

from projects.permissions import CanEditProject

from ..models import ProjectPlan, ProjectPlanRelatedProject
from ..serializers import (
    ProjectPlanRelatedProjectCreateSerializer,
    ProjectPlanRelatedProjectSerializer,
)
from ..services.related_project_service import RelatedProjectService

PERMISSION_DENIED_MESSAGE = (
    "You do not have permission to change this plan's related projects."
)


def get_plan_for_editing(request, view, pk):
    """Load a project plan and check the user may change its related projects."""
    try:
        project_plan = ProjectPlan.objects.select_related(
            "project", "project__business_area__leader"
        ).get(pk=pk)
    except ProjectPlan.DoesNotExist:
        raise NotFound

    if not CanEditProject().has_object_permission(request, view, project_plan.project):
        raise PermissionDenied(PERMISSION_DENIED_MESSAGE)

    return project_plan


class ProjectPlanRelatedProjects(APIView):
    """Add a project to a plan's related projects, or accept a suggestion"""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        project_plan = get_plan_for_editing(request, self, pk)

        serializer = ProjectPlanRelatedProjectCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        row, created = RelatedProjectService.add(
            project_plan,
            serializer.validated_data["related_project"],
            request.user,
        )
        return Response(
            ProjectPlanRelatedProjectSerializer(row).data,
            status=HTTP_201_CREATED if created else HTTP_200_OK,
        )


class ProjectPlanLegacyRelatedProjects(APIView):
    """
    Clear a plan's legacy related projects text.

    The same people who manage the list may clear it, on locked plans too, so
    the free text can be retired once its projects are linked.
    """

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        project_plan = get_plan_for_editing(request, self, pk)
        RelatedProjectService.clear_legacy_text(project_plan, request.user)
        return Response(status=HTTP_204_NO_CONTENT)


class ProjectPlanRelatedProjectDetail(APIView):
    """Remove a project from a plan's related projects, or dismiss a suggestion"""

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, link_pk):
        project_plan = get_plan_for_editing(request, self, pk)

        row = (
            ProjectPlanRelatedProject.objects.filter(
                pk=link_pk, project_plan=project_plan
            )
            .exclude(status=ProjectPlanRelatedProject.StatusChoices.DISMISSED)
            .first()
        )
        if row is None:
            raise NotFound

        RelatedProjectService.remove(row, request.user)
        return Response(status=HTTP_204_NO_CONTENT)
