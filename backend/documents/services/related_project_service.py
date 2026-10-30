"""
Related projects for project plans.

A plan's related projects are ProjectPlanRelatedProject rows with a status:
linked (in the list), suggested (offered by the matching script) or dismissed
(removed or rejected by a person). Dismissed rows are kept so the matching
script never adds the same project back.
"""

from html import escape

from bs4 import BeautifulSoup
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Prefetch
from rest_framework.exceptions import ValidationError

from projects.models import ProjectMember

from ..models import ProjectPlanRelatedProject

Status = ProjectPlanRelatedProject.StatusChoices
Source = ProjectPlanRelatedProject.SourceChoices

# Display order: newest project year first, then project number
LIST_ORDER = ("-related_project__year", "related_project__number")

# Attribute the prefetch stores rows on, read by the serializers
VISIBLE_ROWS_ATTR = "visible_related_project_rows"

OWN_PROJECT_ERROR = "A project plan cannot list its own project."
ALREADY_LINKED_ERROR = "This project is already in the related projects list."


def _visible_rows_queryset():
    return (
        ProjectPlanRelatedProject.objects.exclude(status=Status.DISMISSED)
        .select_related("related_project")
        .prefetch_related(
            Prefetch(
                "related_project__members",
                queryset=ProjectMember.objects.filter(is_leader=True).select_related(
                    "user"
                ),
                to_attr="leader_members",
            )
        )
        .order_by(*LIST_ORDER)
    )


def _plain_text(html_string):
    """Text content of an HTML fragment, with whitespace collapsed"""
    return BeautifulSoup(html_string or "", "html.parser").get_text(" ", strip=True)


def visible_rows_prefetch(lookup="related_project_rows"):
    """
    Prefetch a plan's linked and suggested rows, in display order, with each
    related project's leader. Use the lookup relative to the queryset's model.
    """
    return Prefetch(
        lookup,
        queryset=_visible_rows_queryset(),
        to_attr=VISIBLE_ROWS_ATTR,
    )


class RelatedProjectService:
    """Business logic for a project plan's related projects."""

    @staticmethod
    def get_visible_rows(project_plan):
        """
        Linked and suggested rows for a plan, in display order.

        Uses the rows from visible_rows_prefetch() when present; otherwise
        loads them once and caches them on the plan.
        """
        rows = getattr(project_plan, VISIBLE_ROWS_ATTR, None)
        if rows is None:
            rows = list(_visible_rows_queryset().filter(project_plan=project_plan))
            setattr(project_plan, VISIBLE_ROWS_ATTR, rows)
        return rows

    @staticmethod
    def add(project_plan, related_project, user):
        """
        Put a project in the plan's related projects list.

        Creates a manual link, or moves an existing suggested or dismissed row
        to linked (accepting a suggestion, or re-adding a removed project).

        Returns (row, created). Raises ValidationError for the plan's own
        project or a project already in the list.
        """
        if related_project.pk == project_plan.project_id:
            raise ValidationError({"related_project": OWN_PROJECT_ERROR})

        with transaction.atomic():
            row = (
                ProjectPlanRelatedProject.objects.select_for_update()
                .filter(project_plan=project_plan, related_project=related_project)
                .first()
            )

            if row is None:
                try:
                    with transaction.atomic():
                        row = ProjectPlanRelatedProject.objects.create(
                            project_plan=project_plan,
                            related_project=related_project,
                            status=Status.LINKED,
                            source=Source.MANUAL,
                            created_by=user,
                            status_changed_by=user,
                        )
                except IntegrityError:
                    # Another request added the same project at the same time
                    raise ValidationError({"related_project": ALREADY_LINKED_ERROR})
                RelatedProjectService._log(user, row, None)
                return row, True

            if row.status == Status.LINKED:
                raise ValidationError({"related_project": ALREADY_LINKED_ERROR})

            previous_status = row.status
            row.status = Status.LINKED
            row.status_changed_by = user
            row.save(update_fields=["status", "status_changed_by", "updated_at"])
            RelatedProjectService._log(user, row, previous_status)
            return row, False

    @staticmethod
    def remove(row, user):
        """
        Take a project out of the list, or dismiss a suggestion.

        The row is kept as dismissed so the matching script never re-adds it.
        """
        previous_status = row.status
        row.status = Status.DISMISSED
        row.status_changed_by = user
        row.save(update_fields=["status", "status_changed_by", "updated_at"])
        RelatedProjectService._log(user, row, previous_status)
        return row

    @staticmethod
    def clear_legacy_text(project_plan, user):
        """
        Remove the plan's legacy related projects text.

        People clear it once the projects it names are in the list. The list
        and any suggestions are left as they are. The removed text is logged in
        full so it can be recovered.
        """
        previous = project_plan.related_projects or ""
        if not previous:
            return project_plan

        project_plan.related_projects = ""
        project_plan.save(update_fields=["related_projects"])
        settings.LOGGER.info(
            f"{user} cleared the legacy related projects text on project plan "
            f"{project_plan.pk}. Previous text: {previous}"
        )
        return project_plan

    @staticmethod
    def build_pdf_html(project_plan, legacy_html):
        """
        HTML for the PDF's Related Projects section.

        Lists the linked projects (tag and plain-text title), followed by the
        legacy free text when it has any content. Suggestions are never
        included. Returns an empty string when there is nothing to show.
        """
        links = [
            row
            for row in RelatedProjectService.get_visible_rows(project_plan)
            if row.status == Status.LINKED
        ]

        parts = []
        if links:
            items = "".join(
                f"<li>{escape(row.related_project.get_project_tag())} &ndash; "
                f"{escape(_plain_text(row.related_project.title))}</li>"
                for row in links
            )
            parts.append(f"<ul>{items}</ul>")

        if legacy_html and _plain_text(legacy_html):
            parts.append(legacy_html)

        return "".join(parts)

    @staticmethod
    def _log(user, row, previous_status):
        settings.LOGGER.info(
            f"{user} changed related project {row.related_project_id} on project "
            f"plan {row.project_plan_id}: {previous_status or 'none'} -> {row.status}"
        )
