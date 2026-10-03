# Frontend / Backend Field Mapping

This section documents how the application uses shared definitions between frontend and backend, and where the actual backend validation is enforced.

## Shared domain definitions

Relevant files:

- `shared/learning.js`
- `shared/student.js`
- `shared/discover.js`
- `shared/tech-news.js`
- `src/data.js`

These files provide the canonical enumerations and default values used across the stack, for example:

- `batchStatuses`
- `taskStatuses`
- `submissionStatuses`
- `certificateTypes`
- `studentDomains`
- `studyYears`
- `discoverDomains`
- `discoverTypes`
- `defaultDiscoverCategories`
- `contactConfig`
- `internshipRoles`
- `liveClasses`

## Backend validation points

The actual backend schema is enforced in the Mongoose model definitions:

- `server/models/index.js` validates public portal records such as `Project`, `Enquiry`, `CustomProject`, and `InternshipApplication`.
- `server/models/student.js` validates `Student` and `StudentSession` values.
- `server/models/learning.js` validates batch, task, submission, certificate and notification structures.
- `server/models/discover.js` validates categories, source URL type and item status.
- `server/models/management.js` validates singleton config, domains and announcements.
- `server/models/content-video.js` validates video metadata and media file references.

## Frontend guidance

The frontend should use the shared enums and defaults from `shared/` and `src/data.js` when displaying or creating data in UI flows, so that the values remain aligned with the backend schema.

## Important mapping examples

- `Student.yearOfStudy` is constrained by `studyYears` from `shared/student.js`.
- `Student.internshipDomain` is constrained by `studentDomains` from `shared/student.js`.
- `InternshipBatch.status` is constrained by `batchStatuses` from `shared/learning.js`.
- `InternshipTask.status` is constrained by `taskStatuses` from `shared/learning.js`.
- `TaskSubmission.status` is constrained by `submissionStatuses` from `shared/learning.js`.
- `Certificate.type` is constrained by `certificateTypes` from `shared/learning.js`.
- `DiscoverSource.type` and `DiscoverItem.type` are constrained by discover domain metadata in `shared/discover.js`.

## Data integrity note

The backend schema is the source of truth for persisted data. The frontend should not invent fields or enforce different enum values than those defined in the shared files and Mongoose models.
