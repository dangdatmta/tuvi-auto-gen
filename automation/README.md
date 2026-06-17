# Daily Video Automation

This folder powers the GitHub Actions workflow at `.github/workflows/daily-sun-tzu-videos.yml`.

## What It Does

- Runs every 3 hours at 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, and 21:00 Asia/Ho_Chi_Minh.
- Each run selects 1 lesson for that slot, generates 1 vertical 9:16 video, then publishes the same MP4 to TikTok, YouTube Shorts, and Facebook Reels.
- The content pool is sequential and skips any lesson marked with `disabled: true`, which keeps already-used lessons archived without selecting them again. The current active pool has 240 lessons, so at 8 scheduled runs per day the sequence repeats after 240 videos, or 30 days. Set `VIDEO_SERIES_START_DATE` if you want to reset where the sequence begins.
- Uses Gemini to create a flexible `visual-plan.json` from the actual narration/caption timing, then generates one image per visual beat with Vertex AI Imagen into `assets/generated/`.
- If generated images are disabled or unavailable, falls back to Wikimedia Commons and Openverse historical/classical image search. Set `IMAGE_HISTORICAL_SCORE` higher if you want stricter fallback filtering.
- Optionally runs local ML subject separation with `rembg`, exports subject/shadow PNG layers, extracts SVG contours, and animates a 2.5D living-scene subject hit. If the model or dependencies are unavailable, the video generation continues without the subject effect.
- Generates Vietnamese VieNeu narration, processes it for a louder heroic social-video mix, adds background music, and writes HyperFrames compositions.
- Writes platform-specific viral captions and tags into `post.json`; each publisher uses the caption tuned for that platform.
- Renders MP4 files and uploads them as GitHub Actions artifacts.

## Local Run

From `sun-tzu-viral-916`:

```bash
VIDEO_DATE=2026-05-25 RUN_SLOT=1 npm run daily:generate
```

Then render one generated project:

```bash
cd daily/2026-05-25/slot-1/video-laying-plans
npx --yes hyperframes@0.6.40 lint
npx --yes hyperframes@0.6.40 render --output ../renders/video-laying-plans.mp4 --video-bitrate 5M --fps 30
```

Render presets:

- `social-balanced`: 1080x1920, 30fps, `5M` video bitrate. Default for daily uploads.
- `social-small`: 1080x1920, 30fps, `4M` video bitrate for lighter files.
- `archive-high`: HyperFrames high quality for master renders only.

Set `SKIP_TTS=1` for a structural dry run that creates silent narration.

Slot mapping:

```text
1 = 00:00 ICT
2 = 03:00 ICT
3 = 06:00 ICT
4 = 09:00 ICT
5 = 12:00 ICT
6 = 15:00 ICT
7 = 18:00 ICT
8 = 21:00 ICT
```

## Required Runtime

- Node.js 22+
- FFmpeg
- Python 3.12+
- VieNeu-TTS available either from PyPI (`vieneu`) or a local repo via `VIENEU_DIR`
- Subject outline dependencies for the animated outline effect: `rembg`, `pillow`, `opencv-python-headless`, and `numpy`

## Publishing

The workflow renders videos, uploads artifacts, and can publish when credentials are configured. Publishing is guarded by `ENABLE_SOCIAL_PUBLISH` and `PUBLISH_DRY_RUN`.

- Copy `.env.example` to `.env` for local testing.
- In GitHub, add the same values as repository secrets.
- Keep `ENABLE_SOCIAL_PUBLISH=false` or `PUBLISH_DRY_RUN=true` until all platform permissions are verified.

Required platform credentials:

- Google Cloud / Vertex AI: `GCP_SERVICE_ACCOUNT_KEY` as a service account JSON key, plus optional `VERTEX_PROJECT_ID` and `VERTEX_LOCATION` secrets. The service account needs Vertex AI User on the project and Service Account Token Creator on itself so the workflow can mint an access token.
- TikTok: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, and `TIKTOK_REFRESH_TOKEN` with Content Posting API access and `video.publish` scope. The script refreshes a short-lived access token at upload time and direct-posts the video with the TikTok caption/hashtags from `post.json`.
- YouTube: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` with `youtube.upload` scope.
- Facebook: `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` with Page/Reels publishing permissions.

Local dry run:

```bash
VIDEO_DATE=2026-05-25 RUN_SLOT=1 PUBLISH_DRY_RUN=true npm run daily:publish
```

Publish for real only after testing:

```bash
ENABLE_SOCIAL_PUBLISH=true PUBLISH_DRY_RUN=false VIDEO_DATE=2026-05-25 RUN_SLOT=1 npm run daily:publish
```
