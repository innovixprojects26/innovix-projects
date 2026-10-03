# Admin Data Entry Guide

This guide is intended for platform administration and data-quality review. It highlights the main admin-managed records and the expected structures, without including any real user data.

## Admin-managed collections

- Project
- Enquiry
- ContactMessage
- Testimonial
- InternshipBatch
- BatchEnrollment
- InternshipTask
- TaskSubmission
- Certificate
- StudentNotification
- DiscoverSource
- DiscoverItem
- TechNews
- ContentVideo
- WebsiteConfig
- InternshipDomain
- Announcement
- AdminActivity

## Primary data entry workflows

### 1. Website and catalog management

Use admin routes to create and update projects, testimonials and configuration values.

### 2. Learning platform management

Use batch, task and submission review flows to control the live internship lifecycle.

### 3. Discover source management

Create or update trusted source entries with secure URLs and supported types.

### 4. Tech news editorial management

Use the admin tech news endpoints to create and publish content articles.

### 5. Content creation media management

Upload metadata and associated files for recorded learning media.

## Safe practice checklist

- Do not add real passwords or personal data to sample payloads.
- Ensure enum values match the backend schema.
- Maintain consistent domain names and batch codes.
- Keep source URLs public and trusted.
- Do not bypass audit records or activity logs.
- Do not modify production environment or app logic.
