"""
PDF service - Document PDF generation using Prince XML
"""

import os
import subprocess
import tempfile

from django.conf import settings
from django.core.files.base import ContentFile
from django.template.loader import render_to_string
from rest_framework.exceptions import ValidationError

from common.utils.file_validation import generate_content_hash

from .related_project_service import RelatedProjectService


class PDFService:
    """PDF generation service using Prince XML"""

    @staticmethod
    def generate_document_pdf(document, template_name="project_document.html"):
        """
        Generate PDF for project document and save to ProjectDocumentPDF model

        Args:
            document: ProjectDocument instance
            template_name: HTML template to use

        Returns:
            ProjectDocumentPDF: Saved PDF instance

        Raises:
            ValidationError: If PDF generation fails
        """
        settings.LOGGER.info(f"Generating PDF for document {document}")

        try:
            # Build context
            context = PDFService._build_document_context(document)

            # Render HTML
            html_content = render_to_string(template_name, context)

            # Generate PDF using Prince
            pdf_content = PDFService._html_to_pdf(html_content)

            # Create ContentFile — the model's save() handles content hashing
            # and old file cleanup via _apply_content_hash_and_cleanup
            filename = f"{document.project.pk}_{document.kind}_{document.pk}.pdf"
            pdf_file = ContentFile(pdf_content, name=filename)

            # Save to ProjectDocumentPDF model
            from medias.models import ProjectDocumentPDF

            try:
                # Update existing PDF
                doc_pdf = ProjectDocumentPDF.objects.get(
                    document=document, project=document.project
                )
                doc_pdf.file = pdf_file
                doc_pdf.save()
            except ProjectDocumentPDF.DoesNotExist:
                # Create new PDF
                doc_pdf = ProjectDocumentPDF.objects.create(
                    file=pdf_file, document=document, project=document.project
                )

            return doc_pdf

        except Exception as e:
            settings.LOGGER.error(f"PDF generation failed for document {document}: {e}")
            raise ValidationError("PDF generation failed. Please try again.")

    @staticmethod
    def generate_annual_report_pdf(report, template_name="annual_report.html"):
        """
        Generate PDF for annual report

        Args:
            report: AnnualReport instance
            template_name: HTML template to use

        Returns:
            ContentFile: Generated PDF file

        Raises:
            ValidationError: If PDF generation fails
        """
        settings.LOGGER.info(f"Generating PDF for annual report {report}")

        try:
            # Build context
            context = PDFService._build_annual_report_context(report)

            # Render HTML
            html_content = render_to_string(template_name, context)

            # Generate PDF using Prince
            pdf_content = PDFService._html_to_pdf(html_content)

            # Create ContentFile with content-hashed filename
            content_hash = generate_content_hash(pdf_content)
            filename = f"annual_report_{report.year}_{content_hash}.pdf"
            return ContentFile(pdf_content, name=filename)

        except Exception as e:
            settings.LOGGER.error(f"PDF generation failed for report {report}: {e}")
            raise ValidationError("PDF generation failed. Please try again.")

    @staticmethod
    def _html_to_pdf(html_content):
        """
        Convert HTML to PDF using Prince XML

        Args:
            html_content: HTML string

        Returns:
            bytes: PDF content

        Raises:
            ValidationError: If conversion fails
        """
        try:
            # Create temporary files
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".html", delete=False, encoding="utf-8"
            ) as html_file:
                html_file.write(html_content)
                html_path = html_file.name

            with tempfile.NamedTemporaryFile(
                mode="wb", suffix=".pdf", delete=False
            ) as pdf_file:
                pdf_path = pdf_file.name

            try:
                # Run Prince XML
                prince_cmd = [
                    "prince",
                    html_path,
                    "-o",
                    pdf_path,
                    "--javascript",
                ]

                result = subprocess.run(
                    prince_cmd,
                    capture_output=True,
                    text=True,
                    timeout=300,  # 5 minute timeout
                )

                if result.returncode != 0:
                    settings.LOGGER.error(f"Prince XML failed: {result.stderr}")
                    raise ValidationError("PDF generation failed. Please try again.")

                # Read PDF content
                with open(pdf_path, "rb") as f:
                    pdf_content = f.read()

                return pdf_content

            finally:
                # Clean up temporary files
                if os.path.exists(html_path):
                    os.unlink(html_path)
                if os.path.exists(pdf_path):
                    os.unlink(pdf_path)

        except subprocess.TimeoutExpired:
            raise ValidationError("PDF generation timed out")
        except Exception as e:
            settings.LOGGER.error(f"PDF generation error: {e}")
            raise ValidationError("PDF generation failed. Please try again.")

    @staticmethod
    def _build_document_context(document):
        """
        Build template context for project document

        Args:
            document: ProjectDocument instance

        Returns:
            dict: Template context
        """
        import re
        from datetime import datetime

        from bs4 import BeautifulSoup

        # Helper functions
        def apply_styling(html_string):
            """Apply styling to HTML content"""
            if not html_string:
                return html_string

            settings.LOGGER.info(
                f"apply_styling called, input length: {len(html_string)}"
            )

            # Replace 'dark' with 'light' in class attributes
            modified_html = re.sub(
                r'class\s*=\s*["\']([^"\']*dark[^"\']*)["\']',
                lambda match: f'class="{match.group(1).replace("dark", "light")}"',
                html_string,
                flags=re.IGNORECASE,
            )

            # Add margin-left to list items
            html_with_lists = re.sub(
                r"<li", r'<li style="margin-left: 36px;"', modified_html
            )

            # Ensure tables have proper styling
            soup = BeautifulSoup(html_with_lists, "html.parser")

            # Find all tables (both table-light and editor-table classes)
            tables_found = soup.find_all("table")
            settings.LOGGER.info(f"Found {len(tables_found)} tables to process")

            for table_idx, table in enumerate(tables_found):
                # Count columns by looking at first row
                first_row = table.find("tr")
                column_count = 0
                if first_row:
                    column_count = len(first_row.find_all(["th", "td"]))

                settings.LOGGER.info(f"Table {table_idx}: {column_count} columns")

                # Add table-light class
                table_classes = ["table-light"]
                if column_count >= 7:
                    table_classes.append("table-wide")

                table.attrs["class"] = table_classes

                # Remove <colgroup> elements — editor tables include these with
                # fixed-width <col> tags that can cause overflow in PDF output
                for colgroup in table.find_all("colgroup"):
                    colgroup.decompose()

                # COMPLETELY REPLACE table style (don't preserve anything)
                # Use table-layout: fixed to force equal column distribution within 100% width
                table.attrs["style"] = (
                    "width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden;"
                )

                # Get all rows to determine position
                all_rows = table.find_all("tr")

                # Style all th and td elements with forced inline styles
                for row_idx, row in enumerate(all_rows):
                    is_last_row = row_idx == len(all_rows) - 1

                    cells = row.find_all(["th", "td"])
                    for cell_idx, cell in enumerate(cells):
                        is_last_cell = cell_idx == len(cells) - 1

                        # COMPLETELY REPLACE cell style (don't preserve old border styles)
                        # Start fresh with base styles
                        if column_count >= 7:
                            cell_style = "padding: 8px 10px; font-size: 11px; vertical-align: top; text-align: start; word-break: break-word; overflow: hidden;"
                        else:
                            cell_style = "padding: 12px 16px; vertical-align: top; text-align: start; word-break: break-word; overflow: hidden;"

                        # Add background color
                        if cell.name == "th" or cell_idx == 0:
                            cell_style += " background-color: rgb(242, 243, 245); font-weight: 600;"
                        else:
                            cell_style += " background-color: #ffffff;"

                        # Only add borders to create grid lines (not on edges)
                        # Internal borders: 0.5px (thinner) but same color as outer border

                        # Add right border only if NOT the last cell
                        if not is_last_cell:
                            cell_style += " border-right: 0.5px solid #d1d5db;"

                        # Add bottom border only if NOT the last row
                        if not is_last_row:
                            cell_style += " border-bottom: 0.5px solid #d1d5db;"

                        # REPLACE the entire style attribute
                        cell.attrs["style"] = cell_style
                        cell.attrs["class"] = ["table-cell-light"]

                        if cell.name == "th":
                            if "table-cell-header-light" not in cell.attrs.get(
                                "class", []
                            ):
                                cell.attrs["class"].append("table-cell-header-light")

                # Log first cell style as sample
                first_cell = table.find(["th", "td"])
                if first_cell:
                    settings.LOGGER.info(
                        f"Table {table_idx} first cell style: {first_cell.get('style', 'NO STYLE')}"
                    )

            result = str(soup)
            settings.LOGGER.info(f"apply_styling output length: {len(result)}")

            return result

        def get_inner_html(html_content, html_tag):
            """Extract inner HTML from element"""
            if not html_content:
                return ""
            soup = BeautifulSoup(html_content, "html.parser")
            element = soup.find(html_tag)
            if element:
                return str(element.decode_contents())
            return html_content

        def apply_title_styling(title):
            """Apply styling to project title"""
            if not title:
                return title
            soup = BeautifulSoup(title, "html.parser")
            h1_tag = soup.new_tag("h1")
            h1_tag["style"] = """
                color: rgb(0, 102, 204);
                font-size: 24px;
                font-weight: 400;
                text-align: center;
                padding: 0px;
                margin-top: 2.5rem;
                margin-bottom: 30px;
                margin-left: 0px;
                margin-right: 0px;
                cursor: pointer;
            """

            # Style strong tags
            for strong_tag in soup.find_all("strong"):
                strong_tag["style"] = "color: rgb(0, 102, 204);"

            # Transfer content
            if soup.p:
                h1_tag.extend(soup.p.contents)
                soup.p.replace_with(h1_tag)

            return str(soup)

        def get_project_team(project):
            """Get formatted project team string"""
            from projects.models import ProjectMember

            members = ProjectMember.objects.filter(project=project).select_related(
                "user"
            )

            # Separate leader and other members
            leader = None
            other_members = []

            for member in members:
                if member.is_leader:
                    leader = member
                else:
                    other_members.append(member)

            # Sort other members by position
            sorted_members = sorted(other_members, key=lambda m: m.position)

            # Build team array
            team_names = []
            if leader:
                team_names.append(
                    f"{leader.user.display_first_name} {leader.user.display_last_name}"
                )

            for member in sorted_members:
                team_names.append(
                    f"{member.user.display_first_name} {member.user.display_last_name}"
                )

            return ", ".join(team_names)

        def get_project_image_path(project):
            """Get project image file path (relative to BASE_DIR)"""
            from medias.models import ProjectPhoto

            try:
                photo = ProjectPhoto.objects.get(project=project)
                if photo.file and hasattr(photo.file, "path"):
                    # Get absolute path
                    abs_path = photo.file.path
                    # Make it relative to BASE_DIR
                    rel_path = os.path.relpath(abs_path, settings.BASE_DIR)
                    settings.LOGGER.info(f"Project image path: {rel_path}")
                    return f"/{rel_path}"  # Add leading slash
            except (ProjectPhoto.DoesNotExist, ValueError, AttributeError) as e:
                settings.LOGGER.warning(f"Could not get project image: {e}")

            settings.LOGGER.warning("No project image found, using fallback")
            return ""

        def get_methodology_image_path(project):
            """Get methodology image file path (relative to BASE_DIR)"""
            from medias.models import ProjectPlanMethodologyPhoto

            try:
                photo = ProjectPlanMethodologyPhoto.objects.get(
                    project_plan__project=project
                )
                if photo.file and hasattr(photo.file, "path"):
                    # Get absolute path
                    abs_path = photo.file.path
                    # Make it relative to BASE_DIR
                    rel_path = os.path.relpath(abs_path, settings.BASE_DIR)
                    settings.LOGGER.info(f"Methodology image path: {rel_path}")
                    return f"/{rel_path}"  # Add leading slash
            except (
                ProjectPlanMethodologyPhoto.DoesNotExist,
                ValueError,
                AttributeError,
            ) as e:
                settings.LOGGER.warning(f"Could not get methodology image: {e}")

            return ""

        def get_formatted_datetime(dt):
            """Format datetime for display — e.g. '2 May 2026, 5:39 PM'"""
            return dt.strftime("%-d %B %Y, %-I:%M %p")

        def get_document_kind_info(document):
            """Get document kind display information"""
            kind_map = {
                "concept": ["concept", "Science Concept Plan"],
                "projectplan": ["project", "Science Project Plan"],
                "progressreport": ["progress", "Progress Report"],
                "studentreport": ["student", "Student Report"],
                "projectclosure": ["closure", "Project Closure"],
            }
            return kind_map.get(document.kind, [document.kind, document.kind.title()])

        def get_project_kind_info(project):
            """Get project kind display information"""
            kind_map = {
                "science": ["science", "SP"],
                "student": ["student", "STP"],
                "external": ["external", "EXT"],
                "core_function": ["core_function", "CF"],
            }
            return kind_map.get(project.kind, [project.kind, project.kind.upper()])

        def get_division_name(project):
            """Get division name from the project's business area"""
            try:
                if project.business_area and project.business_area.division:
                    return project.business_area.division.name
            except AttributeError, TypeError:
                pass
            return "Biodiversity and Conservation Science"

        # Build base context with paths
        base_dir = settings.BASE_DIR
        context = {
            # Core objects
            "document": document,
            "project": document.project,
            "business_area": document.project.business_area,
            # CSS and font paths
            "rte_css_path": os.path.join(
                base_dir, "documents", "assets", "rte_styles.css"
            ),
            "prince_css_path": os.path.join(
                base_dir, "documents", "assets", "prince_project_document_styles.css"
            ),
            "fonts_folder_path": os.path.join(base_dir, "documents", "static", "fonts"),
            # Image paths
            "dbca_image_path": os.path.join(
                base_dir, "documents", "assets", "BCSTransparent.png"
            ),
            "dbca_cropped_image_path": os.path.join(
                base_dir, "documents", "assets", "BCSTransparentCropped.png"
            ),
            "no_image_path": os.path.join(
                base_dir, "documents", "assets", "image_not_available.png"
            ),
            # Logo paths (for v2 template)
            "dbca_logo_path": os.path.join(base_dir, "documents", "assets", "dbca.png"),
            "bcs_logo_path": os.path.join(
                base_dir, "documents", "assets", "BCSTransparent.png"
            ),
            # URLs
            "server_url": (
                settings.PRINCE_SERVER_URL
                if hasattr(settings, "PRINCE_SERVER_URL")
                else "http://127.0.0.1:8000"
            ),
            "frontend_url": (
                settings.SITE_URL
                if hasattr(settings, "SITE_URL")
                else "http://127.0.0.1:3000"
            ),
            "base_url": base_dir,
            # Document metadata
            "current_date_time_string": get_formatted_datetime(datetime.now()),
            # Project info
            "project_image_path": get_project_image_path(document.project),
            "project_title": get_inner_html(
                apply_title_styling(document.project.title), "h1"
            ),
            "plain_project_title": BeautifulSoup(
                document.project.title or "", "html.parser"
            ).get_text(),
            "project_status": document.project.status,
            "business_area_name": document.project.business_area.name,
            "division_name": get_division_name(document.project),
            "team_as_string": get_project_team(document.project),
            # Document info
            "project_kind": get_project_kind_info(document.project)[0],
            "document_kind_url": get_document_kind_info(document)[0],
            "document_kind_string": get_document_kind_info(document)[1],
            "project_tag": f"{get_project_kind_info(document.project)[1]}-{document.project.year}-{document.project.number}",
            "project_id": document.project.pk,
            # Approval flags
            "project_lead_approval": document.project_lead_approval_granted,
            "business_area_lead_approval": document.business_area_lead_approval_granted,
            "directorate_approval": document.directorate_approval_granted,
        }

        # Add document-specific data
        if document.kind == "concept":
            if hasattr(document, "concept_plan_details"):
                details = document.concept_plan_details.first()
                if details:
                    context["details"] = details
                    context["html_data_items"] = {
                        "background": {
                            "title": "Background",
                            "data": apply_styling(details.background),
                        },
                        "aims": {
                            "title": "Aims",
                            "data": apply_styling(details.aims),
                        },
                        "outcomes": {
                            "title": "Expected Outcomes",
                            "data": apply_styling(details.outcome),
                        },
                        "context": {
                            "title": "Strategic Context",
                            "data": apply_styling(details.strategic_context),
                        },
                        "collaborations": {
                            "title": "Expected Collaborations",
                            "data": apply_styling(details.collaborations),
                        },
                        "staff_time_allocation": {
                            "title": "Staff Time Allocation",
                            "data": apply_styling(details.staff_time_allocation),
                        },
                        "budget": {
                            "title": "Indicative Operating Budget",
                            "data": apply_styling(details.budget),
                        },
                    }

        elif document.kind == "projectplan":
            if hasattr(document, "project_plan_details"):
                details = document.project_plan_details.first()
                if details:
                    context["details"] = details
                    context["methodology_image"] = get_methodology_image_path(
                        document.project
                    )

                    # Get endorsements
                    endorsements = details.endorsements.first()
                    context["endorsements"] = (
                        endorsements  # Add endorsements to context
                    )
                    context["specimens"] = (
                        endorsements.no_specimens if endorsements else ""
                    )
                    context["data_management"] = (
                        endorsements.data_management if endorsements else ""
                    )

                    context["html_data_items"] = {
                        "background": {
                            "title": "Background",
                            "data": apply_styling(details.background),
                        },
                        "aims": {
                            "title": "Aims",
                            "data": apply_styling(details.aims),
                        },
                        "outcomes": {
                            "title": "Expected Outcomes",
                            "data": apply_styling(details.outcome),
                        },
                        "methodology": {
                            "title": "Methodology",
                            "data": apply_styling(details.methodology),
                        },
                        "project_tasks": {
                            "title": "Project Tasks",
                            "data": apply_styling(details.project_tasks),
                        },
                        "knowledge_transfer": {
                            "title": "Knowledge Transfer",
                            "data": apply_styling(details.knowledge_transfer),
                        },
                        "related_projects": {
                            "title": "Related Projects",
                            "data": apply_styling(
                                RelatedProjectService.build_pdf_html(
                                    details, details.related_projects
                                )
                            ),
                        },
                        "consolidated_funds": {
                            "title": "Consolidated Funds",
                            "data": apply_styling(details.operating_budget),
                        },
                        "external_funds": {
                            "title": "External Funds",
                            "data": apply_styling(details.operating_budget_external),
                        },
                        "listed_references": {
                            "title": "References",
                            "data": apply_styling(details.listed_references),
                        },
                    }

        elif document.kind == "progressreport":
            if hasattr(document, "progress_report_details"):
                details = document.progress_report_details.first()
                if details:
                    context["details"] = details
                    context["financial_year_string"] = (
                        f"{int(details.year-1)}-{int(details.year)}"
                    )
                    context["html_data_items"] = {
                        "context": {
                            "title": "Context",
                            "data": apply_styling(details.context),
                        },
                        "aims": {
                            "title": "Aims",
                            "data": apply_styling(details.aims),
                        },
                        "progress": {
                            "title": "Progress",
                            "data": apply_styling(details.progress),
                        },
                        "implications": {
                            "title": "Management Implications",
                            "data": apply_styling(details.implications),
                        },
                        "future": {
                            "title": "Future Directions",
                            "data": apply_styling(details.future),
                        },
                    }

        elif document.kind == "studentreport":
            if hasattr(document, "student_report_details"):
                details = document.student_report_details.first()
                if details:
                    context["details"] = details
                    context["financial_year_string"] = (
                        f"{int(details.year-1)}-{int(details.year)}"
                    )
                    context["html_data_items"] = {
                        "progress_report": {
                            "title": "Progress Report",
                            "data": apply_styling(details.progress_report),
                        },
                    }

        elif document.kind == "projectclosure":
            if hasattr(document, "project_closure_details"):
                details = document.project_closure_details.first()
                if details:
                    context["details"] = details
                    context["html_data_items"] = {
                        "reason": {
                            "title": "Reason for Closure",
                            "data": apply_styling(details.reason),
                        },
                        "intended_outcome": {
                            "title": "Intended Outcome",
                            "data": apply_styling(details.intended_outcome),
                        },
                        "knowledge_transfer": {
                            "title": "Knowledge Transfer",
                            "data": apply_styling(details.knowledge_transfer),
                        },
                        "data_location": {
                            "title": "Data Location",
                            "data": apply_styling(details.data_location),
                        },
                        "hardcopy_location": {
                            "title": "Hardcopy Location",
                            "data": apply_styling(details.hardcopy_location),
                        },
                        "backup_location": {
                            "title": "Backup Location",
                            "data": apply_styling(details.backup_location),
                        },
                        "scientific_outputs": {
                            "title": "Scientific Outputs",
                            "data": apply_styling(details.scientific_outputs),
                        },
                    }

        return context

    @staticmethod
    def _build_annual_report_context(report):
        """
        Build template context for annual report

        Args:
            report: AnnualReport instance

        Returns:
            dict: Template context
        """
        from ..models import ProjectDocument

        # Get all approved documents for the report year
        progress_reports = (
            ProjectDocument.objects.filter(
                kind="progressreport",
                status=ProjectDocument.StatusChoices.APPROVED,
                project__year=report.year,
            )
            .select_related(
                "project",
                "project__business_area",
            )
            .prefetch_related(
                "progress_report_details",
            )
        )

        student_reports = (
            ProjectDocument.objects.filter(
                kind="studentreport",
                status=ProjectDocument.StatusChoices.APPROVED,
                project__year=report.year,
            )
            .select_related(
                "project",
                "project__business_area",
            )
            .prefetch_related(
                "student_report_details",
            )
        )

        context = {
            "report": report,
            "progress_reports": progress_reports,
            "student_reports": student_reports,
        }

        return context

    @staticmethod
    def cancel_pdf_generation(document):
        """
        Cancel ongoing PDF generation

        Args:
            document: ProjectDocument or AnnualReport instance
        """
        settings.LOGGER.info(f"Cancelling PDF generation for {document}")

        document.pdf_generation_in_progress = False
        document.save()

    @staticmethod
    def mark_pdf_generation_started(document):
        """
        Mark PDF generation as started

        Args:
            document: ProjectDocument or AnnualReport instance
        """
        document.pdf_generation_in_progress = True
        document.save()

    @staticmethod
    def mark_pdf_generation_complete(document):
        """
        Mark PDF generation as complete

        Args:
            document: ProjectDocument or AnnualReport instance
        """
        document.pdf_generation_in_progress = False
        document.save()
