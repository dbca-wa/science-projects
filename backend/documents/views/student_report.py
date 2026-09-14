"""
Student report views
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

from ..models import StudentReport
from ..permissions import can_edit_document_content
from ..serializers import StudentReportSerializer, TinyStudentReportSerializer

LOCKED_DOCUMENT_ERROR = {
    "detail": (
        "This document is locked and you do not have an active edit exception. "
        "Contact an administrator to request temporary edit access."
    )
}


class StudentReports(APIView):
    """List and create student reports"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List all student reports"""
        all_student_reports = StudentReport.objects.select_related(
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
        serializer = TinyStudentReportSerializer(
            all_student_reports,
            many=True,
            context={"request": request},
        )
        return Response(serializer.data, status=HTTP_200_OK)

    def post(self, request):
        """Create a new student report"""
        settings.LOGGER.info(f"{request.user} is creating new student report")
        serializer = StudentReportSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        student_report = serializer.save()
        return Response(
            TinyStudentReportSerializer(student_report).data,
            status=HTTP_201_CREATED,
        )


class StudentReportDetail(APIView):
    """Get, update, and delete student reports"""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Get student report by ID"""
        try:
            student_report = (
                StudentReport.objects.select_related(
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
        except StudentReport.DoesNotExist:
            raise NotFound

        serializer = StudentReportSerializer(
            student_report,
            context={"request": request, "include_edit_exception_details": True},
        )
        return Response(serializer.data, status=HTTP_200_OK)

    def patch(self, request, pk):
        """Partial update student report"""
        try:
            student_report = StudentReport.objects.get(pk=pk)
        except StudentReport.DoesNotExist:
            raise NotFound

        settings.LOGGER.info(
            f"{request.user} is partially updating student report {student_report}"
        )

        serializer = StudentReportSerializer(
            student_report,
            data=request.data,
            partial=True,
        )

        if not serializer.is_valid():
            settings.LOGGER.error(f"{serializer.errors}")
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        updated_student_report = serializer.save()
        updated_student_report.document.modifier = request.user
        updated_student_report.document.save()

        return Response(
            TinyStudentReportSerializer(updated_student_report).data,
            status=HTTP_200_OK,
        )

    def put(self, request, pk):
        """Full update student report"""
        try:
            student_report = StudentReport.objects.get(pk=pk)
        except StudentReport.DoesNotExist:
            raise NotFound

        settings.LOGGER.info(
            f"{request.user} is updating student report {student_report}"
        )

        serializer = StudentReportSerializer(
            student_report,
            data=request.data,
            partial=True,
        )

        if not serializer.is_valid():
            settings.LOGGER.error(f"{serializer.errors}")
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        updated_student_report = serializer.save()
        updated_student_report.document.modifier = request.user
        updated_student_report.document.save()

        return Response(
            TinyStudentReportSerializer(updated_student_report).data,
            status=HTTP_202_ACCEPTED,
        )

    def delete(self, request, pk):
        """Delete student report and revert project status"""
        try:
            student_report = StudentReport.objects.get(pk=pk)
        except StudentReport.DoesNotExist:
            raise NotFound

        settings.LOGGER.info(f"{request.user} is deleting {student_report}")

        # Use DocumentService to handle status rollback
        from ..services.document_service import DocumentService

        DocumentService.delete_document(student_report.document.pk, request.user)
        return Response(status=HTTP_204_NO_CONTENT)


class StudentReportByYear(APIView):
    """Get student report by project and year"""

    permission_classes = [IsAuthenticated]

    def get(self, request, project, year):
        """Get student report for a specific project and year"""
        try:
            student_report = (
                StudentReport.objects.select_related(
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
                .get(year=year, document__project=project)
            )
        except StudentReport.DoesNotExist:
            raise NotFound

        serializer = StudentReportSerializer(
            student_report,
            context={"request": request, "include_edit_exception_details": True},
        )
        return Response(serializer.data, status=HTTP_200_OK)


class UpdateStudentReport(APIView):
    """Update student report content"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Update student report progress_report field"""
        settings.LOGGER.info(f"{request.user} is updating student report data")
        try:
            report = StudentReport.objects.filter(
                document=int(request.data["main_document_id"])
            ).first()
        except StudentReport.DoesNotExist:
            raise NotFound

        if not report:
            raise NotFound

        if not can_edit_document_content(request.user, report.document):
            settings.LOGGER.warning(
                f"{request.user} was denied editing locked student report {report.pk}"
            )
            return Response(LOCKED_DOCUMENT_ERROR, status=HTTP_403_FORBIDDEN)

        serializer = StudentReportSerializer(
            report,
            data={"progress_report": request.data["html"]},
            partial=True,
        )

        if not serializer.is_valid():
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        updated = serializer.save()
        result_serializer = StudentReportSerializer(updated)
        return Response(result_serializer.data, status=HTTP_202_ACCEPTED)
