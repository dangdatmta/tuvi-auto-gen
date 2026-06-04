# Daily Video Automation

This folder powers the GitHub Actions workflow at `.github/workflows/daily-sun-tzu-videos.yml`.

## What It Does

- Runs every 3 hours at 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, and 21:00 Asia/Ho_Chi_Minh.
- Each run selects 1 lesson for that slot, generates 1 vertical 9:16 video, uploads a TikTok draft, then publishes the same MP4 to YouTube Shorts and Facebook Reels.
- The content pool is sequential and skips any lesson marked with `disabled: true`, which keeps already-used lessons archived without selecting them again. The current active pool has 240 lessons, so at 8 scheduled runs per day the sequence repeats after 240 videos, or 30 days. Set `VIDEO_SERIES_START_DATE` if you want to reset where the sequence begins.
- Searches Wikimedia Commons and Openverse for lesson-specific historical/classical images, then filters out modern photos or contemporary military/sports imagery before downloading fresh assets for each generated video.
- The image filter favors Chinese historical/classical subjects such as Sun Tzu, Confucius, Laozi, dynasty paintings, scrolls, old maps, artifacts, temples, and museum images. Set `IMAGE_HISTORICAL_SCORE` higher if you want stricter filtering.
- Optionally runs local ML subject separation with `rembg`, exports subject/shadow PNG layers, extracts SVG contours, and animates a 2.5D living-scene subject hit. If the model or dependencies are unavailable, the video generation continues without the subject effect.
- Generates Vietnamese VieNeu narration, processes it for a louder heroic social-video mix, adds background music, and writes HyperFrames compositions.
- Writes platform-specific viral captions and tags into `post.json`; YouTube Shorts and Facebook Reels use the caption tuned for that platform, while TikTok captions remain available for manual posting from the draft.
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
npx --yes hyperframes@0.6.40 render --output ../renders/video-laying-plans.mp4 --quality high --fps 30
```

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

The workflow renders videos, uploads artifacts, and can publish or upload drafts when credentials are configured. Publishing is guarded by `ENABLE_SOCIAL_PUBLISH` and `PUBLISH_DRY_RUN`.

- Copy `.env.example` to `.env` for local testing.
- In GitHub, add the same values as repository secrets.
- Keep `ENABLE_SOCIAL_PUBLISH=false` or `PUBLISH_DRY_RUN=true` until all platform permissions are verified.

Required platform credentials:

- Google Cloud / Vertex AI: `GCP_SERVICE_ACCOUNT_KEY` as a service account JSON key, plus optional `VERTEX_PROJECT_ID` and `VERTEX_LOCATION` secrets. The service account needs Vertex AI User on the project and Service Account Token Creator on itself so the workflow can mint an access token.
- TikTok: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, and `TIKTOK_REFRESH_TOKEN` with Content Posting API access and `video.upload` scope. The script refreshes a short-lived access token at upload time and sends the video to the creator's TikTok inbox as a draft.
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
