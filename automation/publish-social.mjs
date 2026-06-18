import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, ".env");

if (existsSync(envPath)) {
  const envText = await readFile(envPath, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = valueParts.join("=").replace(/^['"]|['"]$/g, "");
  }
}

const date = process.env.VIDEO_DATE || vietnamDate();
const slotsPerDay = 8;
const slot = normalizeSlot(process.env.RUN_SLOT || inferSlotFromUtcHour(new Date().getUTCHours()));
const dateDir = path.join(projectRoot, "daily", date, `slot-${slot}`);
const dryRun = process.env.PUBLISH_DRY_RUN !== "false";
const publishEnabled = process.env.ENABLE_SOCIAL_PUBLISH === "true";
const requestedPlatforms = new Set(
  (process.env.PUBLISH_PLATFORMS || "tiktok,youtube-short,facebook-reel")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);
const TIKTOK_MIN_CHUNK_SIZE = 5 * 1024 * 1024;
const TIKTOK_DEFAULT_CHUNK_SIZE = 10_000_000;
const TIKTOK_MAX_FINAL_CHUNK_SIZE = 128 * 1024 * 1024;
const TIKTOK_MAX_CAPTION_LENGTH = 2200;
const TIKTOK_PRIVACY_LEVEL = "PUBLIC_TO_EVERYONE";

function inferSlotFromUtcHour(hour) {
  const hourToSlot = {
    17: "1",
    20: "2",
    23: "3",
    2: "4",
    5: "5",
    8: "6",
    11: "7",
    14: "8",
  };
  if (hourToSlot[hour]) return hourToSlot[hour];
  return "1";
}

function vietnamDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeSlot(value) {
  const slotNumber = Number(value);
  if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > slotsPerDay) {
    throw new Error(`RUN_SLOT must be 1-${slotsPerDay}. Received: ${value}`);
  }
  return String(slotNumber);
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function captionForPlatform(post, platform) {
  return post.captions?.[platform] || post.caption || post.title || "";
}

function hashtagsFromCaption(caption) {
  return caption.match(/#[\p{L}\p{N}_-]+/gu) || [];
}

function validatedTikTokCaption(post) {
  const caption = captionForPlatform(post, "tiktok").trim();
  if (!caption) {
    throw new Error("TikTok caption is empty. Expected post.captions.tiktok, post.caption, or post.title.");
  }
  if (caption.length > TIKTOK_MAX_CAPTION_LENGTH) {
    throw new Error(`TikTok caption is too long: ${caption.length}/${TIKTOK_MAX_CAPTION_LENGTH} UTF-16 code units.`);
  }
  return caption;
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${options.method || "GET"} ${url} failed: ${res.status} ${text}`);
  }
  return data;
}

async function binaryFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${options.method || "GET"} ${url} failed: ${res.status} ${text}`);
  }
  return text;
}

function tiktokUploadPlan(videoSize) {
  if (!Number.isSafeInteger(videoSize) || videoSize <= 0) {
    throw new Error(`Invalid TikTok video size: ${videoSize}`);
  }

  const chunkSize = videoSize < TIKTOK_DEFAULT_CHUNK_SIZE ? videoSize : TIKTOK_DEFAULT_CHUNK_SIZE;
  const totalChunkCount = Math.floor(videoSize / chunkSize);
  if (totalChunkCount < 1) {
    throw new Error(`Invalid TikTok chunk count for video size ${videoSize} and chunk size ${chunkSize}`);
  }

  const finalChunkStart = chunkSize * (totalChunkCount - 1);
  const finalChunkSize = videoSize - finalChunkStart;
  if (videoSize >= TIKTOK_MIN_CHUNK_SIZE && finalChunkSize > TIKTOK_MAX_FINAL_CHUNK_SIZE) {
    throw new Error(`TikTok final chunk is too large: ${finalChunkSize} bytes`);
  }

  return { chunkSize, totalChunkCount };
}

async function uploadTikTokChunks(uploadUrl, video, chunkSize, totalChunkCount) {
  const videoSize = video.byteLength;
  for (let chunkIndex = 0; chunkIndex < totalChunkCount; chunkIndex += 1) {
    const start = chunkIndex * chunkSize;
    const end = chunkIndex === totalChunkCount - 1 ? videoSize - 1 : start + chunkSize - 1;
    const chunk = video.subarray(start, end + 1);
    await binaryFetch(uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": "video/mp4",
        "content-length": String(chunk.byteLength),
        "content-range": `bytes ${start}-${end}/${videoSize}`,
      },
      body: chunk,
    });
  }
}

let tiktokAccessTokenPromise;

async function getTikTokAccessToken() {
  if (!tiktokAccessTokenPromise) {
    tiktokAccessTokenPromise = refreshTikTokAccessToken();
  }
  return tiktokAccessTokenPromise;
}

async function refreshTikTokAccessToken() {
  const currentRefreshToken = required("TIKTOK_REFRESH_TOKEN");
  const body = new URLSearchParams({
    client_key: required("TIKTOK_CLIENT_KEY"),
    client_secret: required("TIKTOK_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: currentRefreshToken,
  });
  const data = await jsonFetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!data.access_token) throw new Error(`TikTok token refresh did not return access_token: ${JSON.stringify(data)}`);
  if (data.refresh_token && data.refresh_token !== currentRefreshToken) {
    process.env.TIKTOK_REFRESH_TOKEN = data.refresh_token;
    console.warn("TikTok returned a rotated refresh token. Update the TIKTOK_REFRESH_TOKEN secret before the next run.");
  }
  return data.access_token;
}

async function discoverJobs() {
  if (!existsSync(dateDir)) throw new Error(`Missing daily output directory: ${dateDir}`);
  const manifestPath = path.join(dateDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const dirs = await readdir(dateDir, { withFileTypes: true });
  return manifest.jobs.map((job) => {
    const projectDir = dirs.find((dirent) => dirent.isDirectory() && dirent.name === job.slug);
    if (!projectDir) throw new Error(`Missing generated project for ${job.slug}`);
    return {
      ...job,
      projectDir: path.join(dateDir, job.slug),
      videoPath: path.join(dateDir, "renders", `${job.slug}.mp4`),
      postPath: path.join(dateDir, job.slug, "post.json"),
    };
  });
}

async function publishTikTok(job, post) {
  const caption = validatedTikTokCaption(post);
  const accessToken = await getTikTokAccessToken();
  const video = await readFile(job.videoPath);
  const uploadPlan = tiktokUploadPlan(video.byteLength);
  const init = await jsonFetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: caption,
        privacy_level: TIKTOK_PRIVACY_LEVEL,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        brand_content_toggle: false,
        brand_organic_toggle: false,
        is_aigc: false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: video.byteLength,
        chunk_size: uploadPlan.chunkSize,
        total_chunk_count: uploadPlan.totalChunkCount,
      },
    }),
  });

  const uploadUrl = init.data?.upload_url;
  const publishId = init.data?.publish_id;
  if (!uploadUrl) throw new Error(`TikTok did not return upload_url: ${JSON.stringify(init)}`);

  await uploadTikTokChunks(uploadUrl, video, uploadPlan.chunkSize, uploadPlan.totalChunkCount);

  return { platform: "tiktok", mode: "direct-post", publishId };
}

async function getYouTubeAccessToken() {
  const body = new URLSearchParams({
    client_id: required("YOUTUBE_CLIENT_ID"),
    client_secret: required("YOUTUBE_CLIENT_SECRET"),
    refresh_token: required("YOUTUBE_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const data = await jsonFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  return data.access_token;
}

async function publishYouTube(job, post) {
  const accessToken = await getYouTubeAccessToken();
  const caption = captionForPlatform(post, "youtube-short");
  const metadata = {
    snippet: {
      title: post.title.slice(0, 100),
      description: caption,
      categoryId: process.env.YOUTUBE_CATEGORY_ID || "27",
      tags: post.youtubeTags || post.hashtags.map((tag) => tag.replace(/^#/, "")),
    },
    status: {
      privacyStatus: process.env.YOUTUBE_PRIVACY_STATUS || "public",
      selfDeclaredMadeForKids: false,
    },
  };

  const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": "video/mp4",
    },
    body: JSON.stringify(metadata),
  });
  if (!initRes.ok) throw new Error(`YouTube resumable init failed: ${initRes.status} ${await initRes.text()}`);
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube did not return a resumable upload URL");

  const video = await readFile(job.videoPath);
  const upload = await jsonFetch(uploadUrl, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "video/mp4",
      "content-length": String(video.byteLength),
    },
    body: video,
  });
  return { platform: "youtube-short", videoId: upload.id, url: upload.id ? `https://www.youtube.com/watch?v=${upload.id}` : undefined };
}

async function publishFacebookReel(job, post) {
  const graphVersion = process.env.FACEBOOK_GRAPH_VERSION || "v23.0";
  const pageId = required("FACEBOOK_PAGE_ID");
  const token = required("FACEBOOK_PAGE_ACCESS_TOKEN");
  const startUrl = new URL(`https://graph.facebook.com/${graphVersion}/${pageId}/video_reels`);
  startUrl.searchParams.set("upload_phase", "start");
  startUrl.searchParams.set("access_token", token);
  const start = await jsonFetch(startUrl, { method: "POST" });
  const videoId = start.video_id;
  const uploadUrl = start.upload_url;
  if (!videoId || !uploadUrl) throw new Error(`Facebook did not return video_id/upload_url: ${JSON.stringify(start)}`);

  const video = await readFile(job.videoPath);
  await binaryFetch(uploadUrl, {
    method: "POST",
    headers: {
      authorization: `OAuth ${token}`,
      offset: "0",
      file_size: String(video.byteLength),
      "content-type": "application/octet-stream",
    },
    body: video,
  });

  const finishUrl = new URL(`https://graph.facebook.com/${graphVersion}/${pageId}/video_reels`);
  finishUrl.searchParams.set("upload_phase", "finish");
  finishUrl.searchParams.set("video_id", videoId);
  finishUrl.searchParams.set("video_state", "PUBLISHED");
  finishUrl.searchParams.set("description", captionForPlatform(post, "facebook-reel"));
  finishUrl.searchParams.set("access_token", token);
  const finish = await jsonFetch(finishUrl, { method: "POST" });
  return { platform: "facebook-reel", videoId, finish };
}

async function main() {
  const jobs = await discoverJobs();
  const results = [];

  for (const job of jobs) {
    const post = JSON.parse(await readFile(job.postPath, "utf8"));
    const targetPlatforms = (post.platforms || [post.platform]).filter((platform) => requestedPlatforms.has(platform));
    if (!existsSync(job.videoPath)) {
      const message = `Missing rendered video: ${job.videoPath}`;
      if (dryRun || !publishEnabled) {
        console.warn(`[dry-run] ${message}`);
        for (const platform of targetPlatforms) {
          results.push({ platform, slug: job.slug, skipped: true, reason: "missing-rendered-video" });
        }
        continue;
      }
      throw new Error(message);
    }

    for (const platform of targetPlatforms) {
      const caption = captionForPlatform(post, platform);
      const hashtags = hashtagsFromCaption(caption);
      console.log(`${dryRun || !publishEnabled ? "[dry-run]" : "[publish]"} ${platform}: ${job.videoPath}`);
      console.log(`Title: ${post.title}`);
      console.log(`Caption: ${caption.slice(0, 180).replace(/\s+/g, " ")}...`);
      if (hashtags.length) console.log(`Hashtags (${hashtags.length}): ${hashtags.slice(0, 12).join(" ")}`);
      if (platform === "tiktok") {
        console.log("TikTok mode: direct-post");
        console.log(`TikTok caption length: ${caption.trim().length}/${TIKTOK_MAX_CAPTION_LENGTH}`);
      }

      if (dryRun || !publishEnabled) {
        results.push({ platform, slug: job.slug, skipped: true, reason: "dry-run-or-disabled" });
        continue;
      }

      try {
        if (platform === "tiktok") results.push(await publishTikTok(job, post));
        else if (platform === "youtube-short") results.push(await publishYouTube(job, post));
        else if (platform === "facebook-reel") results.push(await publishFacebookReel(job, post));
        else throw new Error(`Unsupported platform: ${platform}`);
      } catch (error) {
        console.error(`[error] ${platform}: ${error.message}`);
        results.push({ platform, slug: job.slug, failed: true, error: error.message });
      }
    }
  }

  console.log(JSON.stringify({ date, slot, results }, null, 2));
}

await main();
