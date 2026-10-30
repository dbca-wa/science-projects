"""
Test PDF service — generates PDFs with mock data for template previewing.
"""

import os
from datetime import datetime

from django.conf import settings
from django.template.loader import render_to_string

from .pdf_service import PDFService

# Document kind metadata mapping
DOCUMENT_KIND_MAP = {
    "concept": {"kind_string": "Science Concept Plan", "kind_url": "concept"},
    "projectplan": {"kind_string": "Science Project Plan", "kind_url": "projectplan"},
    "progressreport": {"kind_string": "Progress Report", "kind_url": "progressreport"},
    "studentreport": {"kind_string": "Student Report", "kind_url": "studentreport"},
    "projectclosure": {"kind_string": "Project Closure", "kind_url": "projectclosure"},
}

VALID_DOCUMENT_KINDS = list(DOCUMENT_KIND_MAP.keys())


def _build_concept_plan_items():
    """Build mock html_data_items for a concept plan."""
    return {
        "background": {
            "title": "Background",
            "data": (
                "<p>The Western Swamp Tortoise (<em>Pseudemydura umbrina</em>) is one of the most "
                "critically endangered reptiles in the world, with fewer than 300 individuals remaining "
                "in the wild. Found exclusively in seasonal wetlands on the Swan Coastal Plain near Perth, "
                "this species faces ongoing threats from habitat loss, climate change, and predation by "
                "introduced species.</p>"
                "<p>Previous conservation efforts by DBCA have focused on captive breeding programmes "
                "at Perth Zoo and translocation to new wetland sites. However, long-term population "
                "viability requires a deeper understanding of habitat requirements, movement patterns, "
                "and the impacts of a drying climate on seasonal wetland hydrology.</p>"
            ),
        },
        "aims": {
            "title": "Aims",
            "data": (
                "<p>This project aims to establish a comprehensive monitoring programme across key "
                "wetland sites in the Perth metropolitan area to:</p>"
                "<ul>"
                "<li>Quantify population size and demographic structure at each site</li>"
                "<li>Assess habitat condition and hydrological regime</li>"
                "<li>Evaluate the effectiveness of predator control measures</li>"
                "<li>Model population viability under projected climate scenarios</li>"
                "</ul>"
            ),
        },
        "outcomes": {
            "title": "Expected Outcomes",
            "data": (
                "<p>The expected outcomes include improved understanding of population dynamics, "
                "validated habitat suitability models, and evidence-based recommendations for "
                "future translocation sites. These outputs will directly inform the national "
                "recovery plan for the species.</p>"
            ),
        },
        "context": {
            "title": "Strategic Context",
            "data": (
                "<p>This research builds on previous conservation efforts by DBCA and aligns with "
                "the Western Australian Biodiversity Science Strategy 2024\u20132030. It supports "
                "Priority Area 3: Threatened Species Recovery and contributes to national reporting "
                "obligations under the EPBC Act.</p>"
            ),
        },
        "collaborations": {
            "title": "Expected Collaborations",
            "data": (
                "<p>University of Western Australia (population genetics), Perth Zoo (captive breeding "
                "data), Murdoch University (wetland hydrology modelling), and the WA Department of "
                "Water and Environmental Regulation (water allocation planning).</p>"
            ),
        },
        "staff_time_allocation": {
            "title": "Staff Time Allocation",
            "data": (
                "<table class='table-light'>"
                "<tr><th>Staff Member</th><th>Role</th><th>FTE</th></tr>"
                "<tr><td>Dr. Sarah Mitchell</td><td>Project Lead</td><td>0.6</td></tr>"
                "<tr><td>Dr. James Chen</td><td>Research Scientist</td><td>0.4</td></tr>"
                "<tr><td>Emma Thompson</td><td>Field Ecologist</td><td>0.8</td></tr>"
                "<tr><td>Michael Roberts</td><td>GIS Analyst</td><td>0.2</td></tr>"
                "</table>"
            ),
        },
        "budget": {
            "title": "Indicative Operating Budget",
            "data": "<p>Total estimated budget: $245,000 over three years.</p>",
        },
    }


def _build_project_plan_items():
    """Build mock html_data_items for a project plan."""
    return {
        "background": {
            "title": "Background",
            "data": (
                "<p>The Western Swamp Tortoise (<em>Pseudemydura umbrina</em>) recovery programme "
                "has been operating since 1988, yet critical knowledge gaps remain regarding the "
                "species\u2019 response to a rapidly changing climate. Seasonal wetlands on the "
                "Swan Coastal Plain are drying earlier each year, reducing the active period "
                "available for foraging and growth.</p>"
            ),
        },
        "aims": {
            "title": "Aims",
            "data": (
                "<p>Develop and validate a spatially explicit population model that integrates "
                "hydrology, predation risk, and climate projections to guide translocation "
                "decisions for the next decade.</p>"
            ),
        },
        "outcomes": {
            "title": "Expected Outcomes",
            "data": (
                "<p>A peer-reviewed decision-support tool for selecting optimal translocation "
                "sites, published habitat suitability maps, and updated species recovery targets.</p>"
            ),
        },
        "methodology": {
            "title": "Methodology",
            "data": (
                "<p>The project employs a mixed-methods approach combining field surveys, remote "
                "sensing, and statistical modelling:</p>"
                "<table class='table-light'>"
                "<tr><th>Phase</th><th>Method</th><th>Timeline</th></tr>"
                "<tr><td>1</td><td>Baseline population surveys using mark-recapture</td>"
                "<td>Oct\u2013Dec 2026</td></tr>"
                "<tr><td>2</td><td>Habitat mapping via drone-based LiDAR</td>"
                "<td>Jan\u2013Mar 2027</td></tr>"
                "<tr><td>3</td><td>Population viability analysis (PVA) modelling</td>"
                "<td>Apr\u2013Jun 2027</td></tr>"
                "</table>"
            ),
        },
        "project_tasks": {
            "title": "Project Tasks",
            "data": (
                "<ul>"
                "<li>Deploy camera traps at 12 wetland sites</li>"
                "<li>Conduct quarterly population surveys</li>"
                "<li>Process and analyse LiDAR point cloud data</li>"
                "<li>Calibrate hydrological model with Bureau of Meteorology data</li>"
                "<li>Run PVA simulations under RCP 4.5 and RCP 8.5 scenarios</li>"
                "</ul>"
            ),
        },
        "knowledge_transfer": {
            "title": "Knowledge Transfer",
            "data": (
                "<p>Results will be disseminated through peer-reviewed publications, annual "
                "stakeholder workshops, and integration into the DBCA Species and Communities "
                "Branch knowledge base.</p>"
            ),
        },
        "related_projects": {
            "title": "Related Projects",
            # Linked projects as built by RelatedProjectService.build_pdf_html,
            # followed by legacy free text
            "data": (
                "<ul>"
                "<li>SP-2024-3 &ndash; Swan Coastal Plain Wetland Hydrology Monitoring</li>"
                "<li>SP-2022-33 &ndash; Ellen Brook catchment nutrient export: "
                "sources and pathways</li>"
                "</ul>"
                "<p>Previously recorded: consulted the Wetlands Conservation Program "
                "leader on shared monitoring sites.</p>"
            ),
        },
        "consolidated_funds": {
            "title": "Consolidated Funds",
            "data": "<p>$180,000 (DBCA Biodiversity and Conservation Science Division)</p>",
        },
        "external_funds": {
            "title": "External Funds",
            "data": "<p>$65,000 (Australian Research Council Linkage Grant LP260100123)</p>",
        },
        "listed_references": {
            "title": "References",
            "data": (
                "<p>Burbidge, A.A. &amp; Kuchling, G. (2004). <em>Western Swamp Tortoise "
                "Recovery Plan</em>. Department of Conservation and Land Management, Perth.</p>"
                "<p>Mitchell, N.J. et al. (2016). Thermal tolerance and timing of reproduction "
                "in a critically endangered tortoise. <em>Journal of Thermal Biology</em>, 59, 70\u201378.</p>"
            ),
        },
    }


def _build_progress_report_items():
    """Build mock html_data_items for a progress report."""
    return {
        "context": {
            "title": "Context",
            "data": (
                "<p>This progress report covers the first year of the Western Swamp Tortoise "
                "monitoring programme. Field work commenced in October 2025 following site "
                "access approvals and equipment procurement.</p>"
            ),
        },
        "aims": {
            "title": "Aims",
            "data": (
                "<p>The aims for this reporting period were to complete baseline population "
                "surveys at all 12 wetland sites and deploy environmental monitoring equipment "
                "(water level loggers, temperature sensors, and camera traps).</p>"
            ),
        },
        "progress": {
            "title": "Progress",
            "data": (
                "<p>Baseline surveys were completed at 10 of 12 sites. Two sites (Ellen Brook "
                "Nature Reserve and Twin Swamps) were inaccessible due to unseasonally high "
                "water levels in November 2025. Key findings include:</p>"
                "<ul>"
                "<li>Total of 47 individual tortoises captured and marked across all sites</li>"
                "<li>Population estimates range from 3 to 18 individuals per site</li>"
                "<li>Body condition indices suggest adequate foraging conditions at most sites</li>"
                "<li>Two previously unknown nesting sites identified at Moore River</li>"
                "</ul>"
            ),
        },
        "implications": {
            "title": "Management Implications",
            "data": (
                "<p>The discovery of nesting sites at Moore River suggests this translocation "
                "site is more successful than previously assessed. Predator control efforts "
                "should be intensified at sites where fox activity was detected on camera traps "
                "(4 of 10 surveyed sites).</p>"
            ),
        },
        "future": {
            "title": "Future Directions",
            "data": (
                "<p>Year 2 will focus on completing surveys at the remaining two sites, "
                "commencing drone-based habitat mapping, and initiating the hydrological "
                "modelling component. A mid-project stakeholder workshop is planned for "
                "August 2027.</p>"
            ),
        },
    }


def _build_student_report_items():
    """Build mock html_data_items for a student report."""
    return {
        "progress_report": {
            "title": "Progress Report",
            "data": (
                "<p>This student project investigates the genetic diversity of translocated "
                "Western Swamp Tortoise populations using microsatellite markers. During the "
                "reporting period, tissue samples were collected from 32 individuals across "
                "three translocation sites.</p>"
                "<p>Laboratory analysis is approximately 60% complete. Preliminary results "
                "indicate that genetic diversity at the Moore River site is comparable to the "
                "source population at Ellen Brook, suggesting the translocation has maintained "
                "adequate genetic variation. Full results and a draft manuscript are expected "
                "by the end of the next reporting period.</p>"
            ),
        },
    }


def _build_project_closure_items():
    """Build mock html_data_items for a project closure."""
    return {
        "reason": {
            "title": "Reason for Closure",
            "data": (
                "<p>The project has achieved all stated objectives. The population viability "
                "model has been completed, peer-reviewed, and integrated into the national "
                "recovery plan. No further funding is required.</p>"
            ),
        },
        "intended_outcome": {
            "title": "Intended Outcome",
            "data": (
                "<p>All intended outcomes were achieved: habitat suitability maps published, "
                "decision-support tool delivered to Species and Communities Branch, and three "
                "peer-reviewed papers published in international journals.</p>"
            ),
        },
        "knowledge_transfer": {
            "title": "Knowledge Transfer",
            "data": (
                "<p>All project data, models, and documentation have been transferred to the "
                "Species and Communities Branch. Training sessions were conducted for branch "
                "staff on using the decision-support tool.</p>"
            ),
        },
        "data_location": {
            "title": "Data Location",
            "data": "<p>DBCA Science Division shared drive: S:\\BCS\\Species\\WST\\Monitoring_2025-2028</p>",
        },
        "hardcopy_location": {
            "title": "Hardcopy Location",
            "data": "<p>Kensington office, Building B, Room 2.14, Filing Cabinet 3</p>",
        },
        "backup_location": {
            "title": "Backup Location",
            "data": "<p>DBCA cloud backup (Azure Blob Storage, retention policy: 7 years)</p>",
        },
        "scientific_outputs": {
            "title": "Scientific Outputs",
            "data": (
                "<p>Mitchell, S. et al. (2028). Climate-driven habitat loss projections for "
                "<em>Pseudemydura umbrina</em>. <em>Biological Conservation</em>, 285, 110234.</p>"
                "<p>Chen, J. &amp; Mitchell, S. (2027). Optimising translocation site selection "
                "using spatially explicit PVA. <em>Conservation Biology</em>, 41(4), 892\u2013905.</p>"
                "<p>Thompson, E. et al. (2027). Nesting ecology of translocated Western Swamp "
                "Tortoises at novel sites. <em>Herpetologica</em>, 83(2), 145\u2013158.</p>"
            ),
        },
    }


# Map document kinds to their html_data_items builder functions
_HTML_DATA_BUILDERS = {
    "concept": _build_concept_plan_items,
    "projectplan": _build_project_plan_items,
    "progressreport": _build_progress_report_items,
    "studentreport": _build_student_report_items,
    "projectclosure": _build_project_closure_items,
}


class TestPDFService:
    """Service for generating test PDFs with mock data for template previewing."""

    @staticmethod
    def generate_test_pdf(document_kind: str) -> bytes:
        """
        Generate a test PDF for the given document kind.

        Args:
            document_kind: One of the valid document kinds.

        Returns:
            bytes: The generated PDF content.

        Raises:
            ValueError: If document_kind is not valid.
        """
        context = TestPDFService._build_mock_context(document_kind)
        html_content = render_to_string("project_document.html", context)
        return PDFService._html_to_pdf(html_content)

    @staticmethod
    def _build_mock_context(document_kind: str) -> dict:
        """
        Build a mock template context matching PDFService._build_document_context output.

        Uses real asset paths resolved from settings.BASE_DIR and realistic
        sample data for all template variables.

        Args:
            document_kind: One of the valid document kinds.

        Returns:
            dict: Complete template context for rendering project_document.html.

        Raises:
            ValueError: If document_kind is not valid.
        """
        if document_kind not in DOCUMENT_KIND_MAP:
            raise ValueError(
                f"Invalid document_kind '{document_kind}'. "
                f"Must be one of: {', '.join(VALID_DOCUMENT_KINDS)}"
            )

        base_dir = str(settings.BASE_DIR)
        assets_dir = os.path.join(base_dir, "documents", "assets")

        kind_info = DOCUMENT_KIND_MAP[document_kind]

        # Financial year string — only for progress and student reports
        financial_year_string = ""
        if document_kind in ("progressreport", "studentreport"):
            financial_year_string = "2025-2026"

        context = {
            # CSS and font paths (real filesystem paths)
            "rte_css_path": os.path.join(assets_dir, "rte_styles.css"),
            "prince_css_path": os.path.join(
                assets_dir, "prince_project_document_styles.css"
            ),
            "fonts_folder_path": os.path.join(base_dir, "documents", "static", "fonts"),
            # Image and logo paths (real filesystem paths)
            "dbca_image_path": os.path.join(assets_dir, "BCSTransparent.png"),
            "dbca_cropped_image_path": os.path.join(
                assets_dir, "BCSTransparentCropped.png"
            ),
            "no_image_path": os.path.join(assets_dir, "image_not_available.png"),
            "dbca_logo_path": os.path.join(assets_dir, "dbca.png"),
            "bcs_logo_path": os.path.join(assets_dir, "BCSTransparent.png"),
            "base_url": base_dir,
            # URLs
            "server_url": "http://127.0.0.1:8000",
            "frontend_url": "http://127.0.0.1:3000",
            # Project metadata (mock)
            "project_title": (
                "Monitoring and Conservation of Endangered Western Swamp "
                "Tortoise Populations in Perth Wetlands"
            ),
            "project_id": 9999,
            "project_tag": "SP-2026-001",
            "project_status": "active",
            "project_kind": "science",
            "business_area_name": "Biodiversity and Conservation Science",
            "division_name": "Biodiversity and Conservation Science",
            "team_as_string": (
                "Dr. Sarah Mitchell (Lead), Dr. James Chen, Emma Thompson, "
                "Michael Roberts, Dr. Lisa Anderson"
            ),
            "project_image_path": "",  # Empty — uses fallback
            # Document metadata
            "document_kind_string": kind_info["kind_string"],
            "document_kind_url": kind_info["kind_url"],
            "current_date_time_string": datetime.now().strftime("%-d %B %Y, %-I:%M %p"),
            "financial_year_string": financial_year_string,
            # Approvals (mix of True/False to demonstrate both states)
            "project_lead_approval": True,
            "business_area_lead_approval": True,
            "directorate_approval": False,
            # Content sections
            "html_data_items": _HTML_DATA_BUILDERS[document_kind](),
            "methodology_image": "",
        }

        return context
