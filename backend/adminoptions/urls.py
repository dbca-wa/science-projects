from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

# Create a router for ViewSet-based views (without root URL)
router = DefaultRouter(trailing_slash=False)
router.register(r"guide-sections", views.GuideSectionViewSet, basename="guide-sections")
router.register(r"content-fields", views.ContentFieldViewSet, basename="content-fields")

urlpatterns = [
    # Your existing URLs (must come before router to avoid conflicts)
    # Using "list" instead of "" to avoid trailing slash
    path("list", views.AdminControls.as_view()),
    path("<int:pk>", views.AdminControlsDetail.as_view()),
    # Fixed URL for guide content updates
    path(
        "<int:pk>/update_guide_content",
        views.AdminControlsGuideContentUpdate.as_view(),
    ),
    path("maintainer", views.GetMaintainer.as_view()),
    # Admin Tasks ========================================================
    path("tasks", views.AdminTasks.as_view()),
    path("tasks/pending", views.PendingTasks.as_view()),
    path("tasks/check/<int:pk>", views.CheckPendingCaretakerRequestForUser.as_view()),
    path("tasks/<int:pk>", views.AdminTaskDetail.as_view()),
    # Caretaker (DEPRECATED - use /api/v1/caretakers/ instead) ===========
    path("caretakers/", include("caretakers.urls_compat")),
    # Functions on approval of tasks =====================================
    path("tasks/<int:pk>/approve", views.ApproveTask.as_view()),
    path("tasks/<int:pk>/reject", views.RejectTask.as_view()),
    path("tasks/<int:pk>/cancel", views.CancelTask.as_view()),
    path("tasks/<int:pk>/respond", views.RespondToCaretakerRequest.as_view()),
    # Misc (Admin) ======================================================
    path("send-all-test-emails", views.SendAllTestEmails.as_view()),
    path("mergeusers", views.MergeUsers.as_view()),
    path("mergeusers/preview/<int:pk>", views.MergeUserPreview.as_view()),
    path("new-cycle-draft", views.NewCycleDraft.as_view()),
    path("homepage-banner", views.HomepageBannerSettings.as_view()),
    path("send-announcement", views.SendAnnouncement.as_view()),
    path("announcement-email-preview", views.AnnouncementEmailPreview.as_view()),
    path("email-records", views.EmailRecordList.as_view()),
    path("email-records/<int:pk>", views.EmailRecordDetail.as_view()),
    # Include the router URLs at the end to avoid conflicts
    path("", include(router.urls)),
]
