"""
Documents views
"""

# Action recipient views
from .actions import ActionRecipients

# Admin views
from .admin import (
    BatchApproveCurrent,
    BatchApproveCurrentPreview,
    BatchApproveOld,
    DocumentSpawner,
    FinalDocApproval,
    GetPreviousReportsData,
    NewCycleEmailPreview,
    NewCycleOpenPreview,
    ProjectDocsPendingMyActionAllStages,
    ReopenProject,
)

# Annual report views
from .annual_report import (  # BeginAnnualReportDocGeneration,  # Removed duplicate - use the one from pdf.py
    FullLatestReport,
    GenerationProgressSSE,
    GetAllReportPDFs,
    GetAvailableReportYearsForProgressReport,
    GetAvailableReportYearsForStudentReport,
    GetCompletedReports,
    GetLatestReportYear,
    GetLegacyPDFs,
    GetReportPDF,
    GetReportPDFStatus,
    GetWithoutPDFs,
    GetWithPDFs,
    LatestYearsInactiveReports,
    LatestYearsProgressReports,
    LatestYearsStudentReports,
    PublishReportPDF,
    ReportDeletePreview,
    ReportDetail,
    Reports,
)

# Approval views
from .approval import (
    BatchApprove,
    DocApproval,
    DocRecall,
    DocSendBack,
)

# Closure views
from .closure import ProjectClosureDetail, ProjectClosures

# Concept plan views
from .concept_plan import ConceptPlanDetail, ConceptPlans, GetConceptPlanData

# CRUD views
from .crud import ProjectDocsPendingMyAction, ProjectDocumentDetail, ProjectDocuments

# Custom publication views
from .custom_publication import CustomPublicationDetail, CustomPublications

# Edit exception views
from .edit_exception import DocumentEditExceptionDetail, DocumentEditExceptions

# Endorsement views
from .endorsement import (
    DeleteAECEndorsement,
    EndorsementDetail,
    Endorsements,
    EndorsementsPendingMyAction,
    SeekEndorsement,
)

# Notification views
from .notifications import (
    BumpPreview,
    NewCycleOpen,
    SendBumpAll,
    SendBumpEmails,
    SendMentionNotification,
    UserPublications,
)

# PDF views
from .pdf import (
    BeginAnnualReportDocGeneration,
    BeginProjectDocGeneration,
    CancelProjectDocGeneration,
    CancelReportDocGeneration,
    DownloadAnnualReport,
    DownloadProjectDocument,
    TestPDFGeneration,
    TestPDFGenerationAll,
)

# Progress report views
from .progress_report import (
    ProgressReportByYear,
    ProgressReportDetail,
    ProgressReports,
    UpdateProgressReport,
)

# Project plan views
from .project_plan import CreateProjectPlanFromConcept, ProjectPlanDetail, ProjectPlans

# Student report views
from .student_report import (
    StudentReportByYear,
    StudentReportDetail,
    StudentReports,
    UpdateStudentReport,
)

__all__ = [
    # CRUD
    "ProjectDocuments",
    "ProjectDocumentDetail",
    "ProjectDocsPendingMyAction",
    # Edit exceptions
    "DocumentEditExceptions",
    "DocumentEditExceptionDetail",
    # Approval
    "DocApproval",
    "DocRecall",
    "DocSendBack",
    "BatchApprove",
    "ActionRecipients",
    # PDF
    "DownloadProjectDocument",
    "BeginProjectDocGeneration",
    "CancelProjectDocGeneration",
    "DownloadAnnualReport",
    "BeginAnnualReportDocGeneration",
    "CancelReportDocGeneration",
    "TestPDFGeneration",
    "TestPDFGenerationAll",
    # Concept plan
    "ConceptPlans",
    "ConceptPlanDetail",
    "GetConceptPlanData",
    # Project plan
    "ProjectPlans",
    "ProjectPlanDetail",
    "CreateProjectPlanFromConcept",
    # Progress report
    "ProgressReports",
    "ProgressReportDetail",
    "UpdateProgressReport",
    "ProgressReportByYear",
    # Student report
    "StudentReports",
    "StudentReportDetail",
    "StudentReportByYear",
    "UpdateStudentReport",
    # Closure
    "ProjectClosures",
    "ProjectClosureDetail",
    # Endorsement
    "Endorsements",
    "EndorsementDetail",
    "EndorsementsPendingMyAction",
    "SeekEndorsement",
    "DeleteAECEndorsement",
    # Custom publication
    "CustomPublications",
    "CustomPublicationDetail",
    # Admin
    "ProjectDocsPendingMyActionAllStages",
    "DocumentSpawner",
    "GetPreviousReportsData",
    "ReopenProject",
    "BatchApproveOld",
    "BatchApproveCurrent",
    "BatchApproveCurrentPreview",
    "NewCycleOpenPreview",
    "NewCycleEmailPreview",
    "FinalDocApproval",
    # Annual report
    "Reports",
    "ReportDetail",
    "ReportDeletePreview",
    "GetLatestReportYear",
    "GetAvailableReportYearsForStudentReport",
    "GetAvailableReportYearsForProgressReport",
    "GetWithoutPDFs",
    "GetReportPDF",
    "GetReportPDFStatus",
    "GetWithPDFs",
    "GetLegacyPDFs",
    "GetAllReportPDFs",
    "GetCompletedReports",
    "BeginAnnualReportDocGeneration",
    "LatestYearsProgressReports",
    "LatestYearsStudentReports",
    "LatestYearsInactiveReports",
    "FullLatestReport",
    "GenerationProgressSSE",
    "PublishReportPDF",
    # Notification
    "NewCycleOpen",
    "SendBumpEmails",
    "SendBumpAll",
    "BumpPreview",
    "UserPublications",
    "SendMentionNotification",
]
