# File Storage

This project stores some uploaded or generated media on disk rather than embedding large binary blobs directly in the database model. Only metadata and references are stored in MongoDB records.

## 1. Learning file storage

Relevant files:

- `server/storage/learning-files.js`
- `server/models/learning.js` (`LearningFile`)

Behavior:

- Files are validated and accepted based on content type and safe file handling rules.
- Upload metadata is stored in the `LearningFile` model.
- The actual uploaded file is preserved in the file storage area used by the server, not as an embedded MongoDB binary.

Fields in the metadata model include:

- `task`
- `student`
- `filename`
- `originalName`
- `type`
- `bytes`
- `purpose`

## 2. Content video storage

Relevant files:

- `server/storage/content-videos.js`
- `server/models/content-video.js`
- `server/controllers/content-videos.js`

Behavior:

- `ContentVideo` records keep metadata such as title, duration, order, storage file names and thumbnail references.
- Uploaded media is stored on the filesystem.
- Public listing and playback logic reads the metadata and serves the associated stored file.

## 3. Certificate storage

- Certificate issuance is represented by `Certificate` metadata, but the actual certificate document is not treated as a binary upload in the same way as media files.
- The certificate is issued as a structured record and is validated by the app logic.

## 4. Safety considerations

- No uploaded student files are included in this handover package.
- No real media files are bundled with the export.
- This folder contains only safe synthetic sample JSON payloads and documentation.
