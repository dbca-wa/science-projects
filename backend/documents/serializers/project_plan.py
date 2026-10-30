"""
Project plan serializers
"""

from rest_framework import serializers

from medias.models import ProjectPlanMethodologyPhoto
from medias.serializers import AECPDFSerializer, TinyMethodologyImageSerializer

from ..models import Endorsement, ProjectPlan
from .base import TinyProjectDocumentSerializer
from .related_projects import RelatedProjectsFieldsMixin


class MethodologyImageMethodMixin:
    """Mixin to provide get_methodology_image method for project plan serializers"""

    def get_methodology_image(self, obj):
        """Get methodology image for this project plan"""
        try:
            image = ProjectPlanMethodologyPhoto.objects.get(project_plan=obj)
        except ProjectPlanMethodologyPhoto.DoesNotExist:
            return None
        return TinyMethodologyImageSerializer(image).data


class EndorsementMethodMixin:
    """Mixin to provide get_endorsements method for project plan serializers"""

    def get_endorsements(self, obj):
        """Get endorsements for this project plan"""
        try:
            endorsement = (
                Endorsement.objects.select_related("aec_pdf")
                .filter(project_plan=obj)
                .first()
            )

            if not endorsement:
                return None

            # Check if aec_pdf exists using hasattr to avoid RelatedObjectDoesNotExist
            aec_pdf_data = None
            if hasattr(endorsement, "aec_pdf"):
                aec_pdf_data = AECPDFSerializer(endorsement.aec_pdf).data

            # Return endorsement data WITHOUT the nested project_plan to avoid circular reference
            return {
                "id": endorsement.id,
                "ae_endorsement_required": endorsement.ae_endorsement_required,
                "ae_endorsement_provided": endorsement.ae_endorsement_provided,
                "no_specimens": endorsement.no_specimens,
                "data_management": endorsement.data_management,
                "aec_pdf": aec_pdf_data,
            }
        except Endorsement.DoesNotExist:
            return None


class TinyProjectPlanSerializer(
    EndorsementMethodMixin, MethodologyImageMethodMixin, serializers.ModelSerializer
):
    """Minimal project plan serializer"""

    document = TinyProjectDocumentSerializer(read_only=True)
    endorsements = serializers.SerializerMethodField()
    methodology_image = serializers.SerializerMethodField()

    class Meta:
        model = ProjectPlan
        fields = [
            "id",
            "document",
            "background",
            "aims",
            "outcome",
            "knowledge_transfer",
            "listed_references",
            "methodology",
            "project_tasks",
            "operating_budget",
            "operating_budget_external",
            "related_projects",
            "endorsements",
            "methodology_image",
        ]


class TinyProjectPlanWithRelatedProjectsSerializer(
    RelatedProjectsFieldsMixin, TinyProjectPlanSerializer
):
    """
    Minimal project plan serializer plus its related projects list and
    suggestions, for single-plan payloads such as the project detail.
    """

    related_project_links = serializers.SerializerMethodField()
    related_project_suggestions = serializers.SerializerMethodField()

    class Meta(TinyProjectPlanSerializer.Meta):
        fields = TinyProjectPlanSerializer.Meta.fields + [
            "related_project_links",
            "related_project_suggestions",
        ]


class ProjectPlanSerializer(
    RelatedProjectsFieldsMixin,
    EndorsementMethodMixin,
    MethodologyImageMethodMixin,
    serializers.ModelSerializer,
):
    """Standard project plan serializer"""

    document = TinyProjectDocumentSerializer(read_only=True)
    endorsements = serializers.SerializerMethodField()
    methodology_image = serializers.SerializerMethodField()
    related_project_links = serializers.SerializerMethodField()
    related_project_suggestions = serializers.SerializerMethodField()

    class Meta:
        model = ProjectPlan
        fields = [
            "id",
            "document",
            "project",
            "background",
            "aims",
            "outcome",
            "knowledge_transfer",
            "listed_references",
            "methodology",
            "project_tasks",
            "operating_budget",
            "operating_budget_external",
            "related_projects",
            "endorsements",
            "methodology_image",
            "related_project_links",
            "related_project_suggestions",
        ]


class ProjectPlanCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating project plans"""

    class Meta:
        model = ProjectPlan
        fields = [
            "document",
            "project",
            "background",
            "aims",
            "outcome",
            "knowledge_transfer",
            "listed_references",
            "operating_budget",
            "operating_budget_external",
            "related_projects",
        ]


class ProjectPlanUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating project plans"""

    class Meta:
        model = ProjectPlan
        fields = [
            "background",
            "aims",
            "outcome",
            "knowledge_transfer",
            "listed_references",
            "operating_budget",
            "operating_budget_external",
            "related_projects",
        ]


class TinyEndorsementSerializer(serializers.ModelSerializer):
    """Minimal endorsement serializer"""

    project_plan = TinyProjectPlanSerializer(read_only=True)
    aec_pdf = AECPDFSerializer(read_only=True)

    class Meta:
        model = Endorsement
        fields = [
            "id",
            "project_plan",
            "ae_endorsement_required",
            "ae_endorsement_provided",
            "no_specimens",
            "data_management",
            "aec_pdf",
        ]


class MiniEndorsementSerializer(serializers.ModelSerializer):
    """Mini endorsement serializer with minimal fields"""

    project_plan = TinyProjectPlanSerializer(read_only=True)

    class Meta:
        model = Endorsement
        fields = [
            "id",
            "project_plan",
        ]


class EndorsementSerializer(serializers.ModelSerializer):
    """Standard endorsement serializer"""

    project_plan = TinyProjectPlanSerializer(read_only=True)
    aec_pdf = AECPDFSerializer(read_only=True)

    class Meta:
        model = Endorsement
        fields = "__all__"


class EndorsementCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating endorsements"""

    class Meta:
        model = Endorsement
        fields = [
            "project_plan",
            "ae_endorsement_required",
            "ae_endorsement_provided",
            "no_specimens",
            "data_management",
        ]


class EndorsementUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating endorsements"""

    class Meta:
        model = Endorsement
        fields = [
            "ae_endorsement_required",
            "ae_endorsement_provided",
            "no_specimens",
            "data_management",
        ]
