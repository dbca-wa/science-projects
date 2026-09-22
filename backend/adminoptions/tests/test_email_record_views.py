"""
Tests for the EmailRecord list and detail API endpoints.

Covers:
- Admin access; non-admin denial
- List excludes body; detail includes body/recipients
- kind filter
- Pagination shape
- 404 on missing detail
"""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from adminoptions.models import EmailRecord
from common.tests.factories import UserFactory

LIST_URL = "/api/v1/adminoptions/email-records"


@pytest.fixture
def superuser(db):
    return UserFactory(
        username="superadmin",
        email="superadmin@dbca.wa.gov.au",
        is_superuser=True,
        is_staff=True,
    )


@pytest.fixture
def non_staff_user(db):
    return UserFactory(
        username="external",
        email="external@dbca.wa.gov.au",
        is_superuser=False,
        is_staff=False,
    )


@pytest.fixture
def announcement_record(db, superuser):
    return EmailRecord.objects.create(
        kind=EmailRecord.EmailKind.ANNOUNCEMENT,
        subject="An announcement",
        initiator=superuser,
        emails_sent=2,
        recipient_groups=["ba_leads"],
        recipients=[
            {
                "pk": superuser.pk,
                "name": "Super Admin",
                "email": "superadmin@dbca.wa.gov.au",
                "group": "ba_leads",
            }
        ],
        body="<p>Body content</p>",
    )


@pytest.fixture
def cycle_record(db, superuser):
    return EmailRecord.objects.create(
        kind=EmailRecord.EmailKind.NEW_CYCLE,
        subject="New cycle",
        initiator=superuser,
        emails_sent=5,
        recipient_groups=["ba_leads", "project_leads"],
        recipients=[],
        body="<p>Cycle body</p>",
    )


@pytest.fixture
def test_record(db, superuser):
    return EmailRecord.objects.create(
        kind=EmailRecord.EmailKind.ANNOUNCEMENT,
        subject="A test announcement",
        initiator=superuser,
        emails_sent=2,
        recipient_groups=["ba_leads"],
        recipients=[],
        body="<p>Test body</p>",
        is_test=True,
    )


@pytest.mark.django_db
class TestEmailRecordListView:
    def test_admin_can_list(self, superuser, announcement_record):
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.get(LIST_URL)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_results"] == 1
        assert response.data["current_page"] == 1
        assert len(response.data["results"]) == 1

    def test_non_admin_denied(self, non_staff_user, announcement_record):
        client = APIClient()
        client.force_authenticate(user=non_staff_user)
        response = client.get(LIST_URL)

        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

    def test_list_excludes_body(self, superuser, announcement_record):
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.get(LIST_URL)

        row = response.data["results"][0]
        assert "body" not in row
        assert "recipient_count" in row
        assert row["recipient_count"] == 1
        assert row["initiator_name"] != "Unknown"
        assert row["is_test"] is False

    def test_kind_filter(self, superuser, announcement_record, cycle_record):
        client = APIClient()
        client.force_authenticate(user=superuser)

        response = client.get(f"{LIST_URL}?kind=new_cycle")
        assert response.data["total_results"] == 1
        assert response.data["results"][0]["kind"] == "new_cycle"

        response = client.get(f"{LIST_URL}?kind=announcement")
        assert response.data["total_results"] == 1
        assert response.data["results"][0]["kind"] == "announcement"

    def test_pagination(self, superuser):
        for i in range(15):
            EmailRecord.objects.create(
                kind=EmailRecord.EmailKind.ANNOUNCEMENT,
                subject=f"Email {i}",
                initiator=superuser,
                emails_sent=1,
            )

        client = APIClient()
        client.force_authenticate(user=superuser)

        response = client.get(f"{LIST_URL}?page=1&page_size=10")
        assert response.data["total_results"] == 15
        assert response.data["total_pages"] == 2
        assert len(response.data["results"]) == 10

        response = client.get(f"{LIST_URL}?page=2&page_size=10")
        assert len(response.data["results"]) == 5

    def test_empty_list(self, superuser):
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.get(LIST_URL)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_results"] == 0
        assert response.data["results"] == []


@pytest.mark.django_db
class TestEmailRecordTestFilter:
    """Tests for the is_test query-param filter on the list endpoint."""

    def test_default_excludes_test_records(
        self, superuser, announcement_record, test_record
    ):
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.get(LIST_URL)

        assert response.data["total_results"] == 1
        assert response.data["results"][0]["is_test"] is False

    def test_is_test_true_returns_only_test_records(
        self, superuser, announcement_record, test_record
    ):
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.get(f"{LIST_URL}?is_test=true")

        assert response.data["total_results"] == 1
        assert response.data["results"][0]["is_test"] is True

    def test_is_test_all_returns_both(
        self, superuser, announcement_record, test_record
    ):
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.get(f"{LIST_URL}?is_test=all")

        assert response.data["total_results"] == 2


@pytest.mark.django_db
class TestEmailRecordDetailView:
    def test_detail_includes_body_and_recipients(self, superuser, announcement_record):
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.get(f"{LIST_URL}/{announcement_record.pk}")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["body"] == "<p>Body content</p>"
        assert "recipients" in response.data
        assert len(response.data["recipients"]) == 1

    def test_detail_non_admin_denied(self, non_staff_user, announcement_record):
        client = APIClient()
        client.force_authenticate(user=non_staff_user)
        response = client.get(f"{LIST_URL}/{announcement_record.pk}")

        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

    def test_detail_404_when_missing(self, superuser):
        client = APIClient()
        client.force_authenticate(user=superuser)
        response = client.get(f"{LIST_URL}/999999")

        assert response.status_code == status.HTTP_404_NOT_FOUND
