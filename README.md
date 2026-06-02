# Tu Vi Auto Gen

Automated 9:16 short-video generation and publishing pipeline for Vietnamese ancient-wisdom content.

The project generates one vertical MP4 per run, searches fresh historical/classical images from the internet, builds a cinematic HyperFrames composition, creates VieNeu narration, mixes background music, and can publish the same video to TikTok, YouTube Shorts, and Facebook Reels.

## Automation

- GitHub Action: `.github/workflows/daily-sun-tzu-videos.yml`
- Generator: `automation/generate-daily-videos.mjs`
- Publisher: `automation/publish-social.mjs`
- Main docs: `automation/README.md`

The scheduled workflow runs every 3 hours in Asia/Ho_Chi_Minh. It skips lessons marked with `disabled: true`, then rotates through the active Chinese classical-wisdom pool in order.

## Local Test

```bash
VIDEO_DATE=2026-05-25 RUN_SLOT=1 npm run daily:generate
```

Render the generated project:

```bash
cd daily/2026-05-25/slot-1/video-laying-plans
npx --yes hyperframes@0.6.40 lint
npx --yes hyperframes@0.6.40 render --output ../renders/video-laying-plans.mp4 --quality high --fps 30
```

Publish dry-run:

```bash
VIDEO_DATE=2026-05-25 RUN_SLOT=1 PUBLISH_DRY_RUN=true npm run daily:publish
```

Copy `.env.example` to `.env` for local credentials. In GitHub Actions, configure the same values as repository secrets.
