"""
Base document serializers
"""

from rest_framework import serializers

from medias.serializers import (
    ProjectDocumentPDFSerializer,
    TinyAnnualReportPDFSerializer,
)
from projects.serializers import TinyProjectSerializer

from ..models import AnnualReport, ProjectDocument


class TinyProjectDocumentSerializer(serializers.ModelSerializer):
    """Minimal project document serializer"""

    project = TinyProjectSerializer(read_only=True)
    created_year = serializers.SerializerMethodField()
    pdf = ProjectDocumentPDFSerializer(read_only=True)
    current_user_has_edit_exception = serializers.SerializerMethodField()
    active_edit_exceptions = serializers.SerializerMethodField()

    def get_created_year(self, obj):
        return obj.created_at.year

    def get_current_user_has_edit_exception(self, obj):
        """
        Whether the requesting user currently holds an active edit exception.

        Only computed on detail reads (where the context flag
        `include_edit_exception_details` is set) to avoid per-row queries on
        list endpoints. Returns False elsewhere.
        """
        if not self.context.get("include_edit_exception_details"):
            return False
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        from ..services.edit_exception_service import EditExceptionService

        return EditExceptionService.has_active_exception(request.user, obj)

    def get_active_edit_exceptions(self, obj):
        """
        Active exceptions for this document, exposed only to administrators on
        detail reads (where `include_edit_exception_details` is set) for the
        management UI. Returns None otherwise.
        """
        if not self.context.get("include_edit_exception_details"):
            return None
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_superuser:
            return None
        from ..services.edit_exception_service import EditExceptionService
        from .edit_exception import DocumentEditExceptionSerializer

        active = EditExceptionService.list_active(obj)
        return DocumentEditExceptionSerializer(active, many=True).data

    class Meta:
        model = ProjectDocument
        fields = [
            "id",
            "created_at",
            "updated_at",
            "creator",
            "modifier",
            "created_year",
            "kind",
            "status",
            "project",
            "project_lead_approval_granted",
            "business_area_lead_approval_granted",
            "directorate_approval_granted",
            "pdf",
            "pdf_generation_in_progress",
            "current_user_has_edit_exception",
            "active_edit_exceptions",
        ]


class ProjectDocumentSerializer(serializers.ModelSerializer):
    """Standard project document serializer"""

    project = TinyProjectSerializer(read_only=True)
    pdf = ProjectDocumentPDFSerializer(read_only=True)
    report_year = serializers.SerializerMethodField()

    def get_report_year(self, obj):
        """Get the annual report year for progress/student reports, or None."""
        if obj.kind == "progressreport":
            detail = obj.progress_report_details.select_related("report").first()
            if detail and detail.report:
                return detail.report.year
        elif obj.kind == "studentreport":
            detail = obj.student_report_details.select_related("report").first()
            if detail and detail.report:
                return detail.report.year
        return None

    class Meta:
        model = ProjectDocument
        fields = [
            "id",
            "created_at",
            "updated_at",
            "creator",
            "modifier",
            "kind",
            "status",
            "project",
            "project_lead_approval_granted",
            "business_area_lead_approval_granted",
            "directorate_approval_granted",
            "pdf",
            "pdf_generation_in_progress",
            "report_year",
        ]


class ProjectDocumentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating project documents"""

    class Meta:
        model = ProjectDocument
        fields = [
            "project",
            "kind",
            "status",
            "creator",
            "modifier",
        ]


class ProjectDocumentUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating project documents"""

    class Meta:
        model = ProjectDocument
        fields = [
            "status",
        ]


class TinyAnnualReportSerializer(serializers.ModelSerializer):
    """Minimal annual report serializer"""

    pdf = TinyAnnualReportPDFSerializer(read_only=True)
    division = serializers.SerializerMethodField()

    def get_division(self, obj):
        if obj.division is None:
            return None
        return {
            "id": obj.division.pk,
            "name": obj.division.name,
        }

    class Meta:
        model = AnnualReport
        fields = [
            "id",
            "year",
            "creator",
            "date_open",
            "date_closed",
            "pdf",
            "pdf_generation_in_progress",
            "is_published",
            "division",
        ]


class MiniAnnualReportSerializer(serializers.ModelSerializer):
    """Mini annual report serializer with minimal fields"""

    class Meta:
        model = AnnualReport
        fields = [
            "id",
            "year",
            "pdf_generation_in_progress",
        ]


class AnnualReportSerializer(serializers.ModelSerializer):
    """Standard annual report serializer"""

    division = serializers.SerializerMethodField()

    def get_division(self, obj):
        if obj.division is None:
            return None
        return {
            "id": obj.division.pk,
            "name": obj.division.name,
        }

    class Meta:
        model = AnnualReport
        fields = "__all__"


class AnnualReportCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating annual reports"""

    class Meta:
        model = AnnualReport
        fields = [
            "year",
            "date_open",
            "date_closed",
        ]


class AnnualReportUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating annual reports"""

    class Meta:
        model = AnnualReport
        fields = [
            "dm",
            "dm_sign",
            "service_delivery_intro",
            "research_intro",
            "student_intro",
            "publications",
            "is_published",
        ]


class TinyProjectDocumentSerializerWithUserDocsBelongTo(serializers.ModelSerializer):
    """
    Tiny project document serializer with user context

    Includes information about which user the document belongs to.
    Used in admin views to show documents pending user action.
    """

    project = TinyProjectSerializer(read_only=True)
    created_year = serializers.SerializerMethodField()
    pdf = ProjectDocumentPDFSerializer(read_only=True)
    for_user = serializers.SerializerMethodField()

    def get_created_year(self, obj):
        """Get year document was created"""
        return obj.created_at.year

    def get_for_user(self, obj):
        """
        Get user information from context

        Returns user details including avatar if user is provided in context.
        """
        user = self.context.get("for_user", None)
        if user:
            # Safely get the user's avatar
            avatar = getattr(user, "avatar", None)
            image_url = avatar.file.url if avatar else None

            return {
                "id": user.pk,
                "email": user.email,
                "display_first_name": user.display_first_name,
                "display_last_name": user.display_last_name,
                "image": image_url,
            }
        return None

    class Meta:
        model = ProjectDocument
        fields = [
            "id",
            "created_at",
            "updated_at",
            "creator",
            "modifier",
            "created_year",
            "kind",
            "status",
            "project",
            "project_lead_approval_granted",
            "business_area_lead_approval_granted",
            "directorate_approval_granted",
            "pdf",
            "pdf_generation_in_progress",
            "for_user",
        ]
