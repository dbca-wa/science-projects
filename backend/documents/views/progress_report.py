"""
Progress report views
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

from ..models import ProgressReport
from ..permissions import can_edit_document_content
from ..serializers import ProgressReportSerializer, TinyProgressReportSerializer

LOCKED_DOCUMENT_ERROR = {
    "detail": (
        "This document is locked and you do not have an active edit exception. "
        "Contact an administrator to request temporary edit access."
    )
}


class ProgressReports(APIView):
    """List and create progress reports"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List all progress reports"""
        all_progress_reports = ProgressReport.objects.select_related(
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
        serializer = TinyProgressReportSerializer(
            all_progress_reports,
            many=True,
            context={"request": request},
        )
        return Response(serializer.data, status=HTTP_200_OK)

    def post(self, request):
        """Create a new progress report"""
        settings.LOGGER.info(f"{request.user} is posting a new progress report")
        serializer = ProgressReportSerializer(data=request.data)

        if not serializer.is_valid():
            settings.LOGGER.error(f"{serializer.errors}")
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        progress_report = serializer.save()
        return Response(
            TinyProgressReportSerializer(progress_report).data,
            status=HTTP_201_CREATED,
        )


class ProgressReportDetail(APIView):
    """Get, update, and delete progress reports"""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Get progress report by ID"""
        try:
            progress_report = (
                ProgressReport.objects.select_related(
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
        except ProgressReport.DoesNotExist:
            raise NotFound

        serializer = ProgressReportSerializer(
            progress_report,
            context={"request": request, "include_edit_exception_details": True},
        )
        return Response(serializer.data, status=HTTP_200_OK)

    def patch(self, request, pk):
        """Partial update progress report"""
        try:
            progress_report = ProgressReport.objects.get(pk=pk)
        except ProgressReport.DoesNotExist:
            raise NotFound

        settings.LOGGER.info(
            f"{request.user} is partially updating progress report {progress_report}"
        )

        serializer = ProgressReportSerializer(
            progress_report,
            data=request.data,
            partial=True,
        )

        if not serializer.is_valid():
            settings.LOGGER.error(f"{serializer.errors}")
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        updated_progress_report = serializer.save()
        updated_progress_report.document.modifier = request.user
        updated_progress_report.document.save()

        return Response(
            TinyProgressReportSerializer(updated_progress_report).data,
            status=HTTP_200_OK,
        )

    def put(self, request, pk):
        """Full update progress report"""
        try:
            progress_report = ProgressReport.objects.get(pk=pk)
        except ProgressReport.DoesNotExist:
            raise NotFound

        settings.LOGGER.info(
            f"{request.user} is updating progress report {progress_report}"
        )

        serializer = ProgressReportSerializer(
            progress_report,
            data=request.data,
            partial=False,
        )

        if not serializer.is_valid():
            settings.LOGGER.error(f"{serializer.errors}")
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        updated_progress_report = serializer.save()
        updated_progress_report.document.modifier = request.user
        updated_progress_report.document.save()

        return Response(
            TinyProgressReportSerializer(updated_progress_report).data,
            status=HTTP_200_OK,
        )

    def delete(self, request, pk):
        """Delete progress report and revert project status"""
        try:
            progress_report = ProgressReport.objects.get(pk=pk)
        except ProgressReport.DoesNotExist:
            raise NotFound

        settings.LOGGER.info(
            f"{request.user} is deleting progress report {progress_report}"
        )

        # Use DocumentService to handle status rollback
        from ..services.document_service import DocumentService

        DocumentService.delete_document(progress_report.document.pk, request.user)
        return Response(status=HTTP_204_NO_CONTENT)


class UpdateProgressReport(APIView):
    """Update specific section of progress report"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Update a specific section of the progress report"""
        settings.LOGGER.info(f"{request.user} is updating progress report data")
        try:
            report = ProgressReport.objects.filter(
                document=int(request.data["main_document_id"])
            ).first()
        except ProgressReport.DoesNotExist:
            raise NotFound

        if not report:
            raise NotFound

        if not can_edit_document_content(request.user, report.document):
            settings.LOGGER.warning(
                f"{request.user} was denied editing locked progress report {report.pk}"
            )
            return Response(LOCKED_DOCUMENT_ERROR, status=HTTP_403_FORBIDDEN)

        section = request.data["section"]
        html_data = request.data["html"]

        serializer = ProgressReportSerializer(
            report,
            data={f"{section}": html_data},
            partial=True,
        )

        if not serializer.is_valid():
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        updated = serializer.save()
        result_serializer = ProgressReportSerializer(updated)
        return Response(result_serializer.data, status=HTTP_202_ACCEPTED)


class ProgressReportByYear(APIView):
    """Get progress report by project and year"""

    permission_classes = [IsAuthenticated]

    def get(self, request, project, year):
        """Get progress report for a specific project and year"""
        try:
            progress_report = (
                ProgressReport.objects.select_related(
                    "document",
                    "document__project",
                    "document__project__business_area",
                    "document__project__business_area__division",
                    "document__project__business_area__division__director",
                    "document__project__business_area__division__approver",
                    "document__project__business_area__leader",
                    "document__project__business_area__caretaker",
                    "document__project__business_area__finance_admin",
                    "document__project__business_area__data_custodian",
                    "document__project__business_area__image",
                    "document__project__image",
                    "document__project__image__uploader",
                    "document__pdf",
                    "document__creator",
                    "document__modifier",
                    "report",
                    "report__creator",
                    "report__modifier",
                )
                .prefetch_related(
                    "document__project__business_area__division__directorate_email_list",
                    "document__project__members",
                    "document__project__members__user",
                    "document__project__members__user__profile",
                    "document__project__members__user__work",
                    "document__project__members__user__work__business_area",
                    "document__project__members__user__caretakers",
                    "document__project__members__user__caretaking_for",
                )
                .get(year=year, document__project=project)
            )
        except ProgressReport.DoesNotExist:
            raise NotFound

        serializer = ProgressReportSerializer(
            progress_report,
            context={"request": request, "include_edit_exception_details": True},
        )
        return Response(serializer.data, status=HTTP_200_OK)
