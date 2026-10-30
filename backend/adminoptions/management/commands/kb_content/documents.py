"""Documents & Approvals section — visible to all users."""

from .helpers import screenshot


def get_documents_articles():
    """Articles for the Documents section."""
    return [
        {
            "field_key": "documents-overview",
            "title": "Documents Overview",
            "order": 0,
            "description": (
                "<h2>Document Types by Project Kind</h2>"
                "<p>Each project type in SPMS has a specific set of documents. "
                "Not all project types use all document types:</p>"
                "<ul>"
                "<li><strong>Science Project:</strong> Concept Plan → Project Plan "
                "→ Progress Reports (annual) → Project Closure</li>"
                "<li><strong>Core Function:</strong> Concept Plan → Project Plan "
                "→ Progress Reports (annual) → Project Closure</li>"
                "<li><strong>Student Project:</strong> Student Reports (annual) "
                "→ Project Closure</li>"
                "<li><strong>External Partnership:</strong> Project Closure only</li>"
                "</ul>"
                f"{screenshot('Project detail page showing document tabs for a Science Project')}"
                "<h2>How Documents Work</h2>"
                "<p>Documents are edited directly in the browser using the rich text "
                "editor. Each document has multiple sections (fields) that you fill in. "
                "Click the pencil icon next to any section to open the editor, type your "
                "content, and click <strong>Save</strong>.</p>"
                "<p>Once all sections are complete, submit the document for approval. "
                "It will progress through the multi-level approval workflow.</p>"
            ),
        },
        {
            "field_key": "concept-plans",
            "title": "Concept Plans",
            "order": 1,
            "description": (
                "<h2>What is a Concept Plan?</h2>"
                "<p>A Concept Plan is the first document created for Science Projects "
                "and Core Functions. It outlines the project's objectives, methodology, "
                "and expected outcomes at a high level.</p>"
                "<p><strong>Applies to:</strong> Science Projects, Core Functions</p>"
                "<h2>Sections</h2>"
                "<p>A Concept Plan contains the following editable sections:</p>"
                "<ul>"
                "<li><strong>Background:</strong> Provide background context for the "
                "project (up to 500 words).</li>"
                "<li><strong>Aims:</strong> List the project aims (up to 500 words).</li>"
                "<li><strong>Expected Outcome:</strong> Summarise the expected outcome "
                "(up to 500 words).</li>"
                "<li><strong>Collaborations:</strong> List expected collaborations "
                "(up to 500 words).</li>"
                "<li><strong>Strategic Context:</strong> Describe the strategic context "
                "and management implications (up to 500 words).</li>"
                "<li><strong>Staff Time Allocation:</strong> Summarise staff time "
                "allocation by role for the first three years.</li>"
                "<li><strong>Budget:</strong> Indicate the operating budget for the "
                "first three years.</li>"
                "</ul>"
                f"{screenshot('Concept Plan tab showing editable sections with pencil icons')}"
                "<h2>Editing</h2>"
                "<p>Click the pencil icon next to any section to open the rich text "
                "editor. You can format text with bold, italic, lists, and links. "
                "Click <strong>Save</strong> when done. Your changes are saved "
                "immediately.</p>"
                "<h2>Approval</h2>"
                "<p>Once complete, submit the Concept Plan for approval. It will "
                "progress through: Project Lead → Business Area Lead → Directorate.</p>"
            ),
        },
        {
            "field_key": "project-plans",
            "title": "Project Plans",
            "order": 2,
            "description": (
                "<h2>What is a Project Plan?</h2>"
                "<p>A Project Plan provides detailed planning for the project. It is "
                "created after the Concept Plan is approved. Project Plans contain more "
                "detailed sections including methodology, tasks, and budget breakdowns.</p>"
                "<p><strong>Applies to:</strong> Science Projects, Core Functions</p>"
                "<h2>Sections</h2>"
                "<p>A Project Plan contains the following editable sections:</p>"
                "<ul>"
                "<li><strong>Background:</strong> Describe the project background "
                "including a literature review.</li>"
                "<li><strong>Aims:</strong> List the project aims.</li>"
                "<li><strong>Expected Outcome:</strong> Describe the expected project "
                "outcome.</li>"
                "<li><strong>Knowledge Transfer:</strong> Anticipated users of the "
                "knowledge to be gained, and technology transfer strategy.</li>"
                "<li><strong>Project Tasks:</strong> Major tasks, milestones, and "
                "outputs with delivery time frames for each task.</li>"
                "<li><strong>Methodology:</strong> Describe the study design and "
                "statistical analysis. You can also upload methodology images.</li>"
                "<li><strong>Related Projects:</strong> Search for related projects "
                "by title or tag (for example SP-2024-11) and add them to the list. "
                "Remove any that no longer apply. The list can be updated at any "
                "time, even after the plan is approved. Older plans may show text "
                "recorded before projects could be linked: add the projects it "
                "mentions to the list, then clear the text.</li>"
                "<li><strong>References:</strong> Bibliography of your literature "
                "research.</li>"
                "<li><strong>Operating Budget (DBCA):</strong> Estimated budget from "
                "consolidated DBCA funds.</li>"
                "<li><strong>Operating Budget (External):</strong> Estimated budget "
                "from external funds.</li>"
                "</ul>"
                f"{screenshot('Project Plan tab showing all editable sections')}"
                "<h2>Endorsements</h2>"
                "<p>Some Project Plans require endorsements before they can be fully "
                "approved. Endorsement types include:</p>"
                "<ul>"
                "<li><strong>AEC (Animal Ethics Committee):</strong> Required when "
                "the project involves animal research.</li>"
                "<li><strong>BM (Biometric):</strong> Required when the project "
                "involves biometric data collection.</li>"
                "<li><strong>HC (Heritage Council):</strong> Required when the project "
                "may affect heritage sites.</li>"
                "</ul>"
                "<p>Endorsement status is displayed on the Project Plan tab.</p>"
            ),
        },
        {
            "field_key": "progress-reports",
            "title": "Progress Reports",
            "order": 3,
            "description": (
                "<h2>What is a Progress Report?</h2>"
                "<p>Progress Reports are created annually for active projects. They "
                "document what was accomplished during the financial year and are "
                "compiled into the annual research activity report.</p>"
                "<p><strong>Applies to:</strong> Science Projects, Core Functions</p>"
                "<h2>Sections</h2>"
                "<p>A Progress Report contains the following editable sections:</p>"
                "<ul>"
                "<li><strong>Context:</strong> A shortened introduction or background "
                "for the annual activity update (aim for 100–150 words).</li>"
                "<li><strong>Aims:</strong> A bullet point list of aims for the annual "
                "activity update (aim for 100–150 words, one bullet per aim).</li>"
                "<li><strong>Progress:</strong> Current progress and achievements "
                "(aim for 100–150 words, one bullet per achievement).</li>"
                "<li><strong>Management Implications:</strong> Management implications "
                "(aim for 100–150 words, one bullet per implication).</li>"
                "<li><strong>Future Directions:</strong> Future directions "
                "(aim for 100–150 words, one bullet per direction).</li>"
                "</ul>"
                f"{screenshot('Progress Reports tab showing the current year report with editable sections')}"
                "<h2>Creating a Progress Report</h2>"
                "<p>Progress reports are created when a new reporting cycle is opened "
                "by an administrator. Navigate to the project's "
                "<strong>Progress Reports</strong> tab to see the current year's report.</p>"
                "<h2>Important Notes</h2>"
                "<ul>"
                "<li>Once the Directorate has approved a Progress Report, the editors "
                "are locked and no further changes can be made.</li>"
                "<li>Progress reports are tied to a specific financial year.</li>"
                "<li>The content you write here appears directly in the annual report.</li>"
                "</ul>"
            ),
        },
        {
            "field_key": "student-reports",
            "title": "Student Reports",
            "order": 4,
            "description": (
                "<h2>What is a Student Report?</h2>"
                "<p>Student Reports are specific to Student Projects. They document "
                "the student's progress and are submitted annually.</p>"
                "<p><strong>Applies to:</strong> Student Projects only</p>"
                "<h2>Sections</h2>"
                "<p>A Student Report contains:</p>"
                "<ul>"
                "<li><strong>Progress Report:</strong> Report progress made this year "
                "(maximum 150 words).</li>"
                "</ul>"
                "<p>The editing and approval process follows the same pattern as "
                "Progress Reports.</p>"
                f"{screenshot('Student Reports tab showing the current year report')}"
            ),
        },
        {
            "field_key": "project-closures",
            "title": "Project Closures",
            "order": 5,
            "description": (
                "<h2>What is a Project Closure?</h2>"
                "<p>When a project is complete, a Project Closure document must be "
                "submitted. This summarises the project's outcomes and final status.</p>"
                "<p><strong>Applies to:</strong> All project types</p>"
                "<h2>Sections</h2>"
                "<p>A Project Closure contains the following sections:</p>"
                "<ul>"
                "<li><strong>Intended Outcome:</strong> Select whether the project was "
                "completed with a final update or terminated.</li>"
                "<li><strong>Reason:</strong> Reason for closure, provided by the "
                "project team and/or programme leader.</li>"
                "<li><strong>Scientific Outputs:</strong> List key publications and "
                "documents.</li>"
                "<li><strong>Knowledge Transfer:</strong> List knowledge transfer "
                "achievements.</li>"
                "<li><strong>Data Location:</strong> Links to all datasets on the "
                "internal data portal.</li>"
                "<li><strong>Hardcopy Location:</strong> Location of any physical "
                "records.</li>"
                "</ul>"
                f"{screenshot('Project Closure tab showing closure form sections')}"
                "<h2>Closure by Project Type</h2>"
                "<ul>"
                "<li><strong>Science Projects:</strong> Require a full closure form "
                "with all sections completed and approved through the workflow.</li>"
                "<li><strong>Core Functions:</strong> Require a closure form but with "
                "immediate approval.</li>"
                "<li><strong>Student Projects and External Partnerships:</strong> Can "
                "be closed immediately without a closure form.</li>"
                "</ul>"
            ),
        },
        {
            "field_key": "approval-workflow",
            "title": "The Approval Workflow",
            "order": 6,
            "description": (
                "<h2>How Approval Works</h2>"
                "<p>Documents in SPMS follow a multi-stage approval workflow. Each "
                "document progresses through these stages:</p>"
                "<ol>"
                "<li><strong>Draft:</strong> The document is being edited by the "
                "project team. Any team member with edit permissions can contribute.</li>"
                "<li><strong>Team Review:</strong> Team members review the document "
                "before it is submitted to the project lead.</li>"
                "<li><strong>Project Lead Approval:</strong> The project lead reviews "
                "and approves the document.</li>"
                "<li><strong>Business Area Lead Approval:</strong> The business area "
                "lead reviews and endorses the document.</li>"
                "<li><strong>Directorate Approval:</strong> The directorate gives "
                "final approval. Once approved at this level, the document is "
                "finalised and locked.</li>"
                "</ol>"
                f"{screenshot('Document tab showing approval status and available actions')}"
                "<h2>Available Actions</h2>"
                "<ul>"
                "<li><strong>Submit for Approval:</strong> Send the document to the "
                "next stage in the workflow.</li>"
                "<li><strong>Approve:</strong> Move the document forward (available "
                "to the person at the current approval stage).</li>"
                "<li><strong>Recall:</strong> Pull the document back to your stage "
                "for further editing. Use this if you submitted too early.</li>"
                "<li><strong>Send Back:</strong> Return the document to the previous "
                "stage with feedback explaining what needs to change.</li>"
                "</ul>"
                "<h2>Email Notifications</h2>"
                "<p>SPMS sends email notifications at each stage of the workflow — "
                "when a document is submitted, approved, recalled, or sent back. "
                "This keeps everyone informed without needing to check the system "
                "constantly.</p>"
                "<h2>Document Status Indicators</h2>"
                "<p>On the project detail page, each document tab shows a status "
                "indicator:</p>"
                "<ul>"
                "<li><strong>Green tick:</strong> The document has been fully approved.</li>"
                "<li><strong>Orange alert:</strong> The document needs attention "
                "(pending approval or revision).</li>"
                "</ul>"
                "<h2>Generating PDFs</h2>"
                "<p>Click <strong>Generate PDF</strong> on any document to create a "
                "downloadable PDF. Once generated, click <strong>Download PDF</strong> "
                "to save it to your device.</p>"
                f"{screenshot('Document with Generate PDF and Download PDF buttons')}"
            ),
        },
    ]
