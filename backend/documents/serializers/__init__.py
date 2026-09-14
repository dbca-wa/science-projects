"""
Documents serializers
"""

# Annual report PDF generation serializers
from .annual_report import (
    OptimisedProgressReportAnnualReportSerializer,
    OptimisedStudentReportAnnualReportSerializer,
)

# Base serializers
from .base import (
    AnnualReportCreateSerializer,
    AnnualReportSerializer,
    AnnualReportUpdateSerializer,
    MiniAnnualReportSerializer,
    ProjectDocumentCreateSerializer,
    ProjectDocumentSerializer,
    ProjectDocumentUpdateSerializer,
    TinyAnnualReportSerializer,
    TinyProjectDocumentSerializer,
    TinyProjectDocumentSerializerWithUserDocsBelongTo,
)

# Closure serializers
from .closure import (
    ProjectClosureCreateSerializer,
    ProjectClosureSerializer,
    ProjectClosureUpdateSerializer,
    TinyProjectClosureSerializer,
)

# Concept plan serializers
from .concept_plan import (
    ConceptPlanCreateSerializer,
    ConceptPlanSerializer,
    ConceptPlanUpdateSerializer,
    TinyConceptPlanSerializer,
)

# Custom publication serializers
from .custom_publication import (
    CustomPublicationCreateSerializer,
    CustomPublicationSerializer,
    CustomPublicationUpdateSerializer,
    LibraryPublicationResponseSerializer,
    PublicationDocSerializer,
    PublicationResponseSerializer,
    TinyCustomPublicationSerializer,
)

# Edit exception serializers
from .edit_exception import (
    DocumentEditExceptionSerializer,
    EditExceptionUserSerializer,
)

# Progress report serializers
from .progress_report import (
    ProgressReportCreateSerializer,
    ProgressReportSerializer,
    ProgressReportUpdateSerializer,
    TinyProgressReportSerializer,
)

# Project plan serializers
from .project_plan import (
    EndorsementCreateSerializer,
    EndorsementSerializer,
    EndorsementUpdateSerializer,
    MiniEndorsementSerializer,
    ProjectPlanCreateSerializer,
    ProjectPlanSerializer,
    ProjectPlanUpdateSerializer,
    TinyEndorsementSerializer,
    TinyProjectPlanSerializer,
)

# Student report serializers
from .student_report import (
    StudentReportCreateSerializer,
    StudentReportSerializer,
    StudentReportUpdateSerializer,
    TinyStudentReportSerializer,
)

__all__ = [
    # Base
    "TinyProjectDocumentSerializer",
    "TinyProjectDocumentSerializerWithUserDocsBelongTo",
    "ProjectDocumentSerializer",
    "ProjectDocumentCreateSerializer",
    "ProjectDocumentUpdateSerializer",
    "TinyAnnualReportSerializer",
    "MiniAnnualReportSerializer",
    "AnnualReportSerializer",
    "AnnualReportCreateSerializer",
    "AnnualReportUpdateSerializer",
    # Concept plan
    "TinyConceptPlanSerializer",
    "ConceptPlanSerializer",
    "ConceptPlanCreateSerializer",
    "ConceptPlanUpdateSerializer",
    # Project plan
    "TinyProjectPlanSerializer",
    "ProjectPlanSerializer",
    "ProjectPlanCreateSerializer",
    "ProjectPlanUpdateSerializer",
    "TinyEndorsementSerializer",
    "MiniEndorsementSerializer",
    "EndorsementSerializer",
    "EndorsementCreateSerializer",
    "EndorsementUpdateSerializer",
    # Progress report
    "TinyProgressReportSerializer",
    "ProgressReportSerializer",
    "ProgressReportCreateSerializer",
    "ProgressReportUpdateSerializer",
    # Student report
    "TinyStudentReportSerializer",
    "StudentReportSerializer",
    "StudentReportCreateSerializer",
    "StudentReportUpdateSerializer",
    # Closure
    "TinyProjectClosureSerializer",
    "ProjectClosureSerializer",
    "ProjectClosureCreateSerializer",
    "ProjectClosureUpdateSerializer",
    # Custom publication
    "TinyCustomPublicationSerializer",
    "CustomPublicationSerializer",
    "CustomPublicationCreateSerializer",
    "CustomPublicationUpdateSerializer",
    "PublicationDocSerializer",
    "LibraryPublicationResponseSerializer",
    "PublicationResponseSerializer",
    # Annual report PDF generation
    "OptimisedProgressReportAnnualReportSerializer",
    "OptimisedStudentReportAnnualReportSerializer",
    # Edit exceptions
    "DocumentEditExceptionSerializer",
    "EditExceptionUserSerializer",
]
