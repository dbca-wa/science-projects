"""
Document edit exception serializers
"""

from rest_framework import serializers

from users.models import User

from ..models import DocumentEditException


class EditExceptionUserSerializer(serializers.ModelSerializer):
    """Compact user representation for edit exception rows and eligibility."""

    name = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()

    def get_name(self, obj):
        first = obj.display_first_name or obj.first_name or ""
        last = obj.display_last_name or obj.last_name or ""
        full = f"{first} {last}".strip()
        return full or obj.username

    def get_image(self, obj):
        avatar = getattr(obj, "avatar", None)
        if avatar and getattr(avatar, "file", None):
            return avatar.file.url
        return None

    class Meta:
        model = User
        fields = (
            "id",
            "display_first_name",
            "display_last_name",
            "name",
            "email",
            "image",
        )


class DocumentEditExceptionSerializer(serializers.ModelSerializer):
    """Serialiser for an edit exception, used in list and create responses."""

    user = EditExceptionUserSerializer(read_only=True)
    granted_by = EditExceptionUserSerializer(read_only=True)
    is_active = serializers.SerializerMethodField()

    def get_is_active(self, obj):
        return obj.is_active()

    class Meta:
        model = DocumentEditException
        fields = (
            "id",
            "document",
            "user",
            "granted_by",
            "expires_at",
            "created_at",
            "is_active",
        )
