"""
Tests for communications serializers
"""

import pytest

from communications.serializers import (
    ChatRoomSerializer,
    CommentSerializer,
    DirectMessageSerializer,
    ReactionCreateSerializer,
    ReactionSerializer,
    TinyChatRoomSerializer,
    TinyCommentCreateSerializer,
    TinyCommentSerializer,
    TinyDirectMessageSerializer,
    TinyReactionSerializer,
)
from users.utils import get_user_display_name


class TestTinyDirectMessageSerializer:
    """Tests for TinyDirectMessageSerializer"""

    @pytest.mark.unit
    def test_serialize_direct_message(self, direct_message, db):
        """Test serializing a direct message"""
        # Act
        serializer = TinyDirectMessageSerializer(direct_message)
        data = serializer.data

        # Assert
        assert data["id"] == direct_message.id
        assert data["text"] == direct_message.text
        assert data["chat_room"] == direct_message.chat_room.id
        assert "user" in data

    @pytest.mark.integration
    def test_user_field_read_only(self, direct_message, db):
        """Test user field is read-only"""
        # Arrange
        serializer = TinyDirectMessageSerializer(direct_message)

        # Act
        fields = serializer.fields

        # Assert
        assert fields["user"].read_only is True

    @pytest.mark.unit
    def test_fields_included(self, direct_message, db):
        """Test correct fields are included"""
        # Act
        serializer = TinyDirectMessageSerializer(direct_message)
        data = serializer.data

        # Assert
        assert set(data.keys()) == {"id", "text", "user", "chat_room"}


class TestTinyReactionSerializer:
    """Tests for TinyReactionSerializer"""

    @pytest.mark.unit
    def test_serialize_reaction_on_message(self, reaction_on_message, db):
        """Test serializing a reaction on a direct message"""
        # Act
        serializer = TinyReactionSerializer(reaction_on_message)
        data = serializer.data

        # Assert
        assert data["id"] == reaction_on_message.id
        # user is a nested TinyUserSerializer, not just an ID
        assert "user" in data
        assert isinstance(data["user"], dict)
        assert data["reaction"] == reaction_on_message.reaction
        assert "direct_message" in data

    @pytest.mark.unit
    def test_serialize_reaction_on_comment(self, reaction_on_comment, db):
        """Test serializing a reaction on a comment"""
        # Act
        serializer = TinyReactionSerializer(reaction_on_comment)
        data = serializer.data

        # Assert
        assert data["id"] == reaction_on_comment.id
        # user is a nested TinyUserSerializer, not just an ID
        assert "user" in data
        assert isinstance(data["user"], dict)
        assert data["comment"] == reaction_on_comment.comment.id
        assert data["reaction"] == reaction_on_comment.reaction

    @pytest.mark.unit
    def test_fields_included(self, reaction_on_comment, db):
        """Test correct fields are included"""
        # Act
        serializer = TinyReactionSerializer(reaction_on_comment)
        data = serializer.data

        # Assert
        assert set(data.keys()) == {
            "id",
            "user",
            "direct_message",
            "comment",
            "reaction",
            "created_at",
        }


class TestTinyCommentSerializer:
    """Tests for TinyCommentSerializer"""

    @pytest.mark.unit
    def test_serialize_comment(self, comment, db):
        """Test serializing a comment"""
        # Act
        serializer = TinyCommentSerializer(comment)
        data = serializer.data

        # Assert
        assert data["id"] == comment.id
        assert data["text"] == comment.text
        assert data["document"] == comment.document.id
        assert "user" in data
        assert "created_at" in data
        assert "updated_at" in data
        assert "reactions" in data

    @pytest.mark.integration
    def test_user_field_read_only(self, comment, db):
        """Test user field is read-only"""
        # Arrange
        serializer = TinyCommentSerializer(comment)

        # Act
        fields = serializer.fields

        # Assert
        assert fields["user"].read_only is True

    @pytest.mark.unit
    def test_reactions_field_many(self, comment, reaction_on_comment, db):
        """Test reactions field handles multiple reactions"""
        # Act
        serializer = TinyCommentSerializer(comment)
        data = serializer.data

        # Assert
        assert isinstance(data["reactions"], list)
        assert len(data["reactions"]) == 1

    @pytest.mark.unit
    def test_fields_included(self, comment, db):
        """Test correct fields are included"""
        # Act
        serializer = TinyCommentSerializer(comment)
        data = serializer.data

        # Assert
        assert set(data.keys()) == {
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
        }


class TestCommentThreading:
    """Tests for flattened two-level threading in CommentSerializer"""

    @pytest.mark.integration
    def test_root_replies_return_flattened_subtree_ordered(
        self, user, other_user, project_document, db
    ):
        """A root's get_replies returns the full subtree ordered by created_at"""
        from communications.models import Comment

        root = Comment.objects.create(user=user, document=project_document, text="Root")
        child = Comment.objects.create(
            user=other_user,
            document=project_document,
            text="Child",
            parent_comment=root,
        )
        grandchild = Comment.objects.create(
            user=user,
            document=project_document,
            text="Grandchild",
            parent_comment=child,
        )

        data = CommentSerializer(root).data
        reply_ids = [reply["id"] for reply in data["replies"]]

        assert reply_ids == [child.id, grandchild.id]

    @pytest.mark.integration
    def test_non_root_replies_return_empty(
        self, user, other_user, project_document, db
    ):
        """A non-root comment returns an empty replies list"""
        from communications.models import Comment

        root = Comment.objects.create(user=user, document=project_document, text="Root")
        child = Comment.objects.create(
            user=other_user,
            document=project_document,
            text="Child",
            parent_comment=root,
        )
        Comment.objects.create(
            user=user,
            document=project_document,
            text="Grandchild",
            parent_comment=child,
        )

        data = CommentSerializer(child).data

        assert data["replies"] == []

    @pytest.mark.integration
    def test_root_reply_count_equals_subtree_size(
        self, user, other_user, project_document, db
    ):
        """reply_count reflects the full subtree, not just direct children"""
        from communications.models import Comment

        root = Comment.objects.create(user=user, document=project_document, text="Root")
        child = Comment.objects.create(
            user=other_user,
            document=project_document,
            text="Child",
            parent_comment=root,
        )
        Comment.objects.create(
            user=user,
            document=project_document,
            text="Grandchild",
            parent_comment=child,
        )

        data = CommentSerializer(root).data

        assert data["reply_count"] == 2
        assert data["has_replies"] is True

    @pytest.mark.integration
    def test_grandchild_parent_author_name_is_parent_author(
        self, user, other_user, project_document, db
    ):
        """A grandchild resolves parent_author_name to its parent's author"""
        from communications.models import Comment

        root = Comment.objects.create(user=user, document=project_document, text="Root")
        child = Comment.objects.create(
            user=other_user,
            document=project_document,
            text="Child",
            parent_comment=root,
        )
        grandchild = Comment.objects.create(
            user=user,
            document=project_document,
            text="Grandchild",
            parent_comment=child,
        )

        data = TinyCommentSerializer(grandchild).data

        assert data["parent_author_name"] == get_user_display_name(other_user)

    @pytest.mark.integration
    def test_parent_author_name_survives_soft_deleted_parent(
        self, user, other_user, project_document, db
    ):
        """parent_author_name still resolves when the parent is soft-removed"""
        from communications.models import Comment

        root = Comment.objects.create(user=user, document=project_document, text="Root")
        child = Comment.objects.create(
            user=other_user,
            document=project_document,
            text="Child",
            parent_comment=root,
        )
        grandchild = Comment.objects.create(
            user=user,
            document=project_document,
            text="Grandchild",
            parent_comment=child,
        )

        child.is_removed = True
        child.save()
        grandchild.refresh_from_db()

        data = TinyCommentSerializer(grandchild).data

        assert data["parent_author_name"] == get_user_display_name(other_user)

    @pytest.mark.integration
    def test_direct_reply_to_root_has_no_parent_author_name(
        self, user, other_user, project_document, db
    ):
        """A direct reply to the root has no parent_author_name label"""
        from communications.models import Comment

        root = Comment.objects.create(user=user, document=project_document, text="Root")
        child = Comment.objects.create(
            user=other_user,
            document=project_document,
            text="Child",
            parent_comment=root,
        )

        data = TinyCommentSerializer(child).data

        assert data["parent_author_name"] is None


class TestTinyCommentCreateSerializer:
    """Tests for TinyCommentCreateSerializer"""

    @pytest.mark.unit
    def test_serialize_comment(self, comment, db):
        """Test serializing a comment for creation"""
        # Act
        serializer = TinyCommentCreateSerializer(comment)
        data = serializer.data

        # Assert
        assert data["id"] == comment.id
        assert data["text"] == comment.text
        assert data["document"] == comment.document.id
        assert data["user"] == comment.user.id
        assert "created_at" in data
        assert "updated_at" in data

    @pytest.mark.integration
    def test_deserialize_comment(self, user, project_document, db):
        """Test deserializing comment data"""
        # Arrange
        data = {
            "user": user.id,
            "document": project_document.id,
            "text": "New comment",
        }

        # Act
        serializer = TinyCommentCreateSerializer(data=data)

        # Assert
        assert serializer.is_valid()
        comment = serializer.save()
        assert comment.text == "New comment"
        assert comment.user == user
        assert comment.document == project_document

    @pytest.mark.unit
    def test_fields_included(self, comment, db):
        """Test correct fields are included"""
        # Act
        serializer = TinyCommentCreateSerializer(comment)
        data = serializer.data

        # Assert
        assert set(data.keys()) == {
            "id",
            "user",
            "document",
            "text",
            "parent_comment",
            "created_at",
            "updated_at",
        }


class TestCommentSerializer:
    """Tests for CommentSerializer"""

    @pytest.mark.unit
    def test_serialize_comment(self, comment, db):
        """Test serializing a comment with all fields"""
        # Act
        serializer = CommentSerializer(comment)
        data = serializer.data

        # Assert
        assert data["id"] == comment.id
        assert data["text"] == comment.text
        assert "user" in data
        assert "document" in data
        assert "created_at" in data
        assert "updated_at" in data
        assert "ip_address" in data
        assert "is_public" in data
        assert "is_removed" in data

    @pytest.mark.integration
    def test_user_field_read_only(self, comment, db):
        """Test user field is read-only"""
        # Arrange
        serializer = CommentSerializer(comment)

        # Act
        fields = serializer.fields

        # Assert
        assert fields["user"].read_only is True

    @pytest.mark.unit
    def test_document_field_read_only(self, comment, db):
        """Test document field is read-only"""
        # Arrange
        serializer = CommentSerializer(comment)

        # Act
        fields = serializer.fields

        # Assert
        assert fields["document"].read_only is True

    @pytest.mark.unit
    def test_all_fields_included(self, comment, db):
        """Test all model fields are included"""
        # Act
        serializer = CommentSerializer(comment)
        data = serializer.data

        # Assert
        # Should include all fields from model
        assert "id" in data
        assert "user" in data
        assert "document" in data
        assert "text" in data
        assert "ip_address" in data
        assert "is_public" in data
        assert "is_removed" in data
        assert "created_at" in data
        assert "updated_at" in data


class TestTinyChatRoomSerializer:
    """Tests for TinyChatRoomSerializer"""

    @pytest.mark.unit
    def test_serialize_chat_room(self, chat_room, db):
        """Test serializing a chat room"""
        # Act
        serializer = TinyChatRoomSerializer(chat_room)
        data = serializer.data

        # Assert
        assert data["id"] == chat_room.id
        assert "users" in data
        assert isinstance(data["users"], list)

    @pytest.mark.integration
    def test_users_field_read_only(self, chat_room, db):
        """Test users field is read-only"""
        # Arrange
        serializer = TinyChatRoomSerializer(chat_room)

        # Act
        fields = serializer.fields

        # Assert
        assert fields["users"].read_only is True

    @pytest.mark.integration
    def test_users_field_many(self, chat_room, user, other_user, db):
        """Test users field handles multiple users"""
        # Act
        serializer = TinyChatRoomSerializer(chat_room)
        data = serializer.data

        # Assert
        assert len(data["users"]) == 2

    @pytest.mark.unit
    def test_fields_included(self, chat_room, db):
        """Test correct fields are included"""
        # Act
        serializer = TinyChatRoomSerializer(chat_room)
        data = serializer.data

        # Assert
        assert set(data.keys()) == {"id", "users"}


class TestDirectMessageSerializer:
    """Tests for DirectMessageSerializer"""

    @pytest.mark.unit
    def test_serialize_direct_message(self, direct_message, db):
        """Test serializing a direct message with all fields"""
        # Act
        serializer = DirectMessageSerializer(direct_message)
        data = serializer.data

        # Assert
        assert data["id"] == direct_message.id
        assert data["text"] == direct_message.text
        assert "user" in data
        assert "chat_room" in data
        assert "reactions" in data
        assert "ip_address" in data
        assert "is_public" in data
        assert "is_removed" in data

    @pytest.mark.integration
    def test_user_field_read_only(self, direct_message, db):
        """Test user field is read-only"""
        # Arrange
        serializer = DirectMessageSerializer(direct_message)

        # Act
        fields = serializer.fields

        # Assert
        assert fields["user"].read_only is True

    @pytest.mark.unit
    def test_chat_room_field_read_only(self, direct_message, db):
        """Test chat_room field is read-only"""
        # Arrange
        serializer = DirectMessageSerializer(direct_message)

        # Act
        fields = serializer.fields

        # Assert
        assert fields["chat_room"].read_only is True

    @pytest.mark.unit
    def test_reactions_field_read_only(self, direct_message, db):
        """Test reactions field is read-only"""
        # Arrange
        serializer = DirectMessageSerializer(direct_message)

        # Act
        fields = serializer.fields

        # Assert
        assert fields["reactions"].read_only is True

    @pytest.mark.unit
    def test_all_fields_included(self, direct_message, db):
        """Test all model fields are included"""
        # Act
        serializer = DirectMessageSerializer(direct_message)
        data = serializer.data

        # Assert
        assert "id" in data
        assert "text" in data
        assert "user" in data
        assert "chat_room" in data
        assert "ip_address" in data
        assert "is_public" in data
        assert "is_removed" in data
        assert "reactions" in data
        assert "created_at" in data
        assert "updated_at" in data


class TestChatRoomSerializer:
    """Tests for ChatRoomSerializer"""

    @pytest.mark.unit
    def test_serialize_chat_room(self, chat_room, db):
        """Test serializing a chat room with all fields"""
        # Act
        serializer = ChatRoomSerializer(chat_room)
        data = serializer.data

        # Assert
        assert data["id"] == chat_room.id
        assert "users" in data
        assert "messages" in data
        assert "created_at" in data
        assert "updated_at" in data

    @pytest.mark.integration
    def test_users_field_read_only(self, chat_room, db):
        """Test users field is read-only"""
        # Arrange
        serializer = ChatRoomSerializer(chat_room)

        # Act
        fields = serializer.fields

        # Assert
        assert fields["users"].read_only is True

    @pytest.mark.unit
    def test_messages_field_read_only(self, chat_room, db):
        """Test messages field is read-only"""
        # Arrange
        serializer = ChatRoomSerializer(chat_room)

        # Act
        fields = serializer.fields

        # Assert
        assert fields["messages"].read_only is True

    @pytest.mark.unit
    def test_messages_field_many(self, chat_room, direct_message, db):
        """Test messages field handles multiple messages"""
        # Act
        serializer = ChatRoomSerializer(chat_room)
        data = serializer.data

        # Assert
        assert isinstance(data["messages"], list)
        assert len(data["messages"]) == 1

    @pytest.mark.unit
    def test_all_fields_included(self, chat_room, db):
        """Test all model fields are included"""
        # Act
        serializer = ChatRoomSerializer(chat_room)
        data = serializer.data

        # Assert
        assert "id" in data
        assert "users" in data
        assert "messages" in data
        assert "created_at" in data
        assert "updated_at" in data


class TestReactionSerializer:
    """Tests for ReactionSerializer"""

    @pytest.mark.unit
    def test_serialize_reaction_on_comment(self, reaction_on_comment, db):
        """Test serializing a reaction on a comment"""
        # Act
        serializer = ReactionSerializer(reaction_on_comment)
        data = serializer.data

        # Assert
        assert data["id"] == reaction_on_comment.id
        assert "user" in data
        assert "comment" in data
        assert data["reaction"] == reaction_on_comment.reaction

    @pytest.mark.unit
    def test_serialize_reaction_on_message(self, reaction_on_message, db):
        """Test serializing a reaction on a direct message"""
        # Act
        serializer = ReactionSerializer(reaction_on_message)
        data = serializer.data

        # Assert
        assert data["id"] == reaction_on_message.id
        assert "user" in data
        assert "direct_message" in data
        assert data["reaction"] == reaction_on_message.reaction

    @pytest.mark.integration
    def test_user_field_read_only(self, reaction_on_comment, db):
        """Test user field is read-only"""
        # Arrange
        serializer = ReactionSerializer(reaction_on_comment)

        # Act
        fields = serializer.fields

        # Assert
        assert fields["user"].read_only is True

    @pytest.mark.unit
    def test_all_fields_included(self, reaction_on_comment, db):
        """Test all model fields are included"""
        # Act
        serializer = ReactionSerializer(reaction_on_comment)
        data = serializer.data

        # Assert
        assert "id" in data
        assert "user" in data
        assert "comment" in data
        assert "direct_message" in data
        assert "reaction" in data
        assert "created_at" in data
        assert "updated_at" in data


class TestReactionCreateSerializer:
    """Tests for ReactionCreateSerializer"""

    @pytest.mark.unit
    def test_serialize_reaction(self, reaction_on_comment, db):
        """Test serializing a reaction for creation"""
        # Act
        serializer = ReactionCreateSerializer(reaction_on_comment)
        data = serializer.data

        # Assert
        assert data["id"] == reaction_on_comment.id
        assert data["user"] == reaction_on_comment.user.id
        assert data["comment"] == reaction_on_comment.comment.id
        assert data["reaction"] == reaction_on_comment.reaction

    @pytest.mark.integration
    def test_deserialize_reaction_on_comment(self, user, comment, db):
        """Test deserializing reaction data for comment"""
        # Arrange
        data = {
            "user": user.id,
            "comment": comment.id,
            "reaction": "thumbup",
        }

        # Act
        serializer = ReactionCreateSerializer(data=data)

        # Assert
        assert serializer.is_valid()
        reaction = serializer.save()
        assert reaction.user == user
        assert reaction.comment == comment
        assert reaction.reaction == "thumbup"

    @pytest.mark.integration
    def test_deserialize_reaction_on_message(self, user, direct_message, db):
        """Test deserializing reaction data for direct message"""
        # Arrange
        data = {
            "user": user.id,
            "direct_message": direct_message.id,
            "reaction": "heart",
        }

        # Act
        serializer = ReactionCreateSerializer(data=data)

        # Assert
        assert serializer.is_valid()
        reaction = serializer.save()
        assert reaction.user == user
        assert reaction.direct_message == direct_message
        assert reaction.reaction == "heart"

    @pytest.mark.unit
    def test_fields_included(self, reaction_on_comment, db):
        """Test correct fields are included"""
        # Act
        serializer = ReactionCreateSerializer(reaction_on_comment)
        data = serializer.data

        # Assert
        # Note: ReactionCreateSerializer includes all fields from the model
        expected_fields = {
            "id",
            "user",
            "comment",
            "direct_message",
            "reaction",
            "created_at",
            "updated_at",
        }
        assert set(data.keys()) == expected_fields
