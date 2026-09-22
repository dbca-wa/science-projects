# region IMPORTS ====================================================================================================
from rest_framework import serializers

from adminoptions.models import (
    AdminOptions,
    AdminTask,
    ContentField,
    EmailRecord,
    GuideSection,
)
from medias.serializers import UserAvatarSerializer
from projects.models import Project
from users.models import User
from users.serializers import MiniUserSerializer
from users.utils.helpers import get_user_display_name

# endregion  =================================================================================================

# region Guide Section Serializers ==========================================================================


class ContentFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContentField
        fields = ["id", "title", "field_key", "description", "section", "order"]


class GuideSectionSerializer(serializers.ModelSerializer):
    content_fields = ContentFieldSerializer(many=True, read_only=True)

    class Meta:
        model = GuideSection
        fields = [
            "id",
            "title",
            "description",
            "icon",
            "required_role",
            "order",
            "show_divider_after",
            "category",
            "is_active",
            "content_fields",
        ]


class ContentFieldCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContentField
        fields = ["id", "title", "field_key", "description", "order"]
        extra_kwargs = {"id": {"read_only": True}}


class GuideSectionCreateUpdateSerializer(serializers.ModelSerializer):
    content_fields = ContentFieldCreateSerializer(many=True)

    class Meta:
        model = GuideSection
        fields = [
            "id",
            "title",
            "description",
            "icon",
            "required_role",
            "order",
            "show_divider_after",
            "category",
            "is_active",
            "content_fields",
        ]

    def create(self, validated_data):
        content_fields_data = validated_data.pop("content_fields", [])
        section = GuideSection.objects.create(**validated_data)

        for field_data in content_fields_data:
            ContentField.objects.create(section=section, **field_data)

        return section

    def update(self, instance, validated_data):
        content_fields_data = validated_data.pop("content_fields", [])

        # Update section fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Get existing fields by id and field_key for easy lookup
        existing_fields_by_id = {
            str(field.id): field for field in instance.content_fields.all()
        }
        existing_fields_by_key = {
            field.field_key: field for field in instance.content_fields.all()
        }
        kept_fields = []

        # Update or create content fields
        for field_data in content_fields_data:
            field_id = field_data.get("id")
            field_key = field_data.get("field_key")

            # Case 1: Field has an ID and exists - update it
            if field_id and field_id in existing_fields_by_id:
                field = existing_fields_by_id[field_id]
                for attr, value in field_data.items():
                    if attr != "id":
                        setattr(field, attr, value)
                field.save()
                kept_fields.append(str(field.id))

            # Case 2: Field has no ID but key exists - update existing field
            elif not field_id and field_key in existing_fields_by_key:
                field = existing_fields_by_key[field_key]
                for attr, value in field_data.items():
                    if attr != "id":
                        setattr(field, attr, value)
                field.save()
                kept_fields.append(str(field.id))

            # Case 3: New field - create it
            else:
                # Make sure we have a unique field_key if auto-generated ones are being used
                if field_key and field_key in existing_fields_by_key:
                    # If duplicate key, append a unique suffix
                    base_key = field_key
                    suffix = 1
                    while field_key in existing_fields_by_key:
                        field_key = f"{base_key}_{suffix}"
                        suffix += 1
                    field_data["field_key"] = field_key

                new_field = ContentField.objects.create(section=instance, **field_data)
                kept_fields.append(str(new_field.id))

        # Delete any fields not included in the update
        # for field_id in existing_fields_by_id:
        #     if field_id not in kept_fields:
        #         existing_fields_by_id[field_id].delete()

        return instance


# endregion  =================================================================================================

# region Admin Options Serializers ==========================================================================


class AdminOptionsMaintainerSerializer(serializers.ModelSerializer):
    maintainer = MiniUserSerializer()

    class Meta:
        model = AdminOptions
        fields = ["maintainer"]


class AdminOptionsCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating AdminOptions with writable maintainer field"""

    maintainer = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    email_test_user = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = AdminOptions
        fields = (
            "id",
            "email_options",
            "maintainer",
            "email_testing_mode",
            "email_test_user",
            "guide_content",
            "show_homepage_message",
            "homepage_message",
            # Legacy fields - keep for backward compatibility
            "guide_admin",
            "guide_about",
            "guide_login",
            "guide_profile",
            "guide_user_creation",
            "guide_user_view",
            "guide_project_creation",
            "guide_project_view",
            "guide_project_team",
            "guide_documents",
            "guide_report",
        )


class AdminOptionsSerializer(serializers.ModelSerializer):
    maintainer = MiniUserSerializer(read_only=True)
    email_test_user = MiniUserSerializer(read_only=True)
    guide_sections = serializers.SerializerMethodField()

    class Meta:
        model = AdminOptions
        fields = (
            "id",
            "created_at",
            "updated_at",
            "email_options",
            "maintainer",
            "email_testing_mode",
            "email_test_user",
            "guide_content",
            "show_homepage_message",
            "homepage_message",
            "guide_sections",
            # Legacy fields - keep for backward compatibility
            "guide_admin",
            "guide_about",
            "guide_login",
            "guide_profile",
            "guide_user_creation",
            "guide_user_view",
            "guide_project_creation",
            "guide_project_view",
            "guide_project_team",
            "guide_documents",
            "guide_report",
        )

    def get_guide_sections(self, obj):
        """Return active guide sections with their content fields"""
        sections = (
            GuideSection.objects.filter(is_active=True)
            .prefetch_related("content_fields")
            .order_by("order")
        )
        return GuideSectionSerializer(sections, many=True).data


# endregion  =================================================================================================

# region Admin Task Serializers =============================================================================


class IAdminTaskRequesterSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="pk", read_only=True)
    image = UserAvatarSerializer(source="avatar")

    class Meta:
        model = User
        fields = ["id", "display_first_name", "display_last_name", "email", "image"]


class AdminTaskRequestCreationSerializer(serializers.ModelSerializer):

    requester = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())

    class Meta:
        model = AdminTask
        fields = "__all__"


class IAdminTaskProjectSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="pk", read_only=True)

    class Meta:
        model = Project
        fields = ["id", "title"]


class SecondaryUserSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="pk", read_only=True)
    image = UserAvatarSerializer(source="avatar")

    class Meta:
        model = User
        fields = ["id", "display_first_name", "display_last_name", "email", "image"]


class AdminTaskSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(
        source="pk", read_only=True
    )  # Explicitly use 'id' for consistency
    requester = IAdminTaskRequesterSerializer()
    primary_user = SecondaryUserSerializer()
    project = IAdminTaskProjectSerializer()
    secondary_users = serializers.SerializerMethodField()

    class Meta:
        model = AdminTask
        fields = "__all__"

    def get_secondary_users(self, obj):
        if obj.secondary_users:
            users = User.objects.filter(pk__in=obj.secondary_users)
            return SecondaryUserSerializer(users, many=True).data
        return []


# Import CaretakerSerializer from the new caretakers app

# endregion  =================================================================================================

# region Email Record Serializers ===========================================================================


class EmailRecordListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the email history list (no body content)."""

    initiator_name = serializers.SerializerMethodField()
    recipient_count = serializers.SerializerMethodField()

    class Meta:
        model = EmailRecord
        fields = [
            "id",
            "kind",
            "subject",
            "initiator_name",
            "recipient_count",
            "emails_sent",
            "recipient_groups",
            "is_test",
            "created_at",
        ]

    def get_initiator_name(self, obj):
        return get_user_display_name(obj.initiator) if obj.initiator else "Unknown"

    def get_recipient_count(self, obj):
        return len(obj.recipients or [])


class EmailRecordDetailSerializer(EmailRecordListSerializer):
    """Full serializer for previewing a stored email, including body content."""

    class Meta(EmailRecordListSerializer.Meta):
        fields = EmailRecordListSerializer.Meta.fields + [
            "body",
            "group_messages",
            "recipients",
        ]


# endregion  =================================================================================================
