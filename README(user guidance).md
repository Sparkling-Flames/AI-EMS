# AI-EMS

AI-EMS is a Uniapp + UniCloud proof-of-concept for an AI-enhanced educational management system. It focuses on role-based access, leave-to-attendance workflow, anonymous course evaluation, academic planning, profile-review workflows, course materials, location check-in, and local knowledge-base retrieval.

## User Manual

This manual explains how to install, operate, and use AI-EMS for demonstration or development.

## 1. System Requirements

- HBuilderX with Uniapp and UniCloud support
- Aliyun UniCloud service space for cloud-function and database testing
- Node.js and npm, only required if you want to use the optional local H5 preview script
- A modern browser for H5 preview

AI-EMS is primarily an HBuilderX project. HBuilderX is the recommended way to run, preview, and upload the application.

## 2. Project Installation

1. Download or clone the project.
2. Open the project root folder in HBuilderX.
3. Confirm that the project contains these important directories:
   - `src/`: frontend source code
   - `src/pages/`: login, dashboard, leave, evaluation, material, assistant, and admin pages
   - `src/common/api.js`: unified cloud-function caller and local fallback data
   - `src/common/session.js`: login session storage, role checks, and dashboard routing
   - `uniCloud-aliyun/cloudfunctions/`: UniCloud cloud functions
   - `uniCloud-aliyun/database/`: database schemas and import data
4. If you want to use the optional command-line H5 preview, install dependencies:

```bash
npm install
```

The normal HBuilderX workflow does not require a separate CLI build step.

## 3. UniCloud Setup

Use this setup when you want login, database-backed workflows, cloud functions, and persistent data.

1. Open the project in HBuilderX.
2. Link the project to an Aliyun UniCloud service space.
3. Upload each cloud function under `uniCloud-aliyun/cloudfunctions/`:
   - `auth-login`
   - `get-dashboard-data`
   - `submit-leave`
   - `review-leave`
   - `submit-evaluation`
   - `get-evaluation-summary`
   - `ask-assistant`
   - Other functions present in the folder, such as course material, attendance, profile, or AI-history helpers
4. In the UniCloud console, create or import the collections from `uniCloud-aliyun/database/*.schema.json`.
5. Import seed data from `uniCloud-aliyun/database/import/`.
6. Import account and role data from `uniCloud-aliyun/database/import/user_data/`.
7. Confirm that the `users` collection contains active users with valid `password_hash` values.

Import files use UniCloud JSONL format: one JSON document per line. Files ending in `.raw.DO_NOT_IMPORT.json` are source/reference files and should not be imported directly.

## 4. Running the Program

### Recommended: HBuilderX H5 Preview

1. Open the project root in HBuilderX.
2. Choose the H5 run/preview option.
3. Open the generated local browser URL.
4. Log in with an account from the `users` collection.

H5 preview can display many non-auth pages with fallback data if UniCloud is unavailable. Login still requires the database-backed `users` collection for normal use.

### Optional: Local H5 Script

If dependencies are installed, you can run:

```bash
npm run dev:h5:local
```

Then open the local URL shown in the terminal. This is useful for frontend development, but HBuilderX remains the expected project workflow.

## 5. Login Accounts

Login accounts are loaded from the `users` collection and validated against `users.password_hash`.

Provided administrator account:

- Username: `admin001`
- Password: `AiEms2026!`

Additional student and teacher accounts should be created or imported in UniCloud. The account role controls the landing page:

- `student`: Student Dashboard
- `teacher`: Teacher Dashboard
- `admin` or `academic_staff`: Admin Dashboard

## 6. General Operation Flow

1. Open the application.
2. Sign in with a valid username and password.
3. The system stores the session locally with `uni.setStorageSync`.
4. The system redirects the user to the correct dashboard according to role.
5. Use the navigation controls on the dashboard to open leave, evaluation, materials, assistant, or management pages.
6. Sign out or clear the session when testing another role.

## 7. Student Guide

Students use AI-EMS to review academic information, submit requests, evaluate courses, access materials, and ask local knowledge-base questions.

### Dashboard

1. Log in with a student account.
2. Review course, attendance, academic progress, recommendations, and alert information.
3. Use the dashboard actions to move into leave, evaluation, material, or assistant pages.

### Submit a Leave Request

1. Open the leave workflow page.
2. Select the related course or class session.
3. Enter the leave date, start/end time, reason type, and detailed reason.
4. Submit the request.
5. Wait for teacher or admin review.
6. After approval, the related attendance record is synchronized to `on_leave`.

### Course Evaluation

1. Open the course evaluation page.
2. Select the course to evaluate.
3. Enter rating scores and written feedback.
4. Submit the evaluation.

Course evaluations are anonymous in the teacher/admin summary. Teachers and administrators see aggregated feedback, not the individual student identity.

### Course Materials

1. Open the course materials page.
2. View visible resources for enrolled courses.
3. Open the material link or file URL shown by the system.

### AI Assistant

1. Open the AI Assistant page.
2. Enter a question about policies, courses, evaluation, or available knowledge-base content.
3. The assistant searches local `knowledge_base` records by keyword.
4. If no reliable match is found, the assistant returns a safe fallback message.

## 8. Teacher Guide

Teachers use AI-EMS to view course data, review leave requests, check evaluation summaries, manage visible materials, and support attendance workflows.

### Dashboard

1. Log in with a teacher account.
2. Review assigned courses, student information, attendance summaries, leave requests, evaluation summaries, and teaching materials.

### Review Leave Requests

1. Open the leave workflow page or dashboard leave area.
2. Select a pending leave request.
3. Review the student, course, date, time, and reason.
4. Approve or reject the request.
5. If approved, the cloud function creates or updates the matching `attendance_records` row with `status: "on_leave"`.

### Evaluation Summary

1. Open the evaluation summary page or dashboard section.
2. Select a course.
3. Review aggregated score dimensions and anonymous feedback.

### Course Materials

1. Open the course materials page.
2. Add or update material metadata if your account has permission.
3. Mark materials as visible to students when they should appear in student views.

## 9. Administrator Guide

Administrators manage users, course data, review workflows, and system-wide summaries.

### Dashboard

1. Log in with the administrator account or another admin role.
2. Review system totals, course activity, leave workflow status, evaluation summaries, and alerts.

### User And Academic Data Management

1. Open the Admin Management page.
2. Create or update users, student profiles, teacher profiles, courses, and related academic data where supported by the current UI.
3. Make sure user roles are correct:
   - Students require a student role and student profile.
   - Teachers require a teacher role and teacher profile.
   - Admin users require `admin` or `academic_staff`.

### Profile Change Review

1. Review pending profile-change requests.
2. Approve valid changes or reject invalid changes with a review comment.
3. Approved changes are applied to the related `students` or `teachers` record.

## 10. Key Workflows

1. Login with different roles and open the corresponding dashboard.
2. Student refreshes the dashboard, checks academic progress, recommendations, alerts, and visible course materials.
3. Student submits a leave request; teacher/admin approves it; attendance status becomes `on_leave`; cancellation restores the previous status where supported.
4. Student submits anonymous multi-dimensional course evaluation; teacher/admin sees aggregated feedback only; the local knowledge base receives a course-feedback entry.
5. Student/teacher submits editable profile fields for review; admin approves or rejects the pending change.
6. Student performs a location check-in against the classroom geofence where the feature is enabled.
7. Assistant answers from `knowledge_base`; unknown questions trigger a safe fallback.

## 11. Data Maintenance

- Keep cloud-function fallback data in `src/common/api.js` consistent with database seed data when changing demo records.
- Store only salted one-way password verifiers in `users.password_hash`.
- Do not store plain-text passwords.
- Use `uniCloud-aliyun/database/README.md` for the full collection list, field descriptions, indexes, and import notes.
- AI assistant history is stored in `ai_conversations` and `ai_messages`. History is scoped to the logged-in user.
- `ask-assistant` and AI-history functions remove old assistant records when called, according to the implemented retention logic.

## 12. Troubleshooting

### Login Fails

- Confirm that the project is linked to the correct UniCloud service space.
- Confirm that `auth-login` was uploaded successfully.
- Confirm that the `users` and `roles` collections were imported.
- Confirm that the user has `status: "active"`.
- Confirm that the password matches the stored verifier.

### Dashboard Loads Fallback Or Empty Data

- Confirm that `get-dashboard-data` was uploaded.
- Confirm that course, profile, enrollment, attendance, and related collections contain records matching the logged-in user.
- In H5 preview without UniCloud, only local fallback data is available for non-auth features.

### Leave Approval Does Not Update Attendance

- Confirm that `review-leave` was uploaded.
- Confirm that the target course has matching `class_sessions`.
- Confirm that `attendance_records` and `leave_request_sessions` collections exist.

### Evaluation Summary Is Empty

- Confirm that students submitted evaluations.
- Confirm that `submit-evaluation` and `get-evaluation-summary` were uploaded.
- Confirm that evaluations use the expected course offering identifiers.

### Assistant Gives Fallback Answers

- Confirm that the `knowledge_base` collection contains records.
- Add relevant keywords to `knowledge_base.keywords`.
- Ask a question that includes one of the stored keywords.

## 13. Tech Stack

- Frontend: Uniapp with Vue 3
- Cloud backend: UniCloud cloud functions on Aliyun
- Database: UniCloud NoSQL collections
- AI scope: local keyword retrieval from the `knowledge_base` collection

## 14. Scope Limits

- This PoC does not use MySQL.
- This PoC does not implement production SSO or full `uni-id` login.
- This PoC does not connect DeepSeek, LangChain, or Pinecone yet.
- This PoC does not generate official academic documents.
