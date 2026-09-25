# Content Creation recorded classes

This feature is exclusive to the Content Creation card at `/internships#content-creation`. Its existing Zoom URL is still read unchanged from `src/data.js`. Recorded Classes opens the protected `/student/recorded-classes` library and player without expanding or rearranging the other internship cards. Students must log in with a Content Creation account; admin preview continues to work independently.

## Admin workflow

1. Sign in to Admin and select **Content Creation Videos**.
2. Select **Upload Video**. Enter a title, topic/module, description, publish date in your local time, and status.
3. Choose an MP4, WebM or MOV file (maximum 1 GB). Optionally choose a JPG, PNG or WebP thumbnail (maximum 5 MB).
4. Select **Save Video**. Upload progress is displayed; the record stays a draft until the files finish uploading and the details are saved. Failed/cancelled uploads leave a resumable draft. Use Refresh/Edit to inspect the saved state after a network interruption.
5. Use **Preview**, **Edit**, **Publish/Unpublish**, **Delete**, or **Move up/Move down** in the list. Ordering is saved in MongoDB. Publishing requires an uploaded video; a future publish date delays student visibility.

Edit changes metadata and can finish an incomplete upload or add a previously omitted thumbnail. To replace an existing recording or thumbnail, create a new video and delete the old one. Deleting a video removes its metadata and associated files. The confirmation is shown before deletion.

## Storage and operation

- MongoDB collection: `contentcreationvideos` (metadata, duration when detected by the browser, ordering and generated filenames; no video binaries).
- Default file location: `server/uploads/content-creation/`, outside `public`. The entire `server/uploads/` directory is ignored by Git.
- Optional `CONTENT_VIDEO_STORAGE_DIR` environment variable: absolute path to a private persistent disk directory, ideally outside the repository. Do not serve that directory directly as static content. All media requests go through the publish/preview checks.
- Keep this directory on a persistent disk and back it up together with MongoDB. Ephemeral/serverless filesystem storage will not retain uploaded recordings. This implementation targets a single Node API instance; multiple instances need shared durable storage and distributed upload locking (or a storage adapter).
- Uploads stream to `.part` files and are renamed after format/size checks. Failed requests clean up partial uploads. A hard process termination can leave `.part` files; remove abandoned partial files during maintenance while uploads are stopped.
- Configure any hosting reverse proxy to allow binary uploads up to 1 GB and sufficient upload time. Media uses HTTP byte ranges for seeking without loading the entire recording in memory.
- Admin previews use short-lived, video-specific media tokens signed with a separately derived key; they cannot authenticate admin API requests. Student media requests check the active student session, Content Creation domain, publication state and date on every request. Preview URLs expire after four hours; reopen Preview to refresh.
- The player uses native play/pause, volume, seeking and fullscreen controls. It does not offer a download button and requests `nodownload` controls. This is not DRM: browsers can still retrieve media being played.
- MP4, WebM and MOV containers are accepted. Actual playback depends on browser codec support; prefer MP4 with H.264 video/AAC audio. No transcoding service is installed. A codec/playback failure displays a helpful message.

## Profile photo

The supplied person photo was not present in the request/workspace when implemented. Once it is provided, copy it to `src/assets/content-creation-profile.jpg` (or `.jpeg`, `.png`, `.webp`). The card automatically imports this local asset at build time and uses a 64 px circular, aspect-preserving image (52 px on mobile) with a subtle cyan border/shadow. Until then, no substitute person photo or broken image is shown.

## Checks

- `npm run lint`
- `npm run build`
- `node --test server/content-videos.test.js`

The integration test uses the configured MongoDB cluster and JWT secret, creates a uniquely named temporary database and temporary local directory, and removes both afterward. It checks upload validation, authentication, draft/future-date visibility, preview scoping, HTTP range responses, metadata edits, ordering and file deletion. Binary fixtures test storage/streaming rather than browser codec decoding.

No changes to news, internship application forms, other internship tracks or Zoom configuration are needed. No deployment or GitHub push is performed by this feature.
