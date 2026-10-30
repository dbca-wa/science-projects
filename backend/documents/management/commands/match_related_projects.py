"""
Turn the legacy related projects text on project plans into related project
links and suggestions.

Dry run by default: nothing is written unless --apply is given. The legacy text
is only ever read. Rows that already exist for a plan, in any status, are never
changed, so decisions people have made are kept.
"""

import csv
from collections import Counter

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from documents.models import ProjectPlan, ProjectPlanRelatedProject
from documents.utils.related_project_matching import (
    LINKED,
    SUGGESTED,
    ProjectIndex,
    match_plan,
)
from projects.models import Project

Status = ProjectPlanRelatedProject.StatusChoices
Source = ProjectPlanRelatedProject.SourceChoices

REPORT_COLUMNS = [
    "plan_id",
    "plan_project_tag",
    "matched_text",
    "match_type",
    "outcome",
    "project_id",
    "project_tag",
    "project_title",
]

MATCHED_TEXT_MAX_LENGTH = 255


class Command(BaseCommand):
    help = (
        "Match project plans' legacy related projects text to projects. Certain "
        "matches become links and the rest become suggestions. Dry run unless "
        "--apply is given."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Create the links and suggestions (default: report only)",
        )
        parser.add_argument(
            "--undo",
            action="store_true",
            help="Delete links and suggestions this command added that no person has touched",
        )
        parser.add_argument(
            "--plan",
            type=int,
            help="Only process the project plan with this ID",
        )
        parser.add_argument(
            "--report",
            type=str,
            help="Write a CSV report of every match to this path",
        )

    def handle(self, *args, **options):
        if options["apply"] and options["undo"]:
            raise CommandError("--apply and --undo cannot be used together.")

        plan_id = options["plan"]
        if plan_id is not None and not ProjectPlan.objects.filter(pk=plan_id).exists():
            raise CommandError(f"Project plan {plan_id} does not exist.")

        if options["undo"]:
            self._undo(plan_id)
            return

        self._match(plan_id, apply=options["apply"], report_path=options["report"])

    def _undo(self, plan_id):
        rows = ProjectPlanRelatedProject.objects.filter(
            source=Source.SCRIPT, status_changed_by__isnull=True
        )
        if plan_id is not None:
            rows = rows.filter(project_plan_id=plan_id)
        deleted, _ = rows.delete()
        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {deleted} link(s) and suggestion(s) added by this command "
                "that no person had changed"
            )
        )

    def _match(self, plan_id, apply, report_path):
        index = ProjectIndex.from_projects(
            Project.objects.values_list("pk", "kind", "year", "number", "title")
        )

        plans = ProjectPlan.objects.select_related("project").order_by("pk")
        if plan_id is not None:
            plans = plans.filter(pk=plan_id)

        totals = Counter()
        report_rows = []
        failed_plans = 0

        for plan in plans.iterator():
            existing = set(
                ProjectPlanRelatedProject.objects.filter(project_plan=plan).values_list(
                    "related_project_id", flat=True
                )
            )
            matches = match_plan(
                plan.project_id, plan.related_projects, index, existing
            )
            if not matches:
                continue

            if apply:
                try:
                    self._apply_matches(plan, matches)
                except Exception as error:  # noqa: BLE001 - report and continue
                    failed_plans += 1
                    self.stderr.write(
                        f"Plan {plan.pk}: no changes made because of an error: {error}"
                    )
                    continue

            plan_tag = plan.project.get_project_tag()
            for match in matches:
                totals[match.outcome] += 1
                report_rows.append(self._report_row(plan, plan_tag, match))

        if report_path:
            self._write_report(report_path, report_rows)

        self._print_totals(totals, apply, failed_plans)

    @staticmethod
    def _apply_matches(plan, matches):
        """Create rows for one plan's links and suggestions, all or nothing"""
        with transaction.atomic():
            for match in matches:
                if match.outcome not in (LINKED, SUGGESTED):
                    continue
                ProjectPlanRelatedProject.objects.get_or_create(
                    project_plan=plan,
                    related_project_id=match.project.pk,
                    defaults={
                        "status": (
                            Status.LINKED
                            if match.outcome == LINKED
                            else Status.SUGGESTED
                        ),
                        "source": Source.SCRIPT,
                        "match_type": match.match_type,
                        "matched_text": match.matched_text[:MATCHED_TEXT_MAX_LENGTH],
                    },
                )

    @staticmethod
    def _report_row(plan, plan_tag, match):
        project = match.project
        return {
            "plan_id": plan.pk,
            "plan_project_tag": plan_tag,
            "matched_text": match.matched_text,
            "match_type": match.match_type,
            "outcome": match.outcome,
            "project_id": project.pk if project else "",
            # An unsaved instance reuses the model's tag format without a query
            "project_tag": (
                Project(
                    kind=project.kind, year=project.year, number=project.number
                ).get_project_tag()
                if project
                else ""
            ),
            "project_title": project.title if project else "",
        }

    @staticmethod
    def _write_report(report_path, report_rows):
        with open(report_path, "w", newline="", encoding="utf-8") as report_file:
            writer = csv.DictWriter(report_file, fieldnames=REPORT_COLUMNS)
            writer.writeheader()
            writer.writerows(report_rows)

    def _print_totals(self, totals, apply, failed_plans):
        mode = "Applied" if apply else "Dry run (no changes made)"
        self.stdout.write(self.style.SUCCESS(f"{mode}. Matches by outcome:"))
        for outcome, count in sorted(totals.items()):
            self.stdout.write(f"  {outcome}: {count}")
        if failed_plans:
            self.stderr.write(f"{failed_plans} plan(s) failed and were left unchanged")
