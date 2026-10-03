# Database Relationships

This document summarises the important object relationships that exist across the current Innovix Projects data model.

## 1. Public-facing lead records

- Project -> Enquiry.project: each enquiry records the selected project via a reference to Project; a snapshot of the title and price is also stored.
- Project -> CustomProject: no direct reference exists; custom requests are independent but conceptually related to the project domain and student brief.
- Student -> InternshipApplication: internship applications are not linked to Student in the core model; the application is stored as a standalone candidate model.

## 2. Student authentication and sessions

- Student -> StudentSession.student: each login session belongs to one Student.
- Student -> StudentSession.tokenHash: the token is stored in hashed form; it is not a plain bearer token.
- Student -> StudentSession.expiresAt: session expiry is enforced via TTL semantics.

## 3. Internship learning lifecycle

- Student -> BatchEnrollment.student
- InternshipBatch -> BatchEnrollment.batch
- BatchEnrollment -> Certificate.enrollment: certificates can reference the enrollment that qualified the student.
- InternshipTask -> TaskSubmission.task
- Student -> TaskSubmission.student
- TaskSubmission -> LearningFile: uploaded files can be linked through metadata records stored in LearningFile.
- Student -> LearningActivity.student: XP and activity entries are tracked per student.
- Student -> VideoProgress.student and ContentVideo -> VideoProgress.video: video watch progress is tracked per student-video pair.
- Student -> DiscoverRead.student and DiscoverItem -> DiscoverRead.item: read tracking is stored for the student item pair.

## 4. Discover and editorial content

- DiscoverCategory -> DiscoverItem.category: discover items are sorted by category.
- DiscoverSource -> DiscoverItem.source: feed items can reference the trusted source they were pulled from.
- WebsiteConfig -> DiscoverCategory: config stores an initialization flag for default discover categories, but categories remain independent documents.

## 5. Admin-managed operational records

- WebsiteConfig -> InternshipDomain: configuration and domains are maintained as separate but related configuration records.
- InternshipDomain -> Announcement: not a direct foreign key, but these are all managed in the same admin configuration area.
- Admin -> AdminActivity: admin actions are logged by action and target, without persisting request bodies or credentials.

## 6. Relationship summary by lifecycle

Student -> Register/Login -> StudentSession -> BatchEnrollment -> InternshipTask -> TaskSubmission -> Progress/XP -> Certificate

This path reflects the main learning and certification lifecycle implemented in the backend.
