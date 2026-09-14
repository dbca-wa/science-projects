"""
Documents permissions
"""

from .annual_report_permissions import (
    CanEditAnnualReport,
    CanGenerateAnnualReportPDF,
    CanPublishAnnualReport,
    CanViewAnnualReport,
)
from .content_edit_permissions import (
    PROTECTED_APPROVAL_FIELDS,
    can_edit_document_content,
    is_document_locked,
    strip_protected_fields,
)
from .document_permissions import (
    CanApproveDocument,
    CanDeleteDocument,
    CanEditDocument,
    CanGeneratePDF,
    CanRecallDocument,
    CanViewDocument,
)

__all__ = [
    "CanViewDocument",
    "CanEditDocument",
    "CanApproveDocument",
    "CanRecallDocument",
    "CanDeleteDocument",
    "CanGeneratePDF",
    "can_edit_document_content",
    "is_document_locked",
    "strip_protected_fields",
    "PROTECTED_APPROVAL_FIELDS",
    "CanViewAnnualReport",
    "CanEditAnnualReport",
    "CanPublishAnnualReport",
    "CanGenerateAnnualReportPDF",
]
