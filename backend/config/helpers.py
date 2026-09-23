import base64
import os

from django.conf import settings


def get_logo_url():
    """Returns the public URL for the DBCA logo image."""
    return f"{settings.SITE_URL}/static/images/dbca.png"


def get_ar_logo_url():
    """Returns the public URL for the BCS Transparent logo image."""
    return f"{settings.SITE_URL}/static/images/BCSTransparent.png"


def _get_encoded_image_legacy():
    """
    Legacy: Encodes the DBCA logo image as a base64 string for email embedding.
    Tries multiple locations with logs in case not found.
    Kept for reference — prefer get_logo_url() for hosted image URLs.
    """
    import base64
    import os

    # List of possible image paths to try
    possible_paths = [
        os.path.join(settings.BASE_DIR, "documents", "dbca.jpg"),
        os.path.join(settings.BASE_DIR, "dbca.jpg"),
        os.path.join(settings.BASE_DIR, "staticfiles", "images", "dbca.jpg"),
    ]

    for image_path in possible_paths:
        try:
            settings.LOGGER.info(f"Trying image path: {image_path}")

            if os.path.exists(image_path):
                settings.LOGGER.info(f"Found image at: {image_path}")

                with open(image_path, "rb") as img:
                    encoded_image = base64.b64encode(img.read()).decode("utf-8")

                    # Validate the encoded image
                    if len(encoded_image) > 0:
                        data_url = f"data:image/jpeg;base64,{encoded_image}"
                        settings.LOGGER.info(
                            f"Successfully encoded image from {image_path} (size: {len(data_url)} chars)"
                        )
                        return data_url
                    else:
                        settings.LOGGER.warning(
                            f"Encoded image from {image_path} is empty"
                        )
                        continue  # Try next path
            else:
                settings.LOGGER.info(f"Image not found at: {image_path}")

        except Exception as e:
            settings.LOGGER.error(f"Error processing image at {image_path}: {e}")
            continue  # Try next path

    # If we get here, no image was found at any location
    settings.LOGGER.error(
        "Could not find DBCA logo image at any of the expected locations:"
    )
    for path in possible_paths:
        settings.LOGGER.error(f"  - {path}")

    return ""


def send_email_with_embedded_image(
    recipient_email, subject, html_content, from_email=None
):
    """
    Send an email with CID-attached inline images.

    All emails pass through this function, which:
    1. Checks AdminOptions for testing mode (redirects recipients when active)
    2. Deduplicates mass emails in testing mode (test user receives one per subject)
    3. Attaches the DBCA logo as a CID inline image so templates can use src="cid:dbca-logo"

    :param recipient_email: Email address of the recipient
    :param subject: Email subject line
    :param html_content: HTML content of the email
    :param from_email: Sender's email (defaults to settings.DEFAULT_FROM_EMAIL)
    """
    from email.mime.image import MIMEImage

    # Track test mode state for final logging
    is_test_mode = False
    test_mode_user = None
    original_recipients = None

    # Check testing mode before sending
    try:
        from adminoptions.models import AdminOptions

        admin_opts = AdminOptions.objects.first()
        if admin_opts and admin_opts.email_testing_mode and admin_opts.email_test_user:
            is_test_mode = True
            test_email = admin_opts.email_test_user.email
            test_mode_user = (
                f"{admin_opts.email_test_user.display_first_name} "
                f"{admin_opts.email_test_user.display_last_name} "
                f"({test_email})"
            )
            original_recipients = recipient_email
            recipient_email = [test_email]

            # Deduplicate: skip if we already sent this subject to the test user recently
            # Sanitise cache key — spaces/colons cause memcached warnings
            import hashlib

            from django.core.cache import cache

            safe_subject = hashlib.md5(
                subject.encode(), usedforsecurity=False
            ).hexdigest()
            dedup_key = f"test_email_dedup_{safe_subject}"
            if cache.get(dedup_key):
                settings.LOGGER.info(
                    f"[TEST MODE] Skipping duplicate email '{subject}' "
                    f"(original: {original_recipients}, test user: {test_mode_user})"
                )
                return
            cache.set(dedup_key, True, timeout=30)  # 30-second dedup window

            # Prefix with [TEST], but only once — some callers (e.g. the
            # announcement test-send flow) already prefix the subject.
            if not subject.startswith("[TEST]"):
                subject = f"[TEST] {subject}"
            # Add test mode banner to the HTML content
            original_str = (
                ", ".join(original_recipients)
                if isinstance(original_recipients, list)
                else original_recipients
            )
            test_banner = (
                '<table width="100%" cellpadding="0" cellspacing="0" border="0" '
                'style="margin-bottom:24px;">'
                "<tr><td>"
                # Outer container — dark with amber bottom accent
                '<div style="'
                "background:#1e293b;"
                "border-radius:8px;"
                "border-bottom:4px solid #f59e0b;"
                "padding:20px 24px;"
                "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"
                '">'
                # Top row: icon + badge + message
                '<table cellpadding="0" cellspacing="0" border="0" width="100%">'
                "<tr>"
                # Warning icon — amber to be visible on dark bg
                '<td style="vertical-align:top;width:24px;padding-right:14px;">'
                '<span style="font-size:20px;line-height:1;color:#f59e0b;">&#9888;</span>'
                "</td>"
                '<td style="vertical-align:top;">'
                # Badge
                '<span style="'
                "display:inline-block;"
                "background:#f59e0b;"
                "color:#1e293b;"
                "font-size:10px;"
                "font-weight:800;"
                "letter-spacing:1px;"
                "text-transform:uppercase;"
                "padding:2px 8px;"
                "border-radius:3px;"
                "margin-bottom:8px;"
                '">'
                "Test Mode"
                "</span>"
                # Main message
                '<p style="'
                "color:#f1f5f9;"
                "font-size:14px;"
                "font-weight:500;"
                "line-height:22px;"
                "margin:8px 0 0 0;"
                '">'
                'This email was <strong style="color:#fbbf24;">redirected</strong> '
                "and not delivered to the original recipient."
                "</p>"
                "</td>"
                "</tr>"
                "</table>"
                # Divider
                '<div style="border-top:1px solid #334155;margin:14px 0 12px 0;"></div>'
                # Details rows — original recipient first, delivered to second
                '<table cellpadding="0" cellspacing="0" border="0" width="100%" '
                'style="font-size:13px;line-height:20px;">'
                "<tr>"
                '<td style="color:#64748b;padding:3px 0;width:130px;vertical-align:top;">'
                "Original recipient</td>"
                '<td style="color:#e2e8f0;padding:3px 0;font-weight:600;">'
                f"{original_str}</td>"
                "</tr>"
                "<tr>"
                '<td style="color:#64748b;padding:3px 0;width:130px;vertical-align:top;">'
                "Delivered to</td>"
                '<td style="color:#e2e8f0;padding:3px 0;font-weight:600;">'
                f"{test_email}</td>"
                "</tr>"
                "</table>"
                "</div>"
                "</td></tr>"
                "</table>"
            )
            # Insert banner after <body> tag or at the start of content
            if "<body" in html_content:
                html_content = html_content.replace("<body>", f"<body>{test_banner}", 1)
                # Handle body with attributes (e.g. <body style="...">)
                if test_banner not in html_content:
                    body_start = html_content.find("<body")
                    if body_start != -1:
                        body_close = html_content.find(">", body_start)
                        if body_close != -1:
                            html_content = (
                                html_content[: body_close + 1]
                                + test_banner
                                + html_content[body_close + 1 :]
                            )
            else:
                html_content = test_banner + html_content
            settings.LOGGER.info(
                f"[TEST MODE] Redirecting '{subject}' — "
                f"original: {', '.join(original_recipients) if isinstance(original_recipients, list) else original_recipients} "
                f"→ test user: {test_mode_user}"
            )
    except Exception as e:
        settings.LOGGER.error(f"Error checking email testing mode: {e}")

    # Use default from email if not provided
    if from_email is None:
        from_email = settings.DEFAULT_FROM_EMAIL

    # Build the email with correct MIME nesting for CID images.
    #
    # The correct structure for HTML emails with inline images is:
    #   multipart/related (root)
    #     ├── multipart/alternative
    #     │     ├── text/plain
    #     │     └── text/html
    #     └── image/png (CID attachment)
    #
    # Django's EmailMultiAlternatives with mixed_subtype="related" produces
    # a flat structure that some email clients (Outlook) don't handle correctly.
    # Instead, we build the message manually using Python's email library to
    # ensure proper nesting.
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    # Root: multipart/related
    msg_root = MIMEMultipart("related")
    msg_root["Subject"] = subject
    msg_root["From"] = from_email
    msg_root["To"] = (
        ", ".join(recipient_email)
        if isinstance(recipient_email, list)
        else recipient_email
    )
    msg_root.preamble = "This is a multi-part message in MIME format."

    # Alternative part: contains plain text and HTML
    msg_alternative = MIMEMultipart("alternative")
    msg_root.attach(msg_alternative)

    # Plain text fallback
    msg_text = MIMEText(
        "Please view this email in an HTML-compatible email client.",
        "plain",
        "utf-8",
    )
    msg_alternative.attach(msg_text)

    # HTML content
    msg_html = MIMEText(html_content, "html", "utf-8")
    msg_alternative.attach(msg_html)

    # Attach the DBCA logo as an inline CID image (sibling of alternative part)
    logo_path = os.path.join(
        settings.BASE_DIR, "documents", "static", "images", "dbca_email.png"
    )
    if os.path.exists(logo_path):
        with open(logo_path, "rb") as f:
            logo_img = MIMEImage(f.read(), _subtype="png")
            logo_img.add_header("Content-ID", "<dbca-logo>")
            logo_img.add_header("Content-Disposition", "inline", filename="dbca.png")
            msg_root.attach(logo_img)
    else:
        settings.LOGGER.warning(f"DBCA logo not found at {logo_path}")

    # Send via SMTP directly (bypasses Django's email backend abstraction
    # to ensure the MIME structure is preserved exactly as built).
    # In console mode (local dev), log instead of sending.
    try:
        backend = getattr(settings, "EMAIL_BACKEND", "")
        is_console = "console" in backend

        if is_console:
            # In console/dev mode, just log the message details
            settings.LOGGER.info(
                f"[CONSOLE MODE] Would send email: Subject='{subject}', "
                f"To={msg_root['To']}"
            )
        else:
            email_host = getattr(settings, "EMAIL_HOST", "mail-relay.lan.fyi")
            email_port = getattr(settings, "EMAIL_PORT", 587)

            with smtplib.SMTP(email_host, email_port) as smtp:
                smtp.send_message(msg_root)
    except Exception as e:
        settings.LOGGER.error(f"Failed to send email via SMTP: {e}", exc_info=True)
        raise

    # Summary log
    backend = getattr(settings, "EMAIL_BACKEND", "")
    is_console = "console" in backend
    recipients_str = (
        ", ".join(recipient_email)
        if isinstance(recipient_email, list)
        else recipient_email
    )

    if is_console and is_test_mode:
        settings.LOGGER.info(
            f"[CONSOLE + TEST MODE] Email rendered to terminal (not sent). "
            f"Subject: '{subject}' | "
            f"Original recipient: {', '.join(original_recipients) if isinstance(original_recipients, list) else original_recipients} | "
            f"Redirected to test user: {test_mode_user}"
        )
    elif is_console:
        settings.LOGGER.info(
            f"[CONSOLE] Email rendered to terminal (not sent). "
            f"Subject: '{subject}' | Recipient: {recipients_str}"
        )
    elif is_test_mode:
        settings.LOGGER.info(
            f"[TEST MODE] Email SENT to test user {test_mode_user} "
            f"(original recipient: {', '.join(original_recipients) if isinstance(original_recipients, list) else original_recipients}). "
            f"Subject: '{subject}'"
        )
    else:
        settings.LOGGER.info(
            f"[LIVE] Email sent. Subject: '{subject}' | Recipient: {recipients_str}"
        )


def _get_encoded_ar_dbca_image_legacy():
    """
    Legacy: Encodes the BCS Transparent logo as base64 for email embedding.
    Kept for reference — prefer get_ar_logo_url() for hosted image URLs.
    """
    # Find the path to the image using Django's staticfiles finders
    image_path = os.path.join(settings.BASE_DIR, "documents", "BCSTransparent.png")
    settings.LOGGER.info(f"AR DBCA IMAGE PATH: {image_path}")
    if image_path and os.path.exists(image_path):
        with open(image_path, "rb") as image_file:
            image_data = image_file.read()
            image_encoded = base64.b64encode(image_data).decode("utf-8")
            return f"data:image/png;base64,{image_encoded}"
    else:
        return None
