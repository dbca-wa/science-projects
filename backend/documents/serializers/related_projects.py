"""
Serializers for a project plan's related projects
"""

from rest_framework import serializers

from projects.models import Project

from ..models import ProjectPlanRelatedProject
from ..services.related_project_service import RelatedProjectService

Status = ProjectPlanRelatedProject.StatusChoices


class RelatedProjectSummarySerializer(serializers.ModelSerializer):
    """The details of a related project shown in a plan's list"""

    tag = serializers.SerializerMethodField()
    leader = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ["id", "title", "kind", "status", "year", "number", "tag", "leader"]

    def get_tag(self, obj):
        return obj.get_project_tag()

    def get_leader(self, obj):
        """Display name of the project leader, or None"""
        leaders = getattr(obj, "leader_members", None)
        if leaders is None:
            leaders = list(obj.members.filter(is_leader=True).select_related("user"))
        if not leaders:
            return None
        user = leaders[0].user
        first = user.display_first_name or user.first_name or ""
        last = user.display_last_name or user.last_name or ""
        return f"{first} {last}".strip() or None


class ProjectPlanRelatedProjectSerializer(serializers.ModelSerializer):
    """A linked project or suggestion on a project plan"""

    related_project = RelatedProjectSummarySerializer(read_only=True)

    class Meta:
        model = ProjectPlanRelatedProject
        fields = [
            "id",
            "related_project",
            "status",
            "source",
            "match_type",
            "matched_text",
            "created_at",
        ]


class ProjectPlanRelatedProjectCreateSerializer(serializers.Serializer):
    """Request body for adding a project to a plan's related projects"""

    related_project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())


class RelatedProjectsFieldsMixin:
    """
    Adds related_project_links and related_project_suggestions to a project
    plan serializer. Reads rows prefetched with visible_rows_prefetch() when
    available, so a list of plans should prefetch to avoid extra queries.
    """

    def _rows_with_status(self, obj, status):
        rows = RelatedProjectService.get_visible_rows(obj)
        return ProjectPlanRelatedProjectSerializer(
            [row for row in rows if row.status == status], many=True
        ).data

    def get_related_project_links(self, obj):
        return self._rows_with_status(obj, Status.LINKED)

    def get_related_project_suggestions(self, obj):
        return self._rows_with_status(obj, Status.SUGGESTED)
