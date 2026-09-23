"""
Notification service - Business logic for document notifications
"""

from django.conf import settings
from django.template.loader import render_to_string
from django.utils.html import strip_tags

from config.helpers import send_email_with_embedded_image
from projects.models import Project
from users.models import User
from users.utils import get_user_display_name

from ..models import ProjectDocument
from .email_service import EmailService

# ─── Shared helpers for email context ─────────────────────────────────────────

DOCUMENT_KIND_MAP = {
    "concept": "Concept Plan",
    "projectplan": "Project Plan",
    "progressreport": "Progress Report",
    "studentreport": "Student Report",
    "projectclosure": "Project Closure",
}

URL_KIND_MAP = {
    "concept": "concept",
    "projectplan": "project",
    "progressreport": "progress",
    "studentreport": "student",
    "projectclosure": "closure",
}


def _build_document_context(document):
    """Build common template context for a document notification.

    Returns a dict with document_type, document_type_title, plain_project_name,
    document_url, and site_url — the variables most email templates need.

    For progress reports and student reports, the URL includes a ?FY= query
    parameter so the link opens the correct financial year (not just the latest).
    """
    document_type_title = DOCUMENT_KIND_MAP.get(document.kind, document.kind)
    url_kind = URL_KIND_MAP.get(document.kind, document.kind)
    document_url = f"{settings.SITE_URL}/projects/{document.project.pk}/{url_kind}"

    # Add ?FY= param for progress reports and student reports
    if document.kind == "progressreport":
        report_detail = document.progress_report_details.first()
        if report_detail and report_detail.year:
            year = report_detail.year
            document_url += f"?FY={year - 1}-{str(year)[2:]}"
    elif document.kind == "studentreport":
        report_detail = document.student_report_details.first()
        if report_detail and report_detail.year:
            year = report_detail.year
            document_url += f"?FY={year - 1}-{str(year)[2:]}"

    return {
        "document_type": document.kind,
        "document_type_title": document_type_title,
        "plain_project_name": strip_tags(document.project.title),
        "document_url": document_url,
        "site_url": settings.SITE_URL,
    }


def _build_project_url(project):
    """Build the URL to a project's overview page."""
    return f"{settings.SITE_URL}/projects/{project.pk}"


class NotificationService:
    """Business logic for document notifications"""

    @staticmethod
    def notify_document_approved(document, approver, stage=None, feedback_html=""):
        """
        Notify the correct next approver when a document is approved at a stage.

        Stage-specific routing:
        - Stage 1 (PL approves) → email BA lead ("ready for your review")
        - Stage 2 (BA lead approves) → email key stakeholder / approvers / directorate
        - Stage 3 (directorate approves) → email project lead ("fully approved")

        Falls back to generic document recipients if stage is not provided.

        Args:
            document: Approved document instance
            approver: User who approved the document
            stage: The approval stage that was just completed (1, 2, or 3)
            feedback_html: Optional comment/feedback HTML to include in email
        """
        if stage is not None:
            recipients = NotificationService._get_stage_approval_recipients(
                document, int(stage)
            )
        else:
            recipients = NotificationService._get_document_recipients(document)

        if not recipients:
            settings.LOGGER.warning(
                f"No approval recipients found for document {document.pk} at stage {stage}"
            )
            return

        # Use different notification type for final approval (stage 3)
        notification_type = "approved"
        doc_ctx = _build_document_context(document)
        doc_type_title = doc_ctx["document_type_title"]
        email_subject = f"{doc_type_title} Approved"

        if stage == 3:
            email_subject = f"{doc_type_title} — Final Approval Granted"

        additional_context = {
            "email_subject": email_subject,
            "stage": stage,
            **doc_ctx,
        }
        if feedback_html:
            additional_context["feedback_html"] = feedback_html

        EmailService.send_document_notification(
            notification_type=notification_type,
            document=document,
            recipients=recipients,
            actioning_user=approver,
            additional_context=additional_context,
        )

    @staticmethod
    def notify_batch_approved(documents, approver):
        """
        Send consolidated approval notification emails for batch-approved documents.
        Groups documents by recipient so each user gets one email listing all their
        approved documents, rather than one email per document.

        Recipients are limited to project leads and business area leads only —
        regular team members do not receive batch approval notifications.

        Args:
            documents: List of approved ProjectDocument instances
            approver: User who performed the batch approval
        """
        document_kind_dict = {
            "concept": "Concept Plan",
            "projectplan": "Project Plan",
            "progressreport": "Progress Report",
            "studentreport": "Student Report",
            "projectclosure": "Project Closure",
        }
        url_kind_map = {
            "concept": "concept",
            "projectplan": "project",
            "progressreport": "progress",
            "studentreport": "student",
            "projectclosure": "closure",
        }

        # Group documents by recipient (deduplicated by email)
        # Only project leads and BA leads receive batch approval emails
        user_docs = {}  # email → {name, email, docs: []}

        for doc in documents:
            recipients = NotificationService._get_batch_approval_recipients(doc)
            kind_label = document_kind_dict.get(doc.kind, doc.kind)
            url_kind = url_kind_map.get(doc.kind, doc.kind)
            doc_url = f"{settings.SITE_URL}/projects/{doc.project.pk}/{url_kind}"

            # Add ?FY= param for progress/student reports
            if doc.kind == "progressreport":
                report_detail = doc.progress_report_details.first()
                if report_detail and report_detail.year:
                    year = report_detail.year
                    doc_url += f"?FY={year - 1}-{str(year)[2:]}"
            elif doc.kind == "studentreport":
                report_detail = doc.student_report_details.first()
                if report_detail and report_detail.year:
                    year = report_detail.year
                    doc_url += f"?FY={year - 1}-{str(year)[2:]}"

            doc_info = {
                "project_title": strip_tags(doc.project.title),
                "document_kind": kind_label,
                "document_url": doc_url,
            }

            for recipient in recipients:
                email = recipient["email"]
                if not email:
                    continue
                if email not in user_docs:
                    user_docs[email] = {
                        "name": recipient["name"],
                        "email": email,
                        "docs": [],
                    }
                # Avoid duplicate docs for the same user
                existing_urls = {d["document_url"] for d in user_docs[email]["docs"]}
                if doc_info["document_url"] not in existing_urls:
                    user_docs[email]["docs"].append(doc_info)

        # Send one consolidated email per user
        for email, data in user_docs.items():
            total = len(data["docs"])
            if total == 0:
                continue

            if total == 1:
                # Single document — use the standard approval template
                doc_info = data["docs"][0]
                email_subject = f"SPMS: {doc_info['document_kind']} Approved"
            else:
                email_subject = f"SPMS: {total} Reports Approved"

            template_props = {
                "recipient_name": data["name"],
                "documents": data["docs"],
                "total_documents": total,
                "site_url": settings.SITE_URL,
            }

            try:
                template_content = render_to_string(
                    "./email_templates/batch_approved_consolidated_email.html",
                    template_props,
                )
                send_email_with_embedded_image(
                    recipient_email=[email],
                    subject=email_subject,
                    html_content=template_content,
                )
            except Exception as e:
                settings.LOGGER.error(
                    f"Failed to send batch approval notification to {email}: {e}"
                )

    @staticmethod
    def notify_document_approved_directorate(document, approver):
        """
        Notify directorate when document is approved at directorate level

        Args:
            document: Approved document instance
            approver: User who approved the document
        """
        recipients = NotificationService._get_directorate_recipients(document)

        doc_ctx = _build_document_context(document)

        EmailService.send_document_notification(
            notification_type="approved_directorate",
            document=document,
            recipients=recipients,
            actioning_user=approver,
            additional_context={
                "email_subject": f"{doc_ctx['document_type_title']} Approved by Directorate",
                "stage": 3,
                **doc_ctx,
            },
        )

    @staticmethod
    def notify_document_recalled(document, recaller, feedback_html=""):
        """
        Notify the correct next-step recipient when a document is recalled.

        Args:
            document: Recalled document instance
            recaller: User who recalled the document
            feedback_html: Optional rich text HTML feedback (rendered in email)
        """
        recipients = NotificationService._get_recall_recipients(document, recaller)
        if not recipients:
            settings.LOGGER.warning(
                f"No recall recipients found for document {document.pk}"
            )
            return

        EmailService.send_document_notification(
            notification_type="recalled",
            document=document,
            recipients=recipients,
            actioning_user=recaller,
            additional_context={
                "email_subject": f"{_build_document_context(document)['document_type_title']} Recalled",
                "feedback_html": feedback_html,
                **_build_document_context(document),
            },
        )

    @staticmethod
    def notify_document_sent_back(document, sender, feedback_html=""):
        """
        Notify the correct next-step recipient when a document is sent back.

        Args:
            document: Document instance
            sender: User who sent back the document
            feedback_html: Optional rich text HTML feedback (rendered in email)
        """
        recipient = NotificationService._get_sent_back_recipient(document)
        if not recipient:
            settings.LOGGER.warning(
                f"No send-back recipient found for document {document.pk}"
            )
            return

        EmailService.send_document_notification(
            notification_type="sent_back",
            document=document,
            recipients=[recipient],
            actioning_user=sender,
            additional_context={
                "email_subject": f"{_build_document_context(document)['document_type_title']} Sent Back",
                "feedback_html": feedback_html,
                **_build_document_context(document),
            },
        )

    @staticmethod
    def notify_document_ready(document, submitter):
        """
        Notify when document is ready for review

        Args:
            document: Document instance
            submitter: User who submitted the document
        """
        recipients = NotificationService._get_approver_recipients(document)

        EmailService.send_document_notification(
            notification_type="ready",
            document=document,
            recipients=recipients,
            actioning_user=submitter,
            additional_context={
                "email_subject": f"{_build_document_context(document)['document_type_title']} Ready for Review",
                **_build_document_context(document),
            },
        )

    @staticmethod
    def notify_feedback_received(document, feedback_provider, feedback_text):
        """
        Notify when feedback is received on document

        Args:
            document: Document instance
            feedback_provider: User who provided feedback
            feedback_text: Feedback content
        """
        recipients = NotificationService._get_document_recipients(document)

        doc_ctx = _build_document_context(document)
        EmailService.send_document_notification(
            notification_type="feedback",
            document=document,
            recipients=recipients,
            actioning_user=feedback_provider,
            additional_context={
                "email_subject": f"Feedback on {doc_ctx['document_type_title']}",
                "feedback_text": feedback_text,
                **doc_ctx,
            },
        )

    @staticmethod
    def notify_review_request(document, requester):
        """
        Notify when document review is requested

        Args:
            document: Document instance
            requester: User requesting review
        """
        recipients = NotificationService._get_approver_recipients(document)

        doc_ctx = _build_document_context(document)
        EmailService.send_document_notification(
            notification_type="review",
            document=document,
            recipients=recipients,
            actioning_user=requester,
            additional_context={
                "email_subject": f"Review Requested: {doc_ctx['document_type_title']}",
                **doc_ctx,
            },
        )

    @staticmethod
    def send_bump_emails(
        documents_requiring_action,
        actioning_user,
        send_aggressive=False,
    ):
        """
        Send reminder emails for documents requiring action.

        When send_aggressive is False (default), documents are grouped by
        userToTakeAction and one consolidated email is sent per user listing
        all their pending documents. When send_aggressive is True, one email
        is sent per document (the original behaviour).

        Args:
            documents_requiring_action: List of dicts from the frontend, each containing
                userToTakeAction, documentKind, projectTitle, projectId, actionCapacity, etc.
            actioning_user: User who triggered the bump emails.
            send_aggressive: If True, send one email per document. If False (default),
                group documents by user and send one consolidated email per user.

        Returns:
            dict with emails_sent count and any errors.
        """
        actioning_user_name = get_user_display_name(actioning_user)
        actioning_user_email = actioning_user.email

        document_kind_dict = {
            "concept": "Concept Plan",
            "projectplan": "Project Plan",
            "progressreport": "Progress Report",
            "studentreport": "Student Report",
            "projectclosure": "Project Closure",
        }

        def determine_doc_kind_url_string(kind):
            url_mapping = {
                "concept": "concept",
                "projectplan": "project",
                "progressreport": "progress",
                "studentreport": "student",
                "projectclosure": "closure",
            }
            return url_mapping.get(kind, kind)

        emails_sent = 0
        errors = []

        if send_aggressive:
            # Per-document mode: one email per document (original behaviour)
            template_path = "./email_templates/bump_email.html"

            for doc_data in documents_requiring_action:
                try:
                    user_to_action = User.objects.get(
                        pk=doc_data.get("userToTakeAction")
                    )

                    if (
                        not user_to_action.is_active
                        or not user_to_action.email
                        or not user_to_action.is_staff
                    ):
                        errors.append(
                            f"User {get_user_display_name(user_to_action)} "
                            f"is inactive, external or has no email"
                        )
                        continue

                    document_kind_raw = doc_data.get("documentKind")
                    document_kind_title = document_kind_dict.get(
                        document_kind_raw, document_kind_raw
                    )
                    url_doc_kind = determine_doc_kind_url_string(document_kind_raw)

                    email_subject = f"SPMS: Action Required - {strip_tags(doc_data.get('projectTitle', ''))}"
                    to_email = [user_to_action.email]

                    # Build document URL with ?FY= for progress/student reports
                    doc_url = f"{settings.SITE_URL}/projects/{doc_data.get('projectId')}/{url_doc_kind}"
                    if document_kind_raw in ("progressreport", "studentreport"):
                        doc_id = doc_data.get("documentId")
                        if doc_id:
                            try:
                                doc_obj = ProjectDocument.objects.get(pk=doc_id)
                                if document_kind_raw == "progressreport":
                                    detail = doc_obj.progress_report_details.first()
                                else:
                                    detail = doc_obj.student_report_details.first()
                                if detail and detail.year:
                                    year = detail.year
                                    doc_url += f"?FY={year - 1}-{str(year)[2:]}"
                            except ProjectDocument.DoesNotExist:
                                pass

                    template_props = {
                        "email_subject": email_subject,
                        "actioning_user_email": actioning_user_email,
                        "actioning_user_name": actioning_user_name,
                        "recipient_name": get_user_display_name(user_to_action),
                        "recipient_email": user_to_action.email,
                        "project_title": strip_tags(doc_data.get("projectTitle", "")),
                        "project_id": doc_data.get("projectId"),
                        "document_kind": document_kind_title,
                        "document_kind_raw": document_kind_raw,
                        "action_capacity": doc_data.get("actionCapacity"),
                        "site_url": settings.SITE_URL,
                        "document_url": doc_url,
                    }

                    template_content = render_to_string(template_path, template_props)

                    try:
                        send_email_with_embedded_image(
                            recipient_email=to_email,
                            subject=email_subject,
                            html_content=template_content,
                        )
                        emails_sent += 1
                    except Exception as email_error:
                        settings.LOGGER.error(f"Email Error: {email_error}")
                        errors.append(f"Failed to send email to {user_to_action.email}")

                except User.DoesNotExist:
                    errors.append(
                        f"User with ID {doc_data.get('userToTakeAction')} not found"
                    )
                except Project.DoesNotExist:
                    errors.append(
                        f"Project with ID {doc_data.get('projectId')} not found"
                    )
                except Exception as e:
                    settings.LOGGER.error(
                        f"Unexpected error processing document {doc_data.get('documentId')}: {str(e)}"
                    )
                    errors.append(
                        f"Error processing document {doc_data.get('documentId')}"
                    )
        else:
            # Grouped mode: one consolidated email per user
            grouped = {}
            for doc_data in documents_requiring_action:
                user_pk = doc_data.get("userToTakeAction")
                if user_pk not in grouped:
                    grouped[user_pk] = {
                        "as_project_lead": [],
                        "as_ba_lead": [],
                    }

                document_kind_raw = doc_data.get("documentKind")
                document_kind_title = document_kind_dict.get(
                    document_kind_raw, document_kind_raw
                )
                url_doc_kind = determine_doc_kind_url_string(document_kind_raw)

                doc_info = {
                    "project_title": strip_tags(doc_data.get("projectTitle", "")),
                    "project_id": doc_data.get("projectId"),
                    "document_kind": document_kind_title,
                    "document_url": f"{settings.SITE_URL}/projects/{doc_data.get('projectId')}/{url_doc_kind}",
                }

                # Add ?FY= for progress/student reports in consolidated emails
                if document_kind_raw in ("progressreport", "studentreport"):
                    doc_id = doc_data.get("documentId")
                    if doc_id:
                        try:
                            doc_obj = ProjectDocument.objects.get(pk=doc_id)
                            if document_kind_raw == "progressreport":
                                detail = doc_obj.progress_report_details.first()
                            else:
                                detail = doc_obj.student_report_details.first()
                            if detail and detail.year:
                                year = detail.year
                                doc_info[
                                    "document_url"
                                ] += f"?FY={year - 1}-{str(year)[2:]}"
                        except ProjectDocument.DoesNotExist:
                            pass

                action_capacity = doc_data.get("actionCapacity", "")
                if "business area" in action_capacity.lower():
                    grouped[user_pk]["as_ba_lead"].append(doc_info)
                else:
                    grouped[user_pk]["as_project_lead"].append(doc_info)

            for user_pk, docs_by_role in grouped.items():
                try:
                    user = User.objects.get(pk=user_pk)

                    if not user.is_active or not user.email or not user.is_staff:
                        errors.append(
                            f"User {get_user_display_name(user)} "
                            f"is inactive, external or has no email"
                        )
                        continue

                    recipient_name = get_user_display_name(user)
                    total_docs = len(docs_by_role["as_project_lead"]) + len(
                        docs_by_role["as_ba_lead"]
                    )

                    # Single document: use the standard bump template
                    if total_docs == 1:
                        doc = (
                            docs_by_role["as_project_lead"]
                            or docs_by_role["as_ba_lead"]
                        )[0]
                        capacity = (
                            "Project Lead"
                            if docs_by_role["as_project_lead"]
                            else "Business Area Lead"
                        )
                        email_subject = (
                            f"SPMS: Action Required - {doc['project_title']}"
                        )
                        template_props = {
                            "email_subject": email_subject,
                            "actioning_user_email": actioning_user_email,
                            "actioning_user_name": actioning_user_name,
                            "recipient_name": recipient_name,
                            "recipient_email": user.email,
                            "project_title": doc["project_title"],
                            "project_id": doc["project_id"],
                            "document_kind": doc["document_kind"],
                            "action_capacity": capacity,
                            "site_url": settings.SITE_URL,
                            "document_url": doc["document_url"],
                        }
                        template_content = render_to_string(
                            "./email_templates/bump_email.html", template_props
                        )
                    else:
                        # Multiple documents: use consolidated template
                        email_subject = (
                            f"SPMS: {total_docs} Documents Require Your Action"
                        )
                        template_props = {
                            "recipient_name": recipient_name,
                            "actioning_user_name": actioning_user_name,
                            "actioning_user_email": actioning_user_email,
                            "as_project_lead": docs_by_role["as_project_lead"],
                            "as_ba_lead": docs_by_role["as_ba_lead"],
                            "total_documents": total_docs,
                            "site_url": settings.SITE_URL,
                        }
                        template_content = render_to_string(
                            "./email_templates/bump_consolidated_email.html",
                            template_props,
                        )

                    try:
                        send_email_with_embedded_image(
                            recipient_email=[user.email],
                            subject=email_subject,
                            html_content=template_content,
                        )
                        emails_sent += 1
                    except Exception as email_error:
                        settings.LOGGER.error(f"Email Error: {email_error}")
                        errors.append(f"Failed to send email to {user.email}")

                except User.DoesNotExist:
                    errors.append(f"User with ID {user_pk} not found")
                except Exception as e:
                    settings.LOGGER.error(
                        f"Unexpected error processing grouped bump for user {user_pk}: {str(e)}"
                    )
                    errors.append(f"Error processing bump for user {user_pk}")

        return {"emails_sent": emails_sent, "errors": errors}

    @staticmethod
    def notify_comment_mention(
        document_id,
        project_id,
        commenter_data,
        mentioned_users,
        comment_content,
    ):
        """
        Send email notifications to mentioned users in document comments.

        Args:
            document_id: PK of the ProjectDocument.
            project_id: PK of the Project.
            commenter_data: Dict with commenter info (name, etc.).
            mentioned_users: List of dicts with id, name, email.
            comment_content: Raw HTML comment content.

        Returns:
            dict with message, recipients count, mentioned_users count.
        """
        # Fetch document and project
        document = ProjectDocument.objects.get(pk=document_id)
        project = Project.objects.get(pk=project_id)
        project_tag = project.get_project_tag()

        # Generate document URL
        url_safe_kind_dict = {
            "concept": "concept",
            "projectplan": "project",
            "progressreport": "progress",
            "studentreport": "student",
            "projectclosure": "closure",
        }
        document_url = f"{settings.SITE_URL}/projects/{project.pk}/{url_safe_kind_dict[document.kind]}"

        # Add ?FY= param for progress/student reports
        if document.kind == "progressreport":
            report_detail = document.progress_report_details.first()
            if report_detail and report_detail.year:
                year = report_detail.year
                document_url += f"?FY={year - 1}-{str(year)[2:]}"
        elif document.kind == "studentreport":
            report_detail = document.student_report_details.first()
            if report_detail and report_detail.year:
                year = report_detail.year
                document_url += f"?FY={year - 1}-{str(year)[2:]}"

        # Clean comment content
        def clean_comment_content(html_content):
            from bs4 import BeautifulSoup

            if not html_content:
                return ""

            try:
                soup = BeautifulSoup(html_content, "html.parser")
                mention_spans = soup.find_all("span", {"data-lexical-mention": "true"})
                for span in mention_spans:
                    span.replace_with(span.get_text())
                return soup.get_text().strip()
            except Exception as e:
                settings.LOGGER.error(f"Error cleaning comment content: {e}")
                return html_content

        cleaned_comment = clean_comment_content(comment_content)

        if not mentioned_users:
            return {
                "message": "No mentioned users found - no emails sent",
                "recipients": 0,
                "mentioned_users": 0,
            }

        # Process mentioned users
        recipients_to_notify = []
        for user_data in mentioned_users:
            user_id = user_data.get("id")
            user_name = user_data.get("name")
            user_email = user_data.get("email")

            if user_email and user_email.endswith("@dbca.wa.gov.au"):
                try:
                    user = User.objects.get(pk=user_id)
                    if user.is_active and user.is_staff:
                        recipients_to_notify.append(
                            {"id": user_id, "name": user_name, "email": user_email}
                        )
                except User.DoesNotExist:
                    settings.LOGGER.warning(f"Mentioned user {user_id} not found")
                    continue

        # Send emails to all valid mentioned users
        processed_users = set()
        emails_sent = 0

        for recipient in recipients_to_notify:
            user_id = recipient.get("id")
            user_name = recipient.get("name")
            user_email = recipient.get("email")

            if user_id in processed_users:
                continue

            processed_users.add(user_id)

            to_email = [user_email]
            document_kind_string_readable = ProjectDocument.CategoryKindChoices(
                document.kind
            ).label

            email_subject = f"SPMS: You were mentioned in a comment on {document_kind_string_readable} ({project_tag})"

            template_props = {
                "recipient_name": user_name,
                "commenter_name": commenter_data.get("name"),
                "document_type_title": document_kind_string_readable,
                "project_tag": project_tag,
                "project_name": strip_tags(project.title),
                "document_url": document_url,
                "comment_content": cleaned_comment,
                "is_mention": True,
                "site_url": settings.SITE_URL,
            }

            try:
                template_content = render_to_string(
                    "./email_templates/document_comment_mention.html",
                    template_props,
                )
                send_email_with_embedded_image(
                    recipient_email=to_email,
                    subject=email_subject,
                    html_content=template_content,
                )
                emails_sent += 1
                settings.LOGGER.info(f"Sent mention notification to {user_name}")
            except Exception as e:
                settings.LOGGER.error(f"Comment Notification Email Error: {e}")

        return {
            "message": f"Mention notifications sent to {emails_sent} users",
            "recipients": len(recipients_to_notify),
            "mentioned_users": len(mentioned_users),
        }

    @staticmethod
    def notify_new_comment(document, comment, commenter):
        """
        DEPRECATED: No longer called from handle_comment_created signal.
        Blanket team notifications for new comments have been removed — only
        @mentioned users now receive comment emails via notify_comment_mention().
        Kept for reference and potential future use.

        Notify project team about a new comment, excluding the commenter
        and any users who were @mentioned (they receive mention notifications).

        Args:
            document: ProjectDocument instance
            comment: Comment instance
            commenter: User who posted the comment
        """
        project = document.project
        project_tag = project.get_project_tag()

        # Build recipient list from project team
        recipients = NotificationService._get_project_team_recipients(project)

        # Exclude the commenter
        recipients = [r for r in recipients if r["email"] != commenter.email]

        # Exclude already-mentioned users (they get separate mention notifications)
        mentioned_emails = set(
            comment.mentions.values_list("mentioned_user__email", flat=True)
        )
        recipients = [r for r in recipients if r["email"] not in mentioned_emails]

        if not recipients:
            settings.LOGGER.info(
                f"No team recipients for new comment notification on document {document.pk}"
            )
            return

        # Clean comment content for the email
        def clean_comment_content(html_content):
            from bs4 import BeautifulSoup

            if not html_content:
                return ""
            try:
                soup = BeautifulSoup(html_content, "html.parser")
                mention_spans = soup.find_all("span", {"data-lexical-mention": "true"})
                for span in mention_spans:
                    span.replace_with(span.get_text())
                return soup.get_text().strip()
            except Exception as e:
                settings.LOGGER.error(f"Error cleaning comment content: {e}")
                return html_content

        cleaned_comment = clean_comment_content(comment.text)

        # Build document URL
        url_safe_kind_dict = {
            "concept": "concept",
            "projectplan": "project",
            "progressreport": "progress",
            "studentreport": "student",
            "projectclosure": "closure",
        }
        document_url = f"{settings.SITE_URL}/projects/{project.pk}/{url_safe_kind_dict.get(document.kind, document.kind)}"

        # Add ?FY= param for progress/student reports
        if document.kind == "progressreport":
            report_detail = document.progress_report_details.first()
            if report_detail and report_detail.year:
                year = report_detail.year
                document_url += f"?FY={year - 1}-{str(year)[2:]}"
        elif document.kind == "studentreport":
            report_detail = document.student_report_details.first()
            if report_detail and report_detail.year:
                year = report_detail.year
                document_url += f"?FY={year - 1}-{str(year)[2:]}"

        commenter_name = get_user_display_name(commenter)
        document_kind_readable = ProjectDocument.CategoryKindChoices(
            document.kind
        ).label

        for recipient in recipients:
            email_subject = (
                f"SPMS: New comment on {document_kind_readable} ({project_tag})"
            )

            template_props = {
                "recipient_name": recipient["name"],
                "commenter_name": commenter_name,
                "document_type_title": document_kind_readable,
                "project_tag": project_tag,
                "project_name": strip_tags(project.title),
                "document_url": document_url,
                "comment_content": cleaned_comment,
                "site_url": settings.SITE_URL,
            }

            try:
                template_content = render_to_string(
                    "./email_templates/new_comment_email.html",
                    template_props,
                )
                send_email_with_embedded_image(
                    recipient_email=[recipient["email"]],
                    subject=email_subject,
                    html_content=template_content,
                )
                settings.LOGGER.info(
                    f"Sent new comment notification to {recipient['name']}"
                )
            except Exception as e:
                settings.LOGGER.error(
                    f"Failed to send new comment notification to {recipient['name']}: {e}"
                )

    @staticmethod
    def notify_new_cycle_open(
        last_report,
        actioning_user,
        division_slug=None,
        recipient_groups=None,
        excluded_user_ids=None,
        recipient_user_pks=None,
        custom_message=None,
        custom_messages=None,
    ):
        """
        Send new cycle opened announcement emails.

        Recipients are deduplicated by highest role (BA Lead > Project Lead > Team Member).
        Only active staff with @dbca.wa.gov.au emails are included.

        Args:
            last_report: AnnualReport instance for the cycle.
            actioning_user: User who opened the cycle.
            division_slug: Optional division slug to scope recipients.
            recipient_groups: List of groups to include, e.g. ["ba_leads", "project_leads", "team_members"].
                If None, defaults to ["ba_leads", "project_leads"].
            excluded_user_ids: List of user PKs to exclude from emails.
            recipient_user_pks: Optional explicit list of user PKs to send to (takes precedence).
            custom_message: Single HTML string to replace default email text for all groups.
            custom_messages: Dict with keys 'ba_leads', 'project_leads', 'team_members',
                each containing an HTML string. Takes precedence over custom_message.
        """
        from agencies.models import BusinessArea
        from projects.models import ProjectMember

        if recipient_groups is None:
            recipient_groups = ["ba_leads", "project_leads"]

        settings.LOGGER.info("Sending cycle opened emails")
        template_path = "./email_templates/new_cycle_open_email.html"

        actioning_user_name = get_user_display_name(actioning_user)
        actioning_user_email = actioning_user.email

        financial_year_string = f"{int(last_report.year - 1)}-{int(last_report.year)}"

        def _is_valid_recipient(user):
            return (
                user
                and user.is_active
                and user.is_staff
                and user.email
                and user.email.endswith("@dbca.wa.gov.au")
            )

        # Collect users with role priorities for deduplication
        # Priority: BA Lead (3) > Project Lead (2) > Team Member (1)
        user_roles = {}  # pk → (priority, name, email)

        # Exclude terminated and completed projects — only open/active projects
        # should have their leads and members notified about new cycles.
        # Also exclude projects belonging to inactive business areas.
        all_projects = Project.objects.exclude(
            status__in=[
                Project.StatusChoices.COMPLETED,
                Project.StatusChoices.TERMINATED,
            ]
        ).filter(business_area__is_active=True)
        if division_slug and last_report.division:
            all_projects = all_projects.filter(
                business_area__division=last_report.division
            )

        if "ba_leads" in recipient_groups:
            bas = BusinessArea.objects.select_related("leader").filter(is_active=True)
            if division_slug and last_report.division:
                bas = bas.filter(division=last_report.division)
            for ba in bas:
                if _is_valid_recipient(ba.leader):
                    pk = ba.leader.pk
                    if pk not in user_roles or user_roles[pk][0] < 3:
                        user_roles[pk] = (
                            3,
                            get_user_display_name(ba.leader),
                            ba.leader.email,
                        )

        if "project_leads" in recipient_groups:
            leaders = ProjectMember.objects.filter(
                project__in=all_projects,
                is_leader=True,
            ).select_related("user")
            for member in leaders:
                if _is_valid_recipient(member.user):
                    pk = member.user.pk
                    if pk not in user_roles or user_roles[pk][0] < 2:
                        user_roles[pk] = (
                            2,
                            get_user_display_name(member.user),
                            member.user.email,
                        )

        if "team_members" in recipient_groups:
            members = ProjectMember.objects.filter(
                project__in=all_projects,
                is_leader=False,
            ).select_related("user")
            for member in members:
                if _is_valid_recipient(member.user):
                    pk = member.user.pk
                    if pk not in user_roles:
                        user_roles[pk] = (
                            1,
                            get_user_display_name(member.user),
                            member.user.email,
                        )

        # Filter to explicit recipient list if provided (takes precedence)
        if recipient_user_pks is not None:
            allowed = set(recipient_user_pks)
            user_roles = {pk: v for pk, v in user_roles.items() if pk in allowed}
        elif excluded_user_ids:
            # Fallback: remove excluded users (legacy behaviour)
            for pk in excluded_user_ids:
                user_roles.pop(pk, None)

        # Sanitise custom message(s) if provided
        sanitised_message = None
        sanitised_messages = None

        if custom_messages and isinstance(custom_messages, dict):
            import bleach

            allowed_tags = [
                "p",
                "br",
                "strong",
                "em",
                "u",
                "s",
                "a",
                "ul",
                "ol",
                "li",
                "h1",
                "h2",
                "h3",
                "h4",
                "h5",
                "h6",
                "blockquote",
                "span",
            ]
            allowed_attrs = {"a": ["href", "target"], "span": ["style"]}
            sanitised_messages = {}
            for key in ("ba_leads", "project_leads", "team_members"):
                raw = custom_messages.get(key, "")
                if raw:
                    sanitised_messages[key] = bleach.clean(
                        raw, tags=allowed_tags, attributes=allowed_attrs, strip=True
                    )
        elif custom_message:
            import bleach

            allowed_tags = [
                "p",
                "br",
                "strong",
                "em",
                "u",
                "s",
                "a",
                "ul",
                "ol",
                "li",
                "h1",
                "h2",
                "h3",
                "h4",
                "h5",
                "h6",
                "blockquote",
                "span",
            ]
            allowed_attrs = {"a": ["href", "target"], "span": ["style"]}
            sanitised_message = bleach.clean(
                custom_message, tags=allowed_tags, attributes=allowed_attrs, strip=True
            )

        # Map role priority to group key for per-group message lookup
        priority_to_group = {3: "ba_leads", 2: "project_leads", 1: "team_members"}

        # Send deduplicated emails
        emails_sent = 0
        for pk, (priority, name, email) in user_roles.items():
            email_subject = "SPMS: New Reporting Cycle Open"
            to_email = [email]

            # Determine the custom message for this recipient
            recipient_custom_message = None
            if sanitised_messages:
                group_key = priority_to_group.get(priority, "team_members")
                recipient_custom_message = sanitised_messages.get(group_key)
            elif sanitised_message:
                recipient_custom_message = sanitised_message

            template_props = {
                "email_subject": email_subject,
                "actioning_user_email": actioning_user_email,
                "actioning_user_name": actioning_user_name,
                "financial_year_string": financial_year_string,
                "recipient_name": name,
                "site_url": settings.SITE_URL,
                "custom_message": recipient_custom_message,
                "division_name": (
                    last_report.division.name
                    if hasattr(last_report, "division") and last_report.division
                    else None
                ),
            }

            template_content = render_to_string(template_path, template_props)

            try:
                send_email_with_embedded_image(
                    recipient_email=to_email,
                    subject=email_subject,
                    html_content=template_content,
                )
                emails_sent += 1
            except Exception as e:
                settings.LOGGER.error(f"Failed to send new cycle email to {email}: {e}")

        # Record this correspondence (best-effort; never blocks the send).
        # Only the admin-authored custom message is stored — the fixed cycle
        # template text is not, since that portion is not editable/reusable.
        from adminoptions.models import EmailRecord
        from adminoptions.services.email_record_service import EmailRecordService

        recipients_payload = [
            {
                "pk": pk,
                "name": name,
                "email": email,
                "group": priority_to_group.get(priority, "team_members"),
            }
            for pk, (priority, name, email) in user_roles.items()
        ]
        EmailRecordService.record(
            kind=EmailRecord.EmailKind.NEW_CYCLE,
            subject="SPMS: New Reporting Cycle Open",
            initiator=actioning_user,
            recipient_groups=recipient_groups,
            recipients=recipients_payload,
            emails_sent=emails_sent,
            body=sanitised_message or "",
            group_messages=sanitised_messages or {},
            is_test=EmailRecordService.is_email_testing_active(),
        )

        return {"emails_sent": emails_sent}

    # Tags/attributes permitted in announcement email bodies. Shared by the
    # normal send path and the test-send path so both sanitise identically.
    _ANNOUNCEMENT_ALLOWED_TAGS = [
        "p",
        "br",
        "strong",
        "em",
        "u",
        "s",
        "a",
        "ul",
        "ol",
        "li",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "blockquote",
        "span",
    ]
    _ANNOUNCEMENT_ALLOWED_ATTRS = {"a": ["href", "target"], "span": ["style"]}

    @staticmethod
    def _sanitise_announcement_body(custom_message="", custom_messages=None):
        """
        Sanitise announcement message HTML.

        Returns a (sanitised_message, sanitised_messages) tuple where exactly
        one is populated: per-group messages take precedence over the single
        message, mirroring the resolution used elsewhere in the announcement
        flow.
        """
        import bleach

        allowed_tags = NotificationService._ANNOUNCEMENT_ALLOWED_TAGS
        allowed_attrs = NotificationService._ANNOUNCEMENT_ALLOWED_ATTRS

        sanitised_message = None
        sanitised_messages = None

        if custom_messages and isinstance(custom_messages, dict):
            sanitised_messages = {}
            for key in ("ba_leads", "project_leads", "team_members"):
                raw = custom_messages.get(key, "")
                if raw:
                    sanitised_messages[key] = bleach.clean(
                        raw, tags=allowed_tags, attributes=allowed_attrs, strip=True
                    )
        elif custom_message:
            sanitised_message = bleach.clean(
                custom_message, tags=allowed_tags, attributes=allowed_attrs, strip=True
            )

        return sanitised_message, sanitised_messages

    @staticmethod
    def _send_announcement_test_email(
        actioning_user,
        recipient_groups,
        test_recipient_pk,
        custom_message="",
        custom_messages=None,
        subject="SPMS: Announcement",
    ):
        """
        Send a single announcement test email to one user.

        Bypasses all recipient-group resolution: exactly one email is sent to
        the user identified by test_recipient_pk. The subject is prefixed with
        "[TEST]" and the correspondence is recorded as a test send so it is
        clearly distinguished from real announcements in the email history.

        When a per-group message is configured, the message for the first
        selected group is used for the preview body (the test recipient only
        receives one email, so a single body is chosen).
        """
        from adminoptions.models import EmailRecord
        from adminoptions.services.email_record_service import EmailRecordService

        settings.LOGGER.info("Sending announcement test email")
        template_path = "./email_templates/announcement_email.html"

        test_user = User.objects.filter(pk=test_recipient_pk).first()
        if not test_user or not test_user.email:
            settings.LOGGER.error(
                f"Announcement test email: user {test_recipient_pk} not found "
                "or has no email"
            )
            return {"emails_sent": 0, "errors": ["Test recipient not found."]}

        sanitised_message, sanitised_messages = (
            NotificationService._sanitise_announcement_body(
                custom_message=custom_message, custom_messages=custom_messages
            )
        )

        # Choose a single body for the one test email. Prefer the per-group
        # message of the first selected group, else the single message.
        recipient_custom_message = sanitised_message
        if sanitised_messages:
            for key in ("ba_leads", "project_leads", "team_members"):
                if key in recipient_groups and sanitised_messages.get(key):
                    recipient_custom_message = sanitised_messages[key]
                    break
            if recipient_custom_message is None:
                # Fall back to any available per-group message.
                recipient_custom_message = next(
                    (v for v in sanitised_messages.values() if v), None
                )

        # Prefix with [TEST], but only once — the composer subject may already
        # carry a [TEST] prefix (e.g. reused from a prior test via "Use as
        # template"), which would otherwise produce "[TEST] [TEST] ...".
        test_subject = subject if subject.startswith("[TEST]") else f"[TEST] {subject}"

        template_props = {
            "subject": test_subject,
            "actioning_user_email": actioning_user.email,
            "actioning_user_name": get_user_display_name(actioning_user),
            "recipient_name": get_user_display_name(test_user),
            "site_url": settings.SITE_URL,
            "custom_message": recipient_custom_message,
        }

        emails_sent = 0
        errors = []
        try:
            template_content = render_to_string(template_path, template_props)
            send_email_with_embedded_image(
                recipient_email=[test_user.email],
                subject=test_subject,
                html_content=template_content,
            )
            emails_sent = 1
        except Exception as e:
            settings.LOGGER.error(
                f"Failed to send announcement test email to {test_user.email}: {e}"
            )
            errors.append(f"Failed to send to {test_user.email}")

        settings.LOGGER.info(f"Announcement test email sent: {emails_sent}/1")

        # Record as a test send so it is distinguishable in the history.
        EmailRecordService.record(
            kind=EmailRecord.EmailKind.ANNOUNCEMENT,
            subject=test_subject,
            initiator=actioning_user,
            recipient_groups=recipient_groups,
            recipients=[
                {
                    "pk": test_user.pk,
                    "name": get_user_display_name(test_user),
                    "email": test_user.email,
                    "group": "test",
                }
            ],
            emails_sent=emails_sent,
            body=sanitised_message or "",
            group_messages=sanitised_messages or {},
            is_test=True,
        )

        return {"emails_sent": emails_sent, "errors": errors}

    @staticmethod
    def send_announcement_emails(
        actioning_user,
        recipient_groups,
        excluded_user_ids=None,
        recipient_user_pks=None,
        custom_message="",
        custom_messages=None,
        subject="SPMS: Announcement",
        division_slug=None,
        test_recipient_pk=None,
    ):
        """
        Send announcement emails to selected recipient groups.
        Reuses the same recipient resolution logic as send_cycle_opened_emails
        (deduplication by highest role, active staff with @dbca.wa.gov.au emails).

        Args:
            actioning_user: User who is sending the announcement.
            recipient_groups: List of groups, e.g. ["ba_leads", "project_leads", "team_members"].
            excluded_user_ids: Optional list of user PKs to exclude.
            recipient_user_pks: Optional explicit list of user PKs to send to.
                If provided, takes precedence — only these users receive the email
                (still filtered by recipient_groups for role assignment).
            custom_message: HTML string for the email body (single message for all).
            custom_messages: Dict with per-group messages (takes precedence over custom_message).
            subject: Email subject line.
            division_slug: Optional division slug to scope recipients.
            test_recipient_pk: Optional user PK. When provided, a single test email
                is sent to that one user only, bypassing all group resolution. The
                subject is prefixed with "[TEST]" and the send is recorded as a test.
                Used by the "Send test to me" flow so an admin can verify an
                announcement without emailing real recipients.
        """
        # Test-send short-circuit: deliver exactly one email to the chosen user,
        # ignoring the selected recipient groups entirely.
        if test_recipient_pk is not None:
            return NotificationService._send_announcement_test_email(
                actioning_user=actioning_user,
                recipient_groups=recipient_groups,
                test_recipient_pk=test_recipient_pk,
                custom_message=custom_message,
                custom_messages=custom_messages,
                subject=subject,
            )

        from agencies.models import BusinessArea, Division
        from projects.models import ProjectMember

        settings.LOGGER.info("Sending announcement emails")
        template_path = "./email_templates/announcement_email.html"

        actioning_user_name = get_user_display_name(actioning_user)
        actioning_user_email = actioning_user.email

        def _is_valid_recipient(user):
            return (
                user
                and user.is_active
                and user.is_staff
                and user.email
                and user.email.endswith("@dbca.wa.gov.au")
            )

        # Collect users with role priorities for deduplication
        # Priority: BA Lead (3) > Project Lead (2) > Team Member (1)
        user_roles = {}

        # Resolve division if provided
        division = None
        if division_slug:
            try:
                division = Division.objects.get(slug=division_slug)
            except Division.DoesNotExist:
                pass

        all_projects = Project.objects.exclude(
            status__in=[
                Project.StatusChoices.COMPLETED,
                Project.StatusChoices.TERMINATED,
            ]
        ).filter(business_area__is_active=True)
        if division:
            all_projects = all_projects.filter(business_area__division=division)

        if "ba_leads" in recipient_groups:
            bas = BusinessArea.objects.select_related("leader").filter(is_active=True)
            if division:
                bas = bas.filter(division=division)
            for ba in bas:
                if _is_valid_recipient(ba.leader):
                    pk = ba.leader.pk
                    if pk not in user_roles or user_roles[pk][0] < 3:
                        user_roles[pk] = (
                            3,
                            get_user_display_name(ba.leader),
                            ba.leader.email,
                        )

        if "project_leads" in recipient_groups:
            leaders = ProjectMember.objects.filter(
                project__in=all_projects,
                is_leader=True,
            ).select_related("user")
            for member in leaders:
                if _is_valid_recipient(member.user):
                    pk = member.user.pk
                    if pk not in user_roles or user_roles[pk][0] < 2:
                        user_roles[pk] = (
                            2,
                            get_user_display_name(member.user),
                            member.user.email,
                        )

        if "team_members" in recipient_groups:
            members = ProjectMember.objects.filter(
                project__in=all_projects,
                is_leader=False,
            ).select_related("user")
            for member in members:
                if _is_valid_recipient(member.user):
                    pk = member.user.pk
                    if pk not in user_roles:
                        user_roles[pk] = (
                            1,
                            get_user_display_name(member.user),
                            member.user.email,
                        )

        # Filter to explicit recipient list if provided (takes precedence)
        # This ensures the backend sends to exactly who the frontend showed.
        if recipient_user_pks:
            allowed = set(recipient_user_pks)
            user_roles = {pk: v for pk, v in user_roles.items() if pk in allowed}
        elif excluded_user_ids:
            # Fallback: remove excluded users (legacy behaviour)
            for pk in excluded_user_ids:
                user_roles.pop(pk, None)

        # Sanitise custom message(s)
        sanitised_message, sanitised_messages = (
            NotificationService._sanitise_announcement_body(
                custom_message=custom_message, custom_messages=custom_messages
            )
        )

        # Map role priority to group key for per-group message lookup
        priority_to_group = {3: "ba_leads", 2: "project_leads", 1: "team_members"}

        emails_sent = 0
        errors = []

        for pk, (priority, name, email) in user_roles.items():
            # Determine the custom message for this recipient
            recipient_custom_message = None
            if sanitised_messages:
                group_key = priority_to_group.get(priority, "team_members")
                recipient_custom_message = sanitised_messages.get(group_key)
            elif sanitised_message:
                recipient_custom_message = sanitised_message

            template_props = {
                "subject": subject,
                "actioning_user_email": actioning_user_email,
                "actioning_user_name": actioning_user_name,
                "recipient_name": name,
                "site_url": settings.SITE_URL,
                "custom_message": recipient_custom_message,
            }

            try:
                template_content = render_to_string(template_path, template_props)
                send_email_with_embedded_image(
                    recipient_email=[email],
                    subject=subject,
                    html_content=template_content,
                )
                emails_sent += 1
            except Exception as e:
                settings.LOGGER.error(f"Failed to send announcement to {email}: {e}")
                errors.append(f"Failed to send to {email}")

        settings.LOGGER.info(
            f"Announcement emails sent: {emails_sent}/{len(user_roles)}"
        )

        # Record this correspondence (best-effort; never blocks the send).
        from adminoptions.models import EmailRecord
        from adminoptions.services.email_record_service import EmailRecordService

        recipients_payload = [
            {
                "pk": pk,
                "name": name,
                "email": email,
                "group": priority_to_group.get(priority, "team_members"),
            }
            for pk, (priority, name, email) in user_roles.items()
        ]
        EmailRecordService.record(
            kind=EmailRecord.EmailKind.ANNOUNCEMENT,
            subject=subject,
            initiator=actioning_user,
            recipient_groups=recipient_groups,
            recipients=recipients_payload,
            emails_sent=emails_sent,
            body=sanitised_message or "",
            group_messages=sanitised_messages or {},
            is_test=EmailRecordService.is_email_testing_active(),
        )

        return {"emails_sent": emails_sent, "errors": errors}

    @staticmethod
    def notify_project_closed(project, closer):
        """
        Notify when project is closed

        Args:
            project: Project instance
            closer: User who closed the project
        """
        recipients = NotificationService._get_project_team_recipients(project)

        EmailService.send_document_notification(
            notification_type="project_closed",
            document=None,
            recipients=recipients,
            actioning_user=closer,
            additional_context={
                "email_subject": f"Project Closed: {strip_tags(project.title)}",
                "project": project,
                "plain_project_title": strip_tags(project.title),
                "project_url": _build_project_url(project),
                "site_url": settings.SITE_URL,
            },
        )

    @staticmethod
    def notify_project_reopened(project, reopener, reason_html=""):
        """
        Notify when project is reopened

        Args:
            project: Project instance
            reopener: User who reopened the project
            reason_html: Optional rich text HTML reason for reopening
        """
        recipients = NotificationService._get_project_team_recipients(project)

        EmailService.send_document_notification(
            notification_type="project_reopened",
            document=None,
            recipients=recipients,
            actioning_user=reopener,
            additional_context={
                "email_subject": f"Project Reopened: {strip_tags(project.title)}",
                "project": project,
                "plain_project_title": strip_tags(project.title),
                "project_url": _build_project_url(project),
                "site_url": settings.SITE_URL,
                "feedback_html": reason_html,
            },
        )

    @staticmethod
    def send_spms_invite(user, inviter, invite_link):
        """
        Send SPMS invite email

        Args:
            user: User being invited
            inviter: User sending the invite
            invite_link: Link to SPMS
        """
        recipients = [
            {
                "name": user.get_full_name(),
                "email": user.email,
                "kind": "Invited User",
            }
        ]

        EmailService.send_document_notification(
            notification_type="spms_invite",
            document=None,
            recipients=recipients,
            actioning_user=inviter,
            additional_context={
                "email_subject": "You have been invited to SPMS",
                "invite_link": invite_link,
            },
        )

    @staticmethod
    def _get_stage_approval_recipients(document, stage):
        """
        Get the correct recipient(s) for an approval notification based on stage.

        - Stage 1 (PL approved) → BA lead should review next
        - Stage 2 (BA lead approved) → key stakeholder / approvers / director
        - Stage 3 (directorate approved) → project lead (final approval notification)

        Returns:
            List of dicts with 'name', 'email', 'kind'
        """
        recipients = []
        seen_pks = set()

        if stage == 1:
            # PL approved → notify BA lead
            ba = document.project.business_area
            if ba and ba.leader and ba.leader.is_active:
                recipients.append(
                    {
                        "name": ba.leader.get_full_name(),
                        "email": ba.leader.email,
                        "kind": "Business Area Leader",
                    }
                )

        elif stage == 2:
            # BA lead approved → notify directorate (key stakeholder, approvers, or director)
            ba = document.project.business_area
            if ba and ba.division:
                division = ba.division
                # Key stakeholder first
                if (
                    hasattr(division, "key_stakeholder")
                    and division.key_stakeholder
                    and division.key_stakeholder.is_active
                ):
                    ks = division.key_stakeholder
                    recipients.append(
                        {
                            "name": ks.get_full_name(),
                            "email": ks.email,
                            "kind": "Key Stakeholder",
                        }
                    )
                    seen_pks.add(ks.pk)
                # Approvers
                if hasattr(division, "approvers"):
                    for approver in division.approvers.all():
                        if approver.is_active and approver.pk not in seen_pks:
                            recipients.append(
                                {
                                    "name": approver.get_full_name(),
                                    "email": approver.email,
                                    "kind": "Approver",
                                }
                            )
                            seen_pks.add(approver.pk)
                # Fallback to directorate BA lead (director) if no stakeholder/approvers
                if not recipients and division.director and division.director.is_active:
                    recipients.append(
                        {
                            "name": division.director.get_full_name(),
                            "email": division.director.email,
                            "kind": "Director",
                        }
                    )

        elif stage == 3:
            # Directorate approved → notify project lead (final approval)
            for member in document.project.members.filter(is_leader=True):
                if member.user.is_active:
                    recipients.append(
                        {
                            "name": member.user.get_full_name(),
                            "email": member.user.email,
                            "kind": "Project Lead",
                        }
                    )

        return recipients

    @staticmethod
    def _get_sent_back_recipient(document):
        """
        Returns the single recipient for a send-back email based on current approval stage.

        - Stage 3 pending (BA approved, directorate not): BA lead gets email
        - Stage 2 pending (PL approved, BA not): Project lead gets email
        """
        if (
            document.business_area_lead_approval_granted
            and not document.directorate_approval_granted
        ):
            # Directorate sending back → BA lead
            ba = document.project.business_area
            if ba and ba.leader and ba.leader.is_active:
                return {
                    "name": ba.leader.get_full_name(),
                    "email": ba.leader.email,
                    "kind": "Business Area Leader",
                }
        elif (
            document.project_lead_approval_granted
            and not document.business_area_lead_approval_granted
        ):
            # BA lead sending back → project lead
            for member in document.project.members.filter(is_leader=True):
                if member.user.is_active:
                    return {
                        "name": member.user.get_full_name(),
                        "email": member.user.email,
                        "kind": "Project Lead",
                    }
        return None

    @staticmethod
    def _get_recall_recipients(document, recaller):
        """
        Returns deduplicated recipients for a recall email based on who is recalling.

        - Project lead recalls → BA lead gets email
        - BA lead recalls → directorate key stakeholder + approvers (deduplicated)
        - Directorate recalls → BA lead gets email
        """
        recipients = []
        seen_pks = set()

        ba = document.project.business_area
        is_project_lead = document.project.members.filter(
            user=recaller, is_leader=True
        ).exists()
        is_ba_lead = ba and ba.leader and ba.leader.pk == recaller.pk

        if is_project_lead:
            # Project lead recalls → BA lead
            if (
                ba
                and ba.leader
                and ba.leader.is_active
                and ba.leader.pk not in seen_pks
            ):
                recipients.append(
                    {
                        "name": ba.leader.get_full_name(),
                        "email": ba.leader.email,
                        "kind": "Business Area Leader",
                    }
                )
                seen_pks.add(ba.leader.pk)
        elif is_ba_lead:
            # BA lead recalls → directorate key stakeholder + approvers
            if ba and ba.division:
                division = ba.division
                if hasattr(division, "key_stakeholder") and division.key_stakeholder:
                    ks = division.key_stakeholder
                    if ks.is_active and ks.pk not in seen_pks:
                        recipients.append(
                            {
                                "name": ks.get_full_name(),
                                "email": ks.email,
                                "kind": "Key Stakeholder",
                            }
                        )
                        seen_pks.add(ks.pk)
                if hasattr(division, "approvers"):
                    for approver in division.approvers.all():
                        if approver.is_active and approver.pk not in seen_pks:
                            recipients.append(
                                {
                                    "name": approver.get_full_name(),
                                    "email": approver.email,
                                    "kind": "Approver",
                                }
                            )
                            seen_pks.add(approver.pk)
        else:
            # Directorate recalls → BA lead
            if (
                ba
                and ba.leader
                and ba.leader.is_active
                and ba.leader.pk not in seen_pks
            ):
                recipients.append(
                    {
                        "name": ba.leader.get_full_name(),
                        "email": ba.leader.email,
                        "kind": "Business Area Leader",
                    }
                )
                seen_pks.add(ba.leader.pk)

        return recipients

    @staticmethod
    def _get_batch_approval_recipients(document):
        """
        Get recipients for batch approval notifications.
        Only active project leads and business area leads — NOT regular team members.

        Returns:
            List of dicts with 'name', 'email', 'kind'
        """
        recipients = []
        seen_emails = set()

        if hasattr(document, "project") and document.project:
            # Project leads only (not regular team members)
            for member in document.project.members.filter(is_leader=True):
                if (
                    member.user.is_active
                    and member.user.email
                    and member.user.email not in seen_emails
                ):
                    recipients.append(
                        {
                            "name": member.user.get_full_name(),
                            "email": member.user.email,
                            "kind": "Project Lead",
                        }
                    )
                    seen_emails.add(member.user.email)

            # Business area leader
            if document.project.business_area and document.project.business_area.leader:
                ba_leader = document.project.business_area.leader
                if (
                    ba_leader.is_active
                    and ba_leader.email
                    and ba_leader.email not in seen_emails
                ):
                    recipients.append(
                        {
                            "name": ba_leader.get_full_name(),
                            "email": ba_leader.email,
                            "kind": "Business Area Leader",
                        }
                    )
                    seen_emails.add(ba_leader.email)

        return recipients

    @staticmethod
    def _get_document_recipients(document):
        """
        Get list of recipients for document notifications.

        Includes all active project team members and the BA leader,
        deduplicated by email address.

        Returns:
            List of dicts with 'name', 'email', 'kind'
        """
        recipients = []
        seen_emails = set()

        # Add project team
        if hasattr(document, "project") and document.project:
            for member in document.project.members.select_related("user").all():
                user = member.user
                if user.is_active and user.email and user.email not in seen_emails:
                    recipients.append(
                        {
                            "name": user.get_full_name(),
                            "email": user.email,
                            "kind": (
                                "Project Lead" if member.is_leader else "Team Member"
                            ),
                        }
                    )
                    seen_emails.add(user.email)

        # Add business area leader (if not already included as team member)
        if hasattr(document, "project") and document.project.business_area:
            ba = document.project.business_area
            if (
                ba.leader
                and ba.leader.is_active
                and ba.leader.email
                and ba.leader.email not in seen_emails
            ):
                recipients.append(
                    {
                        "name": ba.leader.get_full_name(),
                        "email": ba.leader.email,
                        "kind": "Business Area Leader",
                    }
                )
                seen_emails.add(ba.leader.email)

        return recipients

    @staticmethod
    def _get_directorate_recipients(document):
        """
        Get directorate-level recipients for document notifications.

        Includes key stakeholder (if active), all active approvers, and the
        director — with deduplication. Logs a warning if no recipients found.

        Returns:
            List of dicts with 'name', 'email', 'kind'
        """
        recipients = []
        seen_pks = set()

        if hasattr(document, "project") and document.project.business_area:
            ba = document.project.business_area
            if hasattr(ba, "division") and ba.division:
                division = ba.division

                # Key stakeholder
                if (
                    hasattr(division, "key_stakeholder")
                    and division.key_stakeholder
                    and division.key_stakeholder.is_active
                ):
                    ks = division.key_stakeholder
                    recipients.append(
                        {
                            "name": ks.get_full_name(),
                            "email": ks.email,
                            "kind": "Key Stakeholder",
                        }
                    )
                    seen_pks.add(ks.pk)

                # Approvers
                if hasattr(division, "approvers"):
                    for approver in division.approvers.all():
                        if approver.is_active and approver.pk not in seen_pks:
                            recipients.append(
                                {
                                    "name": approver.get_full_name(),
                                    "email": approver.email,
                                    "kind": "Approver",
                                }
                            )
                            seen_pks.add(approver.pk)

                # Director
                if (
                    hasattr(division, "director")
                    and division.director
                    and division.director.is_active
                    and division.director.pk not in seen_pks
                ):
                    recipients.append(
                        {
                            "name": division.director.get_full_name(),
                            "email": division.director.email,
                            "kind": "Director",
                        }
                    )
                    seen_pks.add(division.director.pk)

        if not recipients:
            settings.LOGGER.warning(
                f"No directorate recipients found for document {document.pk}"
            )

        return recipients

    @staticmethod
    def _get_approver_recipients(document):
        """
        Get approver recipients based on document approval stage.

        Uses ApprovalService.get_next_approver() to determine the correct
        next approver based on the document's current approval stage.

        Returns:
            List of dicts with 'name', 'email', 'kind'
        """
        # Lazy import to avoid circular dependency
        from .approval_service import ApprovalService

        recipients = []

        next_approver = ApprovalService.get_next_approver(document)
        if next_approver:
            stage = ApprovalService.get_approval_stage(document)
            kind_map = {
                1: "Project Lead",
                2: "Business Area Leader",
                3: "Directorate Approver",
            }
            recipients.append(
                {
                    "name": next_approver.get_full_name(),
                    "email": next_approver.email,
                    "kind": kind_map.get(stage, "Approver"),
                }
            )

        return recipients

    @staticmethod
    def _get_project_team_recipients(project):
        """
        Get all active project team members as recipients.

        Filters out inactive users and users without email addresses
        to prevent silent SMTP failures.

        Returns:
            List of dicts with 'name', 'email', 'kind'
        """
        recipients = []

        for member in project.members.select_related("user").all():
            user = member.user
            if user.is_active and user.email:
                recipients.append(
                    {
                        "name": user.get_full_name(),
                        "email": user.email,
                        "kind": "Project Lead" if member.is_leader else "Team Member",
                    }
                )

        return recipients
