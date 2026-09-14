"""
Authoritative permission checks for editing document rich text content.

These functions are the backend source of truth for whether a user may edit a
document's rich text fields. The frontend mirrors this logic for its UI, but
the server no longer relies on the frontend alone.

Locking rule: a document is locked for content editing once it is fully
approved (all three approval stages granted). Locked documents may only be
edited by superusers or by users holding an active edit exception.

For unlocked documents this check intentionally does not add server-side role
restrictions; it preserves the endpoints' prior authenticated-access
behaviour. Role-based visibility (team member / business area lead) is applied
by the frontend permission utility.
"""

from ..services.edit_exception_service import EditExceptionService


def is_document_locked(document) -> bool:
    """
    Whether a document's rich text fields are locked for content editing.

    Mirrors the frontend `isRichTextLocked`: a fully approved document is
    locked. This is intentionally based on approval flags alone so the rule is
    stable regardless of successor-document presence.
    """
    return (
        document.project_lead_approval_granted
        and document.business_area_lead_approval_granted
        and document.directorate_approval_granted
    )


def can_edit_document_content(user, document) -> bool:
    """
    Whether the user may edit the document's rich text fields.

    This check is scoped to the locking concern only:

    - Superusers always may.
    - For an unlocked document, editing is permitted (the existing
      authenticated-access behaviour of the content-edit endpoints is
      preserved unchanged).
    - For a locked document, editing is denied unless the user holds an
      active edit exception.

    Deliberately narrow: this function gates locked documents. It does not
    introduce new role restrictions on unlocked documents, so the prior
    behaviour of the rich text save endpoints is unchanged for the common
    (unlocked) case.
    """
    if user.is_superuser:
        return True

    if not is_document_locked(document):
        return True

    return EditExceptionService.has_active_exception(user, document)


# Fields that must never be changed through a rich text content-edit path.
# Editing content can never move a document's approval stage.
PROTECTED_APPROVAL_FIELDS = frozenset(
    {
        "status",
        "project_lead_approval_granted",
        "business_area_lead_approval_granted",
        "directorate_approval_granted",
    }
)


def strip_protected_fields(data):
    """
    Return a copy of the incoming data with approval-state fields removed.

    Accepts a dict-like (including QueryDict); returns a plain dict of the
    permitted fields.
    """
    return {
        key: value
        for key, value in data.items()
        if key not in PROTECTED_APPROVAL_FIELDS
    }
