# region Imports ================================================================================================

from django.conf import settings
from rest_framework import serializers
from rest_framework.serializers import ModelSerializer, SerializerMethodField

from documents.serializers import TinyProjectDocumentSerializer
from users.serializers import TinyUserSerializer
from users.utils import get_user_display_name

from .models import ChatRoom, Comment, CommentMention, DirectMessage, Reaction

# endregion ====================================================================================================


# region serializers =============================================================================================


# Direct Messages --------------------------------------------------------------------------------------------


class TinyDirectMessageSerializer(ModelSerializer):
    user = TinyUserSerializer(read_only=True)

    class Meta:
        model = DirectMessage
        fields = [
            "id",
            "text",
            "user",
            "chat_room",
        ]


class TinyReactionSerializer(ModelSerializer):
    user = TinyUserSerializer(read_only=True)
    direct_message = TinyDirectMessageSerializer()

    class Meta:
        model = Reaction
        fields = [
            "id",
            "user",
            "direct_message",
            "comment",
            "reaction",
            "created_at",
        ]


# Comments --------------------------------------------------------------------------------------------


class CommentMentionSerializer(ModelSerializer):
    """Serializer for comment mentions"""

    mentioned_user = TinyUserSerializer(read_only=True)

    class Meta:
        model = CommentMention
        fields = [
            "id",
            "mentioned_user",
            "created_at",
        ]


class TinyCommentSerializer(ModelSerializer):
    user = TinyUserSerializer(read_only=True)
    reactions = TinyReactionSerializer(many=True)
    mentions = CommentMentionSerializer(many=True, read_only=True)
    reply_count = SerializerMethodField()
    has_replies = SerializerMethodField()
    parent_author_name = SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            "id",
            "user",
            "document",
            "text",
            "parent_comment",
            "parent_author_name",
            "created_at",
            "updated_at",
            "reactions",
            "mentions",
            "reply_count",
            "has_replies",
        ]

    def get_reply_count(self, obj):
        """Get count of direct replies to this comment"""
        return obj.replies.filter(is_removed=False).count()

    def get_has_replies(self, obj):
        """Check if comment has any replies"""
        return obj.replies.filter(is_removed=False).exists()

    def get_parent_author_name(self, obj):
        """Resolve the display name of the author this reply is addressed to.

        Returns None for top-level comments and for direct replies to a
        top-level comment (no label is needed in those cases). For deeper
        replies the parent author's display name is returned even when the
        parent has been soft-removed, so the reference line stays meaningful.
        """
        if obj.parent_comment_id is None:
            return None

        parent = obj.parent_comment
        if parent is None or parent.parent_comment_id is None:
            return None

        if parent.user is None:
            return None

        return get_user_display_name(parent.user)


class TinyCommentCreateSerializer(ModelSerializer):

    class Meta:
        model = Comment
        fields = [
            "id",
            "user",
            "document",
            "text",
            "parent_comment",
            "created_at",
            "updated_at",
        ]


class CommentCreateSerializer(ModelSerializer):
    """Serializer for creating comments with writable foreign keys"""

    class Meta:
        model = Comment
        fields = [
            "id",
            "user",
            "document",
            "text",
            "parent_comment",
            "ip_address",
            "is_public",
            "is_removed",
            "created_at",
            "updated_at",
        ]

    def validate_text(self, value):
        """Validate comment text length"""
        if len(value) > 1500:
            raise serializers.ValidationError(
                "Comment text must be 1500 characters or less"
            )
        return value


class CommentSerializer(ModelSerializer):
    """Full comment serializer with all related data"""

    user = TinyUserSerializer(read_only=True)
    document = TinyProjectDocumentSerializer(read_only=True)
    reactions = TinyReactionSerializer(many=True, read_only=True)
    mentions = CommentMentionSerializer(many=True, read_only=True)
    replies = SerializerMethodField()
    reply_count = SerializerMethodField()
    has_replies = SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            "id",
            "user",
            "document",
            "text",
            "parent_comment",
            "ip_address",
            "is_public",
            "is_removed",
            "created_at",
            "updated_at",
            "reactions",
            "mentions",
            "replies",
            "reply_count",
            "has_replies",
        ]

    def _collect_subtree(self, obj):
        """Breadth-first walk of all non-removed descendants of a root comment.

        Returns the descendants concatenated level by level and sorted by
        creation time, so the flattened thread renders in chronological order.
        """
        collected = []
        visited_ids = set()
        current_level = list(obj.replies.filter(is_removed=False))

        while current_level:
            level_ids = []
            for reply in current_level:
                if reply.pk in visited_ids:
                    continue
                visited_ids.add(reply.pk)
                collected.append(reply)
                level_ids.append(reply.pk)

            if not level_ids:
                break

            current_level = list(
                Comment.objects.filter(
                    parent_comment_id__in=level_ids,
                    is_removed=False,
                ).exclude(pk__in=visited_ids)
            )

        collected.sort(key=lambda reply: reply.created_at)
        return collected

    def get_replies(self, obj):
        """Return the flattened subtree of replies for a root comment.

        Non-root comments return an empty list because the full thread is
        rendered under its top-level ancestor. On any error the direct
        children are returned so the thread degrades gracefully.
        """
        if obj.parent_comment_id is not None:
            return []

        try:
            replies = self._collect_subtree(obj)
            return TinyCommentSerializer(replies, many=True).data
        except Exception as e:
            settings.LOGGER.error(
                f"Failed to collect reply subtree for comment {obj.pk}: {e}"
            )
            direct_children = obj.replies.filter(is_removed=False).order_by(
                "created_at"
            )
            return TinyCommentSerializer(direct_children, many=True).data

    def get_reply_count(self, obj):
        """Get the full subtree size so the toggle label matches the cards"""
        try:
            return len(self._collect_subtree(obj))
        except Exception as e:
            settings.LOGGER.error(
                f"Failed to count reply subtree for comment {obj.pk}: {e}"
            )
            return obj.replies.filter(is_removed=False).count()

    def get_has_replies(self, obj):
        """Check if the comment has any replies in its subtree"""
        try:
            return len(self._collect_subtree(obj)) > 0
        except Exception as e:
            settings.LOGGER.error(
                f"Failed to check reply subtree for comment {obj.pk}: {e}"
            )
            return obj.replies.filter(is_removed=False).exists()


# Chat Rooms & Direct Messages --------------------------------------------------------------------------------------------


class TinyChatRoomSerializer(ModelSerializer):
    users = TinyUserSerializer(read_only=True, many=True)

    class Meta:
        model = ChatRoom
        fields = [
            "id",
            "users",
        ]


class DirectMessageCreateSerializer(ModelSerializer):
    """Serializer for creating direct messages with writable foreign keys"""

    class Meta:
        model = DirectMessage
        fields = [
            "id",
            "text",
            "user",
            "chat_room",
            "ip_address",
            "is_public",
            "is_removed",
            "created_at",
            "updated_at",
        ]


class DirectMessageSerializer(ModelSerializer):
    user = TinyUserSerializer(read_only=True)
    chat_room = TinyChatRoomSerializer(read_only=True)
    reactions = TinyReactionSerializer(read_only=True, many=True)

    class Meta:
        model = DirectMessage
        fields = "__all__"


class ChatRoomSerializer(ModelSerializer):
    users = TinyUserSerializer(read_only=True, many=True)
    messages = TinyDirectMessageSerializer(read_only=True, many=True)

    class Meta:
        model = ChatRoom
        fields = "__all__"


# Reactions --------------------------------------------------------------------------------------------


class ReactionSerializer(ModelSerializer):
    user = TinyUserSerializer(read_only=True)
    direct_message = TinyDirectMessageSerializer()
    comment = TinyCommentSerializer()

    class Meta:
        model = Reaction
        fields = "__all__"


class ReactionCreateSerializer(ModelSerializer):
    class Meta:
        model = Reaction
        fields = [
            "id",
            "user",
            "comment",
            "direct_message",
            "reaction",
            "created_at",
            "updated_at",
        ]


# endregion ====================================================================================================
