"""
Tests for reply-to-author email notifications fired from the comment signal.

Covers the reply email that notifies a parent comment's author when someone
replies, including the dedup rule that lets a mention email take precedence.
"""

from unittest.mock import patch

import pytest

from common.tests.factories import ProjectDocumentFactory, ProjectFactory, UserFactory
from communications.models import Comment

MENTION_PATH = "communications.signals.process_comment_mentions"
TRANSPORT_PATH = (
    "documents.services.notification_service.send_email_with_embedded_image"
)


def _make_comment(document, user, text="Test comment", parent=None):
    return Comment.objects.create(
        user=user,
        document=document,
        text=text,
        ip_address="127.0.0.1",
        is_public=True,
        is_removed=False,
        parent_comment=parent,
    )


@pytest.fixture
def document(db):
    return ProjectDocumentFactory(project=ProjectFactory())


@pytest.fixture
def author(db):
    """Eligible parent comment author (DBCA, active, staff)."""
    return UserFactory(
        first_name="Pat",
        last_name="Author",
        email="pat.author@dbca.wa.gov.au",
        is_active=True,
        is_staff=True,
    )


@pytest.fixture
def replier(db):
    return UserFactory(
        first_name="Robin",
        last_name="Replier",
        email="robin.replier@dbca.wa.gov.au",
        is_active=True,
        is_staff=True,
    )


@pytest.mark.django_db
class TestReplyEmailSignal:
    @patch(MENTION_PATH, return_value=[])
    @patch(TRANSPORT_PATH)
    def test_reply_without_mention_emails_parent_author_once(
        self, mock_send, _mentions, document, author, replier
    ):
        parent = _make_comment(document, author)
        mock_send.reset_mock()

        _make_comment(document, replier, text="A reply", parent=parent)

        assert mock_send.call_count == 1
        assert mock_send.call_args[1]["recipient_email"] == [author.email]

    @patch(MENTION_PATH, return_value=[])
    @patch(TRANSPORT_PATH)
    def test_self_reply_sends_no_email(self, mock_send, _mentions, document, author):
        parent = _make_comment(document, author)
        mock_send.reset_mock()

        _make_comment(document, author, text="Replying to myself", parent=parent)

        assert mock_send.call_count == 0

    @patch(TRANSPORT_PATH)
    def test_reply_plus_eligible_mention_of_parent_sends_only_mention(
        self, mock_send, document, author, replier
    ):
        parent = _make_comment(document, author)
        mock_send.reset_mock()

        # The replier also @mentions the parent author, who is eligible.
        with patch(MENTION_PATH, return_value=[author]):
            _make_comment(
                document, replier, text="A reply mentioning Pat", parent=parent
            )

        # Exactly one email — the mention — and the reply email is suppressed.
        assert mock_send.call_count == 1
        html = mock_send.call_args[1]["html_content"]
        assert "mentioned you" in html

    @patch(TRANSPORT_PATH)
    def test_reply_plus_ineligible_mention_of_parent_sends_reply(
        self, mock_send, document, replier
    ):
        # Parent author is mentioned but ineligible for the mention email
        # (non-DBCA address), so the reply email must still be sent.
        ineligible_author = UserFactory(
            first_name="Sam",
            last_name="External",
            email="sam.external@gmail.com",
            is_active=True,
            is_staff=True,
        )
        parent = _make_comment(document, ineligible_author)
        mock_send.reset_mock()

        with patch(MENTION_PATH, return_value=[ineligible_author]):
            _make_comment(
                document, replier, text="A reply mentioning Sam", parent=parent
            )

        # The mention email is skipped (non-DBCA). The reply email is also
        # skipped because the recipient is not an eligible DBCA recipient.
        assert mock_send.call_count == 0

    @patch(MENTION_PATH, return_value=[])
    @patch(TRANSPORT_PATH)
    def test_sub_reply_emails_the_reply_author_not_top_level(
        self, mock_send, _mentions, document, author, replier
    ):
        # C replies to B's reply -> B is emailed, not the top-level author A.
        second_author = UserFactory(
            first_name="Bev",
            last_name="Second",
            email="bev.second@dbca.wa.gov.au",
            is_active=True,
            is_staff=True,
        )
        top_level = _make_comment(document, author)
        b_reply = _make_comment(document, second_author, text="B", parent=top_level)
        mock_send.reset_mock()

        _make_comment(document, replier, text="C replies to B", parent=b_reply)

        assert mock_send.call_count == 1
        assert mock_send.call_args[1]["recipient_email"] == [second_author.email]

    @patch(MENTION_PATH, return_value=[])
    @patch(TRANSPORT_PATH)
    def test_top_level_comment_without_mention_sends_no_email(
        self, mock_send, _mentions, document, replier
    ):
        mock_send.reset_mock()
        _make_comment(document, replier, text="Top level, no mention")
        assert mock_send.call_count == 0

    @patch(MENTION_PATH, return_value=[])
    @patch(TRANSPORT_PATH, side_effect=Exception("SMTP down"))
    def test_transport_failure_does_not_break_comment_creation(
        self, mock_send, _mentions, document, author, replier
    ):
        parent = _make_comment(document, author)

        reply = _make_comment(document, replier, text="A reply", parent=parent)

        # The reply comment still persists despite the email transport raising.
        assert Comment.objects.filter(pk=reply.pk).exists()
