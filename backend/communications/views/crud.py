"""
Communication CRUD views
"""

import logging

from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.status import (
    HTTP_200_OK,
    HTTP_201_CREATED,
    HTTP_202_ACCEPTED,
    HTTP_204_NO_CONTENT,
    HTTP_400_BAD_REQUEST,
    HTTP_401_UNAUTHORIZED,
    HTTP_403_FORBIDDEN,
)
from rest_framework.views import APIView

from communications.serializers import (
    ChatRoomSerializer,
    CommentCreateSerializer,
    CommentSerializer,
    DirectMessageCreateSerializer,
    DirectMessageSerializer,
    ReactionSerializer,
    TinyChatRoomSerializer,
    TinyDirectMessageSerializer,
    TinyReactionSerializer,
)
from communications.services import CommunicationService
from communications.utils.comment_permissions import (
    can_user_comment,
    can_user_delete_comment,
    can_user_edit_comment,
)

logger = logging.getLogger(__name__)

# Maps a document's kind to its URL-safe path segment, matching the frontend
# routes (and the comment-email document links).
_DOCUMENT_KIND_URL_SEGMENT = {
    "concept": "concept",
    "projectplan": "project",
    "progressreport": "progress",
    "studentreport": "student",
    "projectclosure": "closure",
}


def _build_document_page_link(document_id):
    """Build the full {SITE_URL}/projects/{project_id}/{document_type} page URL.

    Used in logs so it's clear which document page a request relates to, as a
    directly clickable link. Returns None when the document can't be resolved
    (e.g. no document_id on a list-all request), so the caller can log a
    sensible fallback.
    """
    if not document_id:
        return None
    try:
        from documents.models import ProjectDocument

        document = ProjectDocument.objects.select_related("project").get(pk=document_id)
        segment = _DOCUMENT_KIND_URL_SEGMENT.get(document.kind, document.kind)
        return f"{settings.SITE_URL}/projects/{document.project.pk}/{segment}"
    except Exception:
        return None


class ChatRooms(APIView):
    """List and create chat rooms"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List all chat rooms"""
        chat_rooms = CommunicationService.list_chat_rooms()
        serializer = TinyChatRoomSerializer(chat_rooms, many=True)
        return Response(serializer.data, status=HTTP_200_OK)

    def post(self, request):
        """Create new chat room"""
        settings.LOGGER.info(f"{request.user} is creating chat room")
        serializer = ChatRoomSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        chat_room = CommunicationService.create_chat_room(
            request.user, serializer.validated_data
        )
        result = TinyChatRoomSerializer(chat_room)
        return Response(result.data, status=HTTP_201_CREATED)


class ChatRoomDetail(APIView):
    """Get, update, and delete chat room"""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Get chat room detail"""
        chat_room = CommunicationService.get_chat_room(pk)
        serializer = ChatRoomSerializer(chat_room)
        return Response(serializer.data, status=HTTP_200_OK)

    def put(self, request, pk):
        """Update chat room"""
        settings.LOGGER.info(f"{request.user} is updating chat room (pk={pk})")
        serializer = ChatRoomSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        chat_room = CommunicationService.update_chat_room(
            pk, request.user, serializer.validated_data
        )
        result = TinyChatRoomSerializer(chat_room)
        return Response(result.data, status=HTTP_202_ACCEPTED)

    def delete(self, request, pk):
        """Delete chat room"""
        settings.LOGGER.warning(f"{request.user} is deleting chat room (pk={pk})")
        CommunicationService.delete_chat_room(pk, request.user)
        return Response(status=HTTP_204_NO_CONTENT)


class DirectMessages(APIView):
    """List and create direct messages"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List all direct messages"""
        messages = CommunicationService.list_direct_messages()
        serializer = TinyDirectMessageSerializer(messages, many=True)
        return Response(serializer.data, status=HTTP_200_OK)

    def post(self, request):
        """Create new direct message"""
        settings.LOGGER.info(f"{request.user} is sending direct message")
        serializer = DirectMessageCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        message = CommunicationService.create_direct_message(
            request.user, serializer.validated_data
        )
        result = TinyDirectMessageSerializer(message)
        return Response(result.data, status=HTTP_201_CREATED)


class DirectMessageDetail(APIView):
    """Get, update, and delete direct message"""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Get direct message detail"""
        message = CommunicationService.get_direct_message(pk)
        serializer = DirectMessageSerializer(message)
        return Response(serializer.data, status=HTTP_200_OK)

    def put(self, request, pk):
        """Update direct message"""
        settings.LOGGER.info(f"{request.user} is updating direct message (pk={pk})")
        serializer = DirectMessageSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        message = CommunicationService.update_direct_message(
            pk, request.user, serializer.validated_data
        )
        result = TinyDirectMessageSerializer(message)
        return Response(result.data, status=HTTP_202_ACCEPTED)

    def delete(self, request, pk):
        """Delete direct message"""
        settings.LOGGER.warning(f"{request.user} is deleting direct message (pk={pk})")
        CommunicationService.delete_direct_message(pk, request.user)
        return Response(status=HTTP_204_NO_CONTENT)


class Comments(APIView):
    """List and create comments"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        List comments with optional filtering

        Query parameters:
            - document_id: Filter by document ID
            - parent_comment_id: Get replies to a specific comment
            - top_level_only: If 'true', only return top-level comments (no parent)
        """
        document_id = request.query_params.get("document_id")
        parent_comment_id = request.query_params.get("parent_comment_id")
        top_level_only = (
            request.query_params.get("top_level_only", "").lower() == "true"
        )

        comments = CommunicationService.list_comments(
            document_id=document_id,
            parent_comment_id=parent_comment_id,
            top_level_only=top_level_only,
        )
        serializer = CommentSerializer(comments, many=True)

        # Log each list fetch so comment polling is observable server-side.
        # The frontend polls this endpoint on an interval, so these entries
        # confirm polls are arriving (and how many comments were returned).
        # Include the document page link so it's obvious what was being viewed.
        page_link = _build_document_page_link(document_id)
        settings.LOGGER.info(
            f"{request.user} fetched comments "
            f"(count={len(serializer.data)}, page={page_link})"
        )

        return Response(serializer.data, status=HTTP_200_OK)

    def post(self, request):
        """Create new comment"""
        settings.LOGGER.info(f"{request.user} is creating comment")
        serializer = CommentCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        # Get document and project for permission check
        document_id = serializer.validated_data.get("document")
        if not document_id:
            return Response(
                {"error": "Document ID required"}, status=HTTP_400_BAD_REQUEST
            )

        try:
            from documents.models import ProjectDocument

            document = ProjectDocument.objects.select_related("project").get(
                pk=document_id.pk
            )
            project = document.project

            # Check permission
            if not can_user_comment(request.user, project):
                logger.warning(
                    f"Unauthorized comment attempt by user {request.user.pk} "
                    f"on project {project.pk}"
                )
                return Response(
                    {
                        "error": "You do not have permission to comment on this project. "
                        "Only project team members, business area leads, Directorate users, "
                        "and administrators can comment."
                    },
                    status=HTTP_403_FORBIDDEN,
                )

            comment = CommunicationService.create_comment(
                request.user, serializer.validated_data
            )
            result = CommentSerializer(comment)
            return Response(result.data, status=HTTP_201_CREATED)

        except ProjectDocument.DoesNotExist:
            return Response(
                {"error": "Document not found"}, status=HTTP_400_BAD_REQUEST
            )


class CommentDetail(APIView):
    """Get, update, and delete comment"""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Get comment detail"""
        comment = CommunicationService.get_comment(pk)
        serializer = CommentSerializer(comment)
        return Response(serializer.data, status=HTTP_200_OK)

    def put(self, request, pk):
        """Update comment"""
        settings.LOGGER.info(f"{request.user} is updating comment (pk={pk})")
        serializer = CommentSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        try:
            comment = CommunicationService.get_comment(pk)

            # Check permission
            if not can_user_edit_comment(request.user, comment):
                logger.warning(
                    f"Unauthorized comment edit attempt by user {request.user.pk} "
                    f"on comment {comment.pk}"
                )
                return Response(
                    {
                        "error": "You no longer have permission to edit comments on this project."
                    },
                    status=HTTP_403_FORBIDDEN,
                )

            comment = CommunicationService.update_comment(
                pk, request.user, serializer.validated_data
            )
            result = CommentSerializer(comment)
            return Response(result.data, status=HTTP_202_ACCEPTED)

        except Exception as e:
            logger.error(f"Failed to update comment {pk}: {e}")
            return Response(
                {"error": "Failed to update comment. Please try again."},
                status=HTTP_400_BAD_REQUEST,
            )

    def delete(self, request, pk):
        """Delete comment"""
        settings.LOGGER.warning(f"{request.user} is deleting comment (pk={pk})")
        try:
            comment = CommunicationService.get_comment(pk)

            # Check permission
            if not can_user_delete_comment(request.user, comment):
                logger.warning(
                    f"Unauthorized comment delete attempt by user {request.user.pk} "
                    f"on comment {comment.pk}"
                )
                return Response(
                    {"error": "You do not have permission to delete this comment."},
                    status=HTTP_403_FORBIDDEN,
                )

            CommunicationService.delete_comment(pk, request.user)
            return Response(status=HTTP_204_NO_CONTENT)
        except PermissionError as e:
            logger.error(f"Permission error deleting comment {pk}: {e}")
            return Response(
                {"detail": "You do not have permission to delete this comment."},
                status=HTTP_403_FORBIDDEN,
            )


class Reactions(APIView):
    """List and toggle reactions"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        List reactions with optional filtering

        Query parameters:
            - comment_id: Filter by comment ID
        """
        comment_id = request.query_params.get("comment_id")

        if comment_id:
            reactions = CommunicationService.list_reactions(comment_id=comment_id)
        else:
            reactions = CommunicationService.list_reactions()

        serializer = TinyReactionSerializer(reactions, many=True)
        return Response(serializer.data, status=HTTP_200_OK)

    def post(self, request):
        """Toggle reaction on comment"""
        settings.LOGGER.info(f"{request.user} is creating reaction")
        comment_id = request.data.get("comment")
        reaction_type = request.data.get("reaction")

        if not comment_id:
            return Response(
                {"error": "Comment ID required"}, status=HTTP_400_BAD_REQUEST
            )

        if not reaction_type:
            return Response(
                {"error": "Reaction type required"}, status=HTTP_400_BAD_REQUEST
            )

        # Get user from authenticated request
        if not request.user or not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"}, status=HTTP_401_UNAUTHORIZED
            )

        user_id = request.user.pk

        if not user_id:
            logger.error(f"User authenticated but pk is None: {request.user}")
            return Response({"error": "Invalid user"}, status=HTTP_400_BAD_REQUEST)

        try:
            # Get comment and project for permission check
            comment = CommunicationService.get_comment(comment_id)
            project = comment.document.project

            # Check permission
            if not can_user_comment(request.user, project):
                logger.warning(
                    f"Unauthorized reaction attempt by user {request.user.pk} "
                    f"on comment {comment.pk}"
                )
                return Response(
                    {
                        "error": "You do not have permission to react to comments on this project."
                    },
                    status=HTTP_403_FORBIDDEN,
                )

            reaction, was_deleted = CommunicationService.toggle_comment_reaction(
                user_id=user_id, comment_id=comment_id, reaction_type=reaction_type
            )

            if was_deleted:
                return Response(status=HTTP_204_NO_CONTENT)

            # Notify the comment's author that someone reacted. Best-effort:
            # never block or fail the reaction if the email can't be sent.
            try:
                from documents.services.notification_service import (
                    NotificationService,
                )

                NotificationService.notify_comment_reaction(
                    comment_id=comment_id,
                    reactor_data={
                        "id": user_id,
                        "name": (
                            f"{request.user.display_first_name} "
                            f"{request.user.display_last_name}"
                        ),
                    },
                    reaction_type=reaction_type,
                )
            except Exception as e:
                logger.error(
                    f"Failed to send reaction notification for comment "
                    f"{comment_id}: {e}"
                )

            serializer = TinyReactionSerializer(reaction)
            return Response(serializer.data, status=HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Failed to process reaction: {e}")
            return Response(
                {"error": "Failed to process reaction. Please try again."},
                status=HTTP_400_BAD_REQUEST,
            )


class ReactionDetail(APIView):
    """Get, update, and delete reaction"""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Get reaction detail"""
        reaction = CommunicationService.get_reaction(pk)
        serializer = ReactionSerializer(reaction)
        return Response(serializer.data, status=HTTP_200_OK)

    def put(self, request, pk):
        """Update reaction"""
        settings.LOGGER.info(f"{request.user} is updating reaction (pk={pk})")
        serializer = ReactionSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

        reaction = CommunicationService.update_reaction(
            pk, request.user, serializer.validated_data
        )
        result = TinyReactionSerializer(reaction)
        return Response(result.data, status=HTTP_202_ACCEPTED)

    def delete(self, request, pk):
        """Delete reaction"""
        settings.LOGGER.warning(f"{request.user} is deleting reaction (pk={pk})")
        CommunicationService.delete_reaction(pk, request.user)
        return Response(status=HTTP_204_NO_CONTENT)
