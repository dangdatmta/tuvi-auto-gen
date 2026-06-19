import { mkdir, readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

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

const sunTzuLessons = JSON.parse(await readFile(path.join(projectRoot, "automation", "lessons.json"), "utf8"));
const extraLessons = JSON.parse(await readFile(path.join(projectRoot, "automation", "extra-lessons.json"), "utf8"));
const lessons = [
  ...sunTzuLessons.map((lesson) => normalizeLesson(lesson, {
    sourceAuthor: "Tôn Tử",
    sourceWork: "Binh pháp Tôn Tử",
    sourceTitlePrefix: "Binh pháp Tôn Tử",
    sourceUrl: "https://www.gutenberg.org/cache/epub/132/pg132-images.html",
    sourceOrder: 1,
  })),
  ...extraLessons.map((lesson, index) => normalizeLesson(lesson, { sourceOrder: 2 + index })),
].filter((lesson) => lesson.disabled !== true);
const slotsPerDay = 8;
const date = process.env.VIDEO_DATE || vietnamDate();
const slot = normalizeSlot(process.env.RUN_SLOT || inferSlotFromUtcHour(new Date().getUTCHours()));
const distribution = { id: "social", label: "TikTok / Shorts / Reels" };
const narrationDurationMin = Number(process.env.NARRATION_DURATION_MIN || 70);
const narrationDurationMax = Number(process.env.NARRATION_DURATION_MAX || 92);
const visualBeatMin = Number(process.env.VISUAL_BEAT_MIN_SECONDS || 3.2);
const visualBeatMax = Number(process.env.VISUAL_BEAT_MAX_SECONDS || 6.5);
const visualBeatMinCount = Number(process.env.VISUAL_BEAT_MIN_COUNT || 5);
const visualBeatMaxCount = Number(process.env.VISUAL_BEAT_MAX_COUNT || 14);
const maxNewGeminiImagesPerVideo = nonNegativeInteger(process.env.MAX_NEW_GEMINI_IMAGES_PER_VIDEO, 2);
const imageCandidateVarietyWeight = nonNegativeNumber(process.env.IMAGE_CANDIDATE_VARIETY_WEIGHT, 3);
const imageReusePools = (process.env.IMAGE_REUSE_POOL || "daily,assets")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const outRoot = path.join(projectRoot, "daily", date, `slot-${slot}`);
const imageUserAgent = "Mozilla/5.0 (compatible; sun-tzu-video-bot/1.0; +https://github.com/heygen-com/hyperframes)";
const requiredHistoricalScore = Number(process.env.IMAGE_HISTORICAL_SCORE || 1);
const subjectLayerOpacity = clamp(Number(process.env.SUBJECT_LAYER_OPACITY || 0.92), 0, 1);
const subjectShadowOpacity = clamp(Number(process.env.SUBJECT_SHADOW_OPACITY || 0.38), 0, 1);
const subjectDepthPush = Number(process.env.SUBJECT_DEPTH_PUSH || 34);
const seriesStartDate = process.env.VIDEO_SERIES_START_DATE || "2026-05-25";
const blockedModernImageTerms = [
  "olympic", "olympics", "summer games", "world class athlete", "u.s. army", "us army",
  "united states army", "modern", "contemporary", "drone", "uav", "tank", "rifle",
  "machine gun", "helicopter", "aircraft", "football", "basketball", "marathon",
  "communist", "people's liberation army", "world war", "wwi", "wwii", "1945",
  "1946", "1947", "1948", "1949", "1950", "1951", "1952", "1953", "1954",
  "1955", "1956", "1957", "1958", "1959", "1960", "1961", "1962", "1963",
  "1964", "1965", "1966", "1967", "1968", "1969", "1970", "1971", "1972",
  "1973", "1974", "1975", "1976", "1977", "1978", "1979", "1980", "1981",
  "1982", "1983", "1984", "1985", "1986", "1987", "1988", "1989", "1990",
  "1991", "1992", "1993", "1994", "1995", "1996", "1997", "1998", "1999",
  "2010", "2011", "2012", "2013", "2014", "2015", "2016", "2017", "2018", "2019",
  "2020", "2021", "2022", "2023", "2024", "2025", "2026",
];
const blockedIrrelevantImageTerms = [
  "egypt", "egyptian", "greece", "greek", "rome", "roman", "persian letters",
  "ancient mexico", "beejapoor", "bombay presidency", "mahometan",
  "house decoration", "paperhanging", "water colours", "watercolors", "text-book of the history of painting",
  "negro in ancient history", "loan collection", "wall painting europe",
];
const supportedPlatforms = ["tiktok", "youtube-short", "facebook-reel"];
const platformHashtags = {
  tiktok: ["#TikTokVietnam", "#LearnOnTikTok"],
  "youtube-short": ["#Shorts", "#YouTubeShorts"],
  "facebook-reel": ["#Reels", "#FacebookReels"],
};
const chineseHistoricalTerms = [
  "china", "chinese", "sun tzu", "confucius", "laozi", "lao tzu", "tzu", "han", "tang", "song", "yuan", "ming",
  "qing", "warring states", "three kingdoms", "guan yu", "red cliffs", "terracotta",
  "bamboo slips", "forbidden city", "great wall", "analects", "tao te ching", "dao de jing",
  "兵", "孫子", "孙子", "孔子", "老子", "論語", "论语", "道德經", "道德经", "漢", "唐", "宋",
  "元", "明", "清", "三国", "關羽", "关羽",
];
const historicalImageTerms = [
  "ancient", "antique", "historical", "history", "painting", "illustration", "engraving",
  "woodblock", "scroll", "manuscript", "map", "dynasty", "han", "tang", "song", "yuan",
  "ming", "qing", "warring states", "three kingdoms", "china", "chinese", "sun tzu",
  "warrior", "general", "battle", "cavalry", "fortress", "museum", "artifact", "bronze",
  "terracotta", "bamboo slips", "calligraphy", "landscape", "sage", "scholar", "temple",
];

function normalizeLesson(lesson, defaults = {}) {
  return {
    ...defaults,
    sourceAuthor: lesson.sourceAuthor || defaults.sourceAuthor || "Cổ nhân",
    sourceWork: lesson.sourceWork || defaults.sourceWork || "Triết học cổ nhân",
    sourceTitlePrefix: lesson.sourceTitlePrefix || defaults.sourceTitlePrefix || lesson.sourceWork || defaults.sourceWork || "Triết học cổ nhân",
    sourceUrl: lesson.sourceUrl || defaults.sourceUrl || "",
    ...lesson,
  };
}

function hashDate(input) {
  let h = 2166136261;
  for (const ch of input) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function daysBetween(start, end) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.floor((endMs - startMs) / 86400000));
}

function vietnamDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function pickLessons() {
  const dayOffset = daysBetween(seriesStartDate, date);
  const start = dayOffset * slotsPerDay;
  return Array.from({ length: slotsPerDay }, (_, index) => lessons[(start + index) % lessons.length]);
}

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

function normalizeSlot(value) {
  const slotNumber = Number(value);
  if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > slotsPerDay) {
    throw new Error(`RUN_SLOT must be 1-${slotsPerDay}. Received: ${value}`);
  }
  return String(slotNumber);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function nonNegativeInteger(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function nonNegativeNumber(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, number);
}

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeForMatch(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hookHtml(text) {
  const words = text.trim().split(/\s+/);
  const splitAt = Math.max(1, Math.ceil(words.length / 2));
  const lead = words.slice(0, splitAt).join(" ");
  const punch = words.slice(splitAt).join(" ");
  return punch
    ? `<span>${escapeHtml(lead)}</span><em>${escapeHtml(punch)}</em>`
    : `<span>${escapeHtml(lead)}</span>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function imageText(item) {
  return [
    item.title,
    item.creator,
    item.license,
    item.provider,
    item.url,
    item.sourceUrl,
    item.metadata?.ObjectName?.value,
    item.metadata?.ImageDescription?.value,
    item.metadata?.Credit?.value,
    item.metadata?.Artist?.value,
  ].filter(Boolean).join(" ").toLowerCase();
}

function historicalScore(item) {
  const text = imageText(item);
  if (blockedModernImageTerms.some((term) => text.includes(term))) return -100;
  if (blockedIrrelevantImageTerms.some((term) => text.includes(term))) return -100;
  return historicalImageTerms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function imageRank(item) {
  const text = imageText(item);
  let rank = historicalScore(item);
  if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(item.sourceUrl || item.url)) rank += 4;
  if (text.includes("painting") || text.includes("scroll") || text.includes("map")) rank += 3;
  if (text.includes("battle") || text.includes("warrior") || text.includes("general")) rank += 2;
  if (text.includes(".pdf") || text.includes(".djvu") || text.includes("internet archive") || text.includes("(ia ")) rank -= 3;
  return rank;
}

function isDocumentLikeImage(item) {
  const text = imageText(item);
  return /\.(pdf|djvu)(\?|$)/i.test(item.sourceUrl || item.url)
    || text.includes(".pdf")
    || text.includes(".djvu")
    || text.includes("internet archive")
    || text.includes("(ia ");
}

function canonicalImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    url.searchParams.delete("width");
    url.searchParams.delete("height");
    return url.toString();
  } catch {
    return String(value || "").trim();
  }
}

function imageIdentity(item) {
  return canonicalImageUrl(item.sourceUrl || item.url || item.downloadedUrl);
}

function imageSeriesKey(item) {
  return normalizeForMatch(item.title || item.sourceUrl || item.url)
    .replace(/^file\s+/, "")
    .replace(/\bmet\s+dp\d+\b/g, "met")
    .replace(/\b\d{6,}\b/g, "")
    .replace(/\b[0-9]+[-_][0-9]+\b/g, "")
    .replace(/\b[a-z]\b$/g, "")
    .replace(/\b(jpg|jpeg|png|webp)\b$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function seededFraction(seed) {
  return (hashDate(seed) % 100000) / 100000;
}

function candidateScore(item, lesson) {
  const seed = variantSeed(lesson, `image:${item.query}:${imageIdentity(item)}`);
  let score = imageRank(item) + seededFraction(seed) * imageCandidateVarietyWeight;
  if (item.isFallback) score -= 2;
  if (item.documentLike) score -= 25;
  if (item.usedBefore) score -= 60;
  return score;
}

function isHistoricalImage(item) {
  const text = imageText(item);
  const culturallyRelevant = chineseHistoricalTerms.some((term) => text.includes(term));
  return culturallyRelevant && historicalScore(item) >= requiredHistoricalScore;
}

async function collectUsedImageUrls(rootDir = path.join(projectRoot, "daily")) {
  const used = new Set();
  async function visit(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile() && entry.name === "image-sources.json") {
        try {
          const items = JSON.parse(await readFile(fullPath, "utf8"));
          for (const item of items || []) {
            for (const value of [item.url, item.downloadedUrl]) {
              const normalized = canonicalImageUrl(value);
              if (normalized) used.add(normalized);
            }
          }
        } catch (error) {
          console.warn(`Ignoring image history ${fullPath}: ${error.message}`);
        }
      }
    }
  }
  await visit(rootDir);
  return used;
}

function selectDiverseImageCandidates(candidates, lesson, targetCount = 7) {
  const chosen = [];
  const chosenIds = new Set();
  const queryCounts = new Map();
  const seriesCounts = new Map();
  const sorted = [...candidates].sort((a, b) => candidateScore(b, lesson) - candidateScore(a, lesson));

  const tryAdd = (item, { allowUsed = false, maxPerQuery = 2, maxPerSeries = 2 } = {}) => {
    if (chosen.length >= targetCount) return false;
    const id = imageIdentity(item);
    if (!id || chosenIds.has(id)) return false;
    if (item.usedBefore && !allowUsed) return false;
    const queryKey = item.queryRoot || item.query;
    const seriesKey = imageSeriesKey(item) || id;
    if ((queryCounts.get(queryKey) || 0) >= maxPerQuery) return false;
    if ((seriesCounts.get(seriesKey) || 0) >= maxPerSeries) return false;
    chosen.push(item);
    chosenIds.add(id);
    queryCounts.set(queryKey, (queryCounts.get(queryKey) || 0) + 1);
    seriesCounts.set(seriesKey, (seriesCounts.get(seriesKey) || 0) + 1);
    return true;
  };

  const passes = [
    { items: sorted.filter((item) => !item.isFallback && !item.documentLike), allowUsed: false, maxPerQuery: 1, maxPerSeries: 1 },
    { items: sorted.filter((item) => !item.isFallback && !item.documentLike), allowUsed: false, maxPerQuery: 2, maxPerSeries: 2 },
    { items: sorted.filter((item) => item.isFallback && !item.documentLike), allowUsed: false, maxPerQuery: 1, maxPerSeries: 1 },
    { items: sorted.filter((item) => item.isFallback && !item.documentLike), allowUsed: false, maxPerQuery: 2, maxPerSeries: 2 },
    { items: sorted.filter((item) => !item.isFallback && !item.documentLike), allowUsed: true, maxPerQuery: 2, maxPerSeries: 2 },
    { items: sorted.filter((item) => !item.documentLike), allowUsed: true, maxPerQuery: 3, maxPerSeries: 3 },
    { items: sorted, allowUsed: true, maxPerQuery: 3, maxPerSeries: 3 },
  ];

  for (const pass of passes) {
    for (const item of pass.items) {
      tryAdd(item, pass);
    }
    if (chosen.length >= targetCount) break;
  }

  return chosen;
}

async function commonsSearch(query, limit = 8) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `file:${query}`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", String(limit));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|thumburl|extmetadata");
  url.searchParams.set("iiurlwidth", "1600");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  let res;
  try {
    res = await fetch(url, { headers: { "user-agent": imageUserAgent } });
  } catch (error) {
    console.warn(`Skipping Wikimedia search for "${query}": ${error.message}`);
    return [];
  }
  if (!res.ok) return [];
  const data = await res.json();
  return Object.values(data.query?.pages || {})
    .map((page) => {
      const info = page.imageinfo?.[0];
      return info?.url ? { title: page.title, url: info.thumburl || info.url, sourceUrl: info.url, metadata: info.extmetadata || {}, provider: "Wikimedia Commons" } : null;
    })
    .filter(Boolean)
    .filter((item) => /\.(jpe?g|png|webp)$/i.test(new URL(item.url).pathname))
    .filter(isHistoricalImage)
    .sort((a, b) => imageRank(b) - imageRank(a));
}

async function openverseSearch(query, limit = 10) {
  const url = new URL("https://api.openverse.engineering/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(limit));
  url.searchParams.set("license_type", "commercial");
  url.searchParams.set("extension", "jpg,png,webp");

  let res;
  try {
    res = await fetch(url, { headers: { "user-agent": imageUserAgent } });
  } catch (error) {
    console.warn(`Skipping Openverse search for "${query}": ${error.message}`);
    return [];
  }
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || [])
    .map((item) => {
      const imageUrl = item.thumbnail || item.url;
      return imageUrl ? {
        title: item.title || query,
        url: imageUrl,
        sourceUrl: item.foreign_landing_url || item.url,
        creator: item.creator,
        license: item.license,
        provider: "Openverse",
      } : null;
    })
    .filter(Boolean)
    .filter((item) => /\.(jpe?g|png|webp)(\?|$)/i.test(new URL(item.url).pathname + new URL(item.url).search))
    .filter(isHistoricalImage)
    .sort((a, b) => imageRank(b) - imageRank(a));
}

async function download(url, output) {
  const res = await fetch(url, { headers: { "user-agent": imageUserAgent, accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" } });
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(output, bytes);
}

function imagenModelName() {
  return process.env.GEMINI_IMAGE_MODEL || process.env.IMAGEN_MODEL || "imagen-4.0-generate-001";
}

async function callImagen(prompt, negativePrompt) {
  const { projectId, location } = requireVertexConfig();
  const accessToken = vertexAccessToken();
  const model = imagenModelName();
  const url = new URL(`https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:predict`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: "9:16",
        negativePrompt,
        includeRaiReason: true,
        includeSafetyAttributes: true,
        outputOptions: { mimeType: "image/png" },
        personGeneration: process.env.IMAGEN_PERSON_GENERATION || "allow_adult",
        safetySetting: process.env.IMAGEN_SAFETY_SETTING || "block_only_high",
      },
    }),
  });
  const bodyText = await res.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = { raw: bodyText };
  }
  if (!res.ok) {
    const message = body?.error?.message || bodyText || `HTTP ${res.status}`;
    throw new Error(`Imagen API request failed: ${message}`);
  }
  const prediction = body?.predictions?.find((item) => item?.bytesBase64Encoded);
  if (!prediction?.bytesBase64Encoded) {
    const reason = JSON.stringify(body?.predictions?.[0]?.raiFilteredReason || body?.predictions?.[0]?.safetyAttributes || body).slice(0, 320);
    throw new Error(`Imagen returned no image bytes. ${reason}`);
  }
  return {
    bytes: Buffer.from(prediction.bytesBase64Encoded, "base64"),
    mimeType: prediction.mimeType || "image/png",
    enhancedPrompt: prediction.prompt,
    model,
  };
}

function normalizeGeneratedImage(input, output, cwd) {
  run("ffmpeg", [
    "-y", "-i", input,
    "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1",
    "-frames:v", "1",
    "-update", "1",
    output,
  ], cwd);
}

function imageFileExtension(file, fallback = ".jpg") {
  const ext = path.extname(String(file || "").split("?")[0]).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : fallback;
}

function relativeAssetPath(fromDir, absolutePath) {
  return path.relative(fromDir, absolutePath).split(path.sep).join("/");
}

function imagenCacheKey(prompt, negativePrompt) {
  return createHash("sha256")
    .update(JSON.stringify({
      model: imagenModelName(),
      prompt,
      negativePrompt,
      aspectRatio: "9:16",
    }))
    .digest("hex")
    .slice(0, 24);
}

async function copyReusableImage(source, beat, index, dir) {
  const assetsDir = path.join(dir, "assets", "reused");
  await mkdir(assetsDir, { recursive: true });
  const ext = imageFileExtension(source.absolutePath || source.file);
  const filename = `scene-${String(index + 1).padStart(2, "0")}${ext}`;
  const outputPath = path.join(assetsDir, filename);
  await copyFile(source.absolutePath, outputPath);
  return {
    ...source.metadata,
    file: `assets/reused/${filename}`,
    provider: source.metadata?.provider || source.provider || "Reused image",
    reusedFrom: relativeAssetPath(projectRoot, source.absolutePath),
    isNewGeminiImage: false,
    prompt: beat.prompt,
    negativePrompt: beat.negativePrompt,
    start: beat.start,
    duration: beat.duration,
    motion: beat.motion,
    mood: beat.mood,
    captionRefs: beat.captionRefs,
  };
}

async function collectReusableImages(currentDir) {
  const sources = [];
  const seen = new Set();
  const includeDaily = imageReusePools.includes("daily");
  const includeAssets = imageReusePools.includes("assets");
  const currentRoot = path.resolve(currentDir);

  const addImage = (absolutePath, metadata = {}) => {
    const resolved = path.resolve(absolutePath);
    if (!existsSync(resolved)) return;
    if (!/\.(jpe?g|png|webp)$/i.test(resolved)) return;
    if (path.basename(resolved).startsWith("raw-scene-")) return;
    if (resolved.startsWith(`${currentRoot}${path.sep}`)) return;
    if (seen.has(resolved)) return;
    seen.add(resolved);
    sources.push({
      absolutePath: resolved,
      provider: metadata.provider,
      metadata,
    });
  };

  async function visitDaily(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visitDaily(fullPath);
        continue;
      }
      if (entry.name === "image-sources.json") {
        try {
          const items = JSON.parse(await readFile(fullPath, "utf8"));
          for (const item of items || []) {
            if (!item?.file) continue;
            addImage(path.resolve(path.dirname(fullPath), item.file), item);
          }
        } catch (error) {
          console.warn(`Ignoring reusable image history ${fullPath}: ${error.message}`);
        }
      } else if (/^scene-\d+\.(jpe?g|png|webp)$/i.test(entry.name) && /\/assets\/(?:generated|internet)\//.test(fullPath.split(path.sep).join("/"))) {
        addImage(fullPath, { provider: "Reused local image" });
      }
    }
  }

  async function visitAssets(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visitAssets(fullPath);
      } else if (entry.isFile()) {
        addImage(fullPath, { provider: "Project asset" });
      }
    }
  }

  if (includeDaily) await visitDaily(path.join(projectRoot, "daily"));
  if (includeAssets) await visitAssets(path.join(projectRoot, "assets", "internet"));
  return sources.sort((a, b) => a.absolutePath.localeCompare(b.absolutePath));
}

function chooseNewImageBeatIndexes(beats, maxNewImages) {
  if (maxNewImages <= 0 || !beats.length) return new Set();
  const indexes = new Set([0]);
  if (maxNewImages >= 2 && beats.length > 1) {
    const halfway = Math.max(1, beats.findIndex((beat) => beat.start >= beats[beats.length - 1].start / 2));
    let bestIndex = halfway;
    for (let index = halfway; index < beats.length; index += 1) {
      if (Number(beats[index].duration || 0) > Number(beats[bestIndex].duration || 0)) bestIndex = index;
    }
    indexes.add(bestIndex);
  }
  for (let index = 1; indexes.size < Math.min(maxNewImages, beats.length) && index < beats.length; index += 1) {
    indexes.add(index);
  }
  return indexes;
}

async function generateOrReuseImagen(beat, index, dir) {
  const assetsDir = path.join(dir, "assets", "generated");
  const cacheDir = path.join(projectRoot, "assets", "generated-cache");
  await mkdir(assetsDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });

  const negativePrompt = beat.negativePrompt || defaultNegativePrompt();
  const filename = `scene-${String(index + 1).padStart(2, "0")}.png`;
  const rawPath = path.join(assetsDir, `raw-${filename}`);
  const outputPath = path.join(assetsDir, filename);
  const cacheKey = imagenCacheKey(beat.prompt, negativePrompt);
  const cachedRawPath = path.join(cacheDir, `${cacheKey}-raw.png`);
  const cachedOutputPath = path.join(cacheDir, `${cacheKey}.png`);

  if (existsSync(cachedOutputPath)) {
    await copyFile(cachedOutputPath, outputPath);
    if (existsSync(cachedRawPath)) await copyFile(cachedRawPath, rawPath);
    return {
      file: `assets/generated/${filename}`,
      provider: "Vertex AI Imagen",
      model: imagenModelName(),
      prompt: beat.prompt,
      negativePrompt,
      reusedFrom: relativeAssetPath(projectRoot, cachedOutputPath),
      isNewGeminiImage: true,
      imageCacheHit: true,
      start: beat.start,
      duration: beat.duration,
      motion: beat.motion,
      mood: beat.mood,
      captionRefs: beat.captionRefs,
    };
  }

  const image = await callImagen(beat.prompt, negativePrompt);
  await writeFile(rawPath, image.bytes);
  await copyFile(rawPath, cachedRawPath);
  normalizeGeneratedImage(rawPath, outputPath, dir);
  await copyFile(outputPath, cachedOutputPath);
  return {
    file: `assets/generated/${filename}`,
    provider: "Vertex AI Imagen",
    model: image.model,
    prompt: beat.prompt,
    enhancedPrompt: image.enhancedPrompt,
    negativePrompt,
    reusedFrom: null,
    isNewGeminiImage: true,
    imageCacheHit: false,
    start: beat.start,
    duration: beat.duration,
    motion: beat.motion,
    mood: beat.mood,
    captionRefs: beat.captionRefs,
  };
}

function pickReusableImage(pool, lesson, beat, index) {
  if (!pool.length) return null;
  const seed = [
    lesson.title,
    index,
    (beat.captionRefs || []).join(","),
    beat.prompt,
  ].join("|");
  return pool[hashDate(seed) % pool.length];
}

async function ensureReusablePool(lesson, visualPlan, dir) {
  const pool = await collectReusableImages(dir);
  if (pool.length) return pool;
  console.warn("No reusable local images found; downloading historical fallback images.");
  const fallbackSources = await fallbackLessonImages(lesson, dir, visualPlan.beats.length);
  return fallbackSources.map((source) => ({
    absolutePath: path.resolve(dir, source.file),
    provider: source.provider,
    metadata: source,
  })).filter((source) => existsSync(source.absolutePath));
}

async function internetImagesForReusableBeats(lesson, visualPlan, newImageIndexes, dir) {
  const reusableBeats = visualPlan.beats
    .map((beat, index) => ({ beat, index }))
    .filter(({ index }) => !newImageIndexes.has(index));
  if (!reusableBeats.length) return new Map();

  const internetSources = await downloadLessonImages(lesson, dir, reusableBeats.length);
  const timedSources = new Map();
  for (const [sourceIndex, { beat, index }] of reusableBeats.entries()) {
    const source = internetSources[sourceIndex % internetSources.length];
    timedSources.set(index, {
      ...source,
      start: beat.start,
      duration: beat.duration,
      prompt: beat.prompt,
      negativePrompt: beat.negativePrompt,
      motion: beat.motion,
      mood: beat.mood,
      captionRefs: beat.captionRefs,
      isNewGeminiImage: false,
    });
  }
  return timedSources;
}

async function localReusableImagesForReusableBeats(lesson, visualPlan, newImageIndexes, dir) {
  const reusablePool = await ensureReusablePool(lesson, visualPlan, dir);
  const timedSources = new Map();
  for (const [index, beat] of visualPlan.beats.entries()) {
    if (newImageIndexes.has(index)) continue;
    const reusable = pickReusableImage(reusablePool, lesson, beat, index);
    if (!reusable) throw new Error("No reusable images available for non-Imagen beats.");
    timedSources.set(index, await copyReusableImage(reusable, beat, index, dir));
  }
  return timedSources;
}

async function generateLessonImages(lesson, visualPlan, dir) {
  const enabled = process.env.ENABLE_GEMINI_IMAGES !== "false" && process.env.ENABLE_GEMINI_IMAGES !== "0";
  const newImageBudget = enabled ? Math.min(maxNewGeminiImagesPerVideo, visualPlan.beats.length) : 0;
  const newImageIndexes = chooseNewImageBeatIndexes(visualPlan.beats, newImageBudget);
  const reusedCount = visualPlan.beats.length - newImageIndexes.size;
  console.log(`Gemini image budget: ${newImageIndexes.size} new image(s), ${reusedCount} fresh internet image(s)`);

  let nonImagenSources = new Map();
  if (reusedCount > 0) {
    try {
      nonImagenSources = await internetImagesForReusableBeats(lesson, visualPlan, newImageIndexes, dir);
    } catch (error) {
      console.warn(`Fresh internet images unavailable; falling back to local reusable images: ${error.message}`);
      nonImagenSources = await localReusableImagesForReusableBeats(lesson, visualPlan, newImageIndexes, dir);
    }
  }
  const sources = [];
  for (const [index, beat] of visualPlan.beats.entries()) {
    if (newImageIndexes.has(index)) {
      sources.push(await generateOrReuseImagen(beat, index, dir));
      continue;
    }
    const internetSource = nonImagenSources.get(index);
    if (!internetSource) throw new Error("No internet image available for non-Imagen beat.");
    sources.push(internetSource);
  }
  return sources;
}

function applyVisualTimingToSources(sources, visualPlan) {
  const usable = sources.filter((source) => source?.file);
  if (!usable.length) return [];
  return visualPlan.beats.map((beat, index) => ({
    ...usable[index % usable.length],
    file: usable[index % usable.length].file,
    repeatedFrom: index >= usable.length ? usable[index % usable.length].file : usable[index % usable.length].repeatedFrom,
    start: beat.start,
    duration: beat.duration,
    prompt: beat.prompt,
    negativePrompt: beat.negativePrompt,
    motion: beat.motion,
    mood: beat.mood,
    captionRefs: beat.captionRefs,
  }));
}

async function downloadLessonImages(lesson, dir, targetCount = 7) {
  const assetsDir = path.join(dir, "assets", "internet");
  await mkdir(assetsDir, { recursive: true });
  const candidates = [];
  const seen = new Set();
  const usedImageUrls = await collectUsedImageUrls();
  const fallbackQueries = fallbackQueriesForLesson(lesson);

  const lessonQueries = lesson.searchQueries.flatMap((query) => [
    { query: `${query} painting`, queryRoot: query, isFallback: false },
    { query: `${query} scroll`, queryRoot: query, isFallback: false },
    { query: `${query} engraving`, queryRoot: query, isFallback: false },
    { query: `${query} ancient Chinese`, queryRoot: query, isFallback: false },
    { query: `${query} museum artifact`, queryRoot: query, isFallback: false },
  ]);
  const queryVariants = [
    ...lessonQueries,
    ...fallbackQueries.map((query) => ({ query, queryRoot: query, isFallback: true })),
  ];

  for (const queryVariant of queryVariants) {
    const results = [
      ...await commonsSearch(queryVariant.query, 10),
      ...await openverseSearch(queryVariant.query, 10),
    ];
    for (const item of results) {
      const identity = imageIdentity(item);
      if (seen.has(identity)) continue;
      seen.add(identity);
      candidates.push({
        ...item,
        query: queryVariant.query,
        queryRoot: queryVariant.queryRoot,
        isFallback: queryVariant.isFallback,
        documentLike: isDocumentLikeImage(item),
        usedBefore: usedImageUrls.has(canonicalImageUrl(item.sourceUrl)) || usedImageUrls.has(canonicalImageUrl(item.url)),
      });
    }
  }

  const selected = selectDiverseImageCandidates(candidates, lesson, targetCount);
  const minRequired = Math.min(3, targetCount);

  if (selected.length < minRequired) {
    throw new Error(`Not enough historical image candidates for ${lesson.chapter}; found ${selected.length} from ${candidates.length} candidates`);
  }

  const sources = [];
  for (const item of selected) {
    if (sources.length >= targetCount) break;
    const ext = path.extname(new URL(item.url).pathname).split("?")[0] || ".jpg";
    const filename = `scene-${String(sources.length + 1).padStart(2, "0")}${ext.toLowerCase()}`;
    try {
      await download(item.url, path.join(assetsDir, filename));
      sources.push({
        file: `assets/internet/${filename}`,
        title: item.title,
        url: item.sourceUrl || item.url,
        downloadedUrl: item.url,
        query: item.query,
        queryRoot: item.queryRoot,
        provider: item.provider,
        historicalScore: historicalScore(item),
        documentLike: item.documentLike,
        usedBefore: item.usedBefore,
      });
    } catch (error) {
      console.warn(`Skipping image: ${item.url} (${error.message})`);
    }
  }

  if (sources.length < minRequired) {
    throw new Error(`Not enough downloadable historical images for ${lesson.chapter}; found ${sources.length}`);
  }

  const downloaded = [...sources];
  while (sources.length < targetCount) {
    const source = downloaded[sources.length % downloaded.length];
    const ext = path.extname(source.file) || ".jpg";
    const filename = `scene-${String(sources.length + 1).padStart(2, "0")}${ext}`;
    await copyFile(path.join(dir, source.file), path.join(assetsDir, filename));
    sources.push({ ...source, file: `assets/internet/${filename}`, repeatedFrom: source.file });
  }
  return sources;
}

async function fallbackLessonImages(lesson, dir, targetCount) {
  const sources = await downloadLessonImages(lesson, dir, targetCount);
  return sources.slice(0, Math.max(3, Math.min(targetCount, sources.length)));
}

function fallbackQueriesForLesson(lesson) {
  const shared = [
    "Chinese bamboo slips museum",
    "ancient Chinese scholar painting",
    "Chinese calligraphy manuscript",
    "ancient Chinese landscape painting",
    "Chinese dynasty painting",
    "Chinese historical museum artifact",
    "Chinese temple historical painting",
    "Terracotta army soldiers",
  ];
  if (lesson.sourceAuthor === "Tôn Tử") {
    return [
      "Chinese Art of War Sun Tzu painting",
      "Sun Tzu portrait painting",
      "Sun Tzu bamboo slips",
      "ancient Chinese battle painting",
      "Three Kingdoms battle painting",
      "Battle of Red Cliffs painting",
      "Guan Yu painting",
      "Zhuge Liang painting",
      "Chinese military scroll painting",
      "Chinese military map",
      "ancient China map",
      "ancient Chinese fortress painting",
      "Great Wall ancient China painting",
      "Chinese dynasty warriors painting",
      ...shared,
    ];
  }
  if (lesson.sourceAuthor === "Khổng Tử") {
    return [
      "Confucius portrait painting",
      "Confucius teaching disciples painting",
      "Analects Chinese manuscript",
      "Confucius temple historical",
      "Confucian scholar painting",
      "ancient Chinese academy painting",
      "Chinese sage teaching painting",
      ...shared,
    ];
  }
  if (lesson.sourceAuthor === "Lão Tử") {
    return [
      "Laozi portrait painting",
      "Lao Tzu riding ox painting",
      "Tao Te Ching Chinese manuscript",
      "Dao De Jing calligraphy",
      "Chinese sage mountain painting",
      "ancient Chinese river landscape painting",
      ...shared,
    ];
  }
  return shared;
}

function hashtagify(text) {
  return `#${slugify(text).replace(/-/g, "")}`;
}

function uniqueList(items) {
  return [...new Set(items.filter(Boolean))];
}

function variantSeed(lesson, purpose = "copy") {
  return `${date}|${slot}|${lesson.sourceAuthor}|${lesson.sourceWork}|${lesson.chapter}|${lesson.title}|${purpose}`;
}

function ensureSentence(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return /[.!?…]$/.test(value) ? value : `${value}.`;
}

function capitalizeFirstLetter(text) {
  return String(text || "").replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("vi-VN"));
}

function normalizeNarrationSegment(text) {
  return capitalizeFirstLetter(ensureSentence(text));
}

function isPunctuationOnly(text) {
  const clean = auditHumanCopy(text);
  return !normalizeForMatch(clean);
}

function auditHumanCopy(text) {
  return String(text || "")
    .replace(/Bài học hôm nay:\s*/gi, "")
    .replace(/Comment\s+"CỔ NHÂN"\s+nếu muốn phần tiếp theo\./gi, "")
    .replace(/\b(cực kỳ|vô cùng)\s+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function asCleanString(value, fieldName) {
  const text = auditHumanCopy(value);
  if (!text) throw new Error(`Gemini copy missing ${fieldName}.`);
  return text;
}

function asCleanStringArray(value, fieldName, { min = 1, max = 20 } = {}) {
  if (!Array.isArray(value)) throw new Error(`Gemini copy field ${fieldName} must be an array.`);
  const items = value.map((item) => auditHumanCopy(item)).filter((item) => item && !isPunctuationOnly(item));
  if (items.length < min) throw new Error(`Gemini copy field ${fieldName} needs at least ${min} item(s).`);
  return items.slice(0, max);
}

function sourceCredit(lesson) {
  return `${lesson.sourceAuthor}, ${lesson.sourceWork}, chương ${lesson.chapter}: ${lesson.viTitle}`;
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((part) => auditHumanCopy(part))
    .filter((part) => part && !isPunctuationOnly(part));
}

function splitLongCaption(text, maxChars = 68) {
  const clean = auditHumanCopy(text);
  if (!clean || isPunctuationOnly(clean)) return [];
  if (clean.length <= maxChars) return [clean];
  const words = clean.split(/\s+/).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((chunk) => chunk && !isPunctuationOnly(chunk));
}

function narrationBundle(scriptSegments) {
  const parts = asCleanStringArray(scriptSegments, "scriptSegments", { min: 12, max: 18 })
    .map((part) => normalizeNarrationSegment(part));
  const segments = parts.flatMap((part) => splitSentences(part).flatMap((sentence) => splitLongCaption(sentence)));
  if (segments.some((segment) => isPunctuationOnly(segment))) {
    throw new Error("Narration contains a punctuation-only caption segment.");
  }
  return {
    text: auditHumanCopy(segments.join(" ")),
    segments,
  };
}

function wordsForTiming(text) {
  return normalizeForMatch(text).split(/\s+/).filter(Boolean);
}

function fallbackCaptionTracks(segments, duration) {
  const startAt = 0.2;
  const endAt = Math.max(startAt + 0.5, duration - 0.45);
  const available = Math.max(0.5, endAt - startAt);
  const weights = segments.map((segment) => Math.max(1, wordsForTiming(segment).length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || segments.length || 1;
  let cursor = startAt;
  return segments.map((text, index) => {
    const isLast = index === segments.length - 1;
    const segmentDuration = isLast ? endAt - cursor : available * weights[index] / totalWeight;
    const start = Number(cursor.toFixed(2));
    const end = isLast ? endAt : Math.min(endAt, cursor + segmentDuration);
    cursor = end;
    return {
      text,
      start,
      duration: Number(Math.max(0.45, end - start).toFixed(2)),
    };
  });
}

const geminiCopySchema = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Short Vietnamese social-video title focused on the lesson idea, not the author.",
    },
    scriptSegments: {
      type: "array",
      minItems: 12,
      maxItems: 18,
      items: {
        type: "string",
        description: "One connected Vietnamese narration beat in a sharp everyday voice.",
      },
    },
    captionBase: {
      type: "string",
      description: "Vietnamese caption body without hashtags. Must include a final source line.",
    },
    captions: {
      type: "object",
      properties: {
        tiktok: { type: "string" },
        "youtube-short": { type: "string" },
        "facebook-reel": { type: "string" },
      },
      required: ["tiktok", "youtube-short", "facebook-reel"],
    },
    hashtags: {
      type: "array",
      minItems: 8,
      maxItems: 16,
      items: { type: "string" },
    },
    youtubeTags: {
      type: "array",
      minItems: 8,
      maxItems: 16,
      items: { type: "string" },
    },
  },
  required: ["title", "scriptSegments", "captionBase", "captions", "hashtags", "youtubeTags"],
};

const visualPlanSchema = {
  type: "object",
  properties: {
    style: {
      type: "string",
      description: "One concise English sentence describing the shared visual style.",
    },
    beats: {
      type: "array",
      minItems: 5,
      maxItems: 14,
      items: {
        type: "object",
        properties: {
          start: { type: "number" },
          duration: { type: "number" },
          prompt: { type: "string" },
          negativePrompt: { type: "string" },
          motion: {
            type: "string",
            description: "One of: push, pull, drift-left, drift-right, rise, descend, impact.",
          },
          mood: { type: "string" },
          captionRefs: {
            type: "array",
            items: { type: "integer" },
          },
        },
        required: ["start", "duration", "prompt", "negativePrompt", "motion", "mood", "captionRefs"],
      },
    },
  },
  required: ["style", "beats"],
};

function geminiCopyPrompt(lesson) {
  return [
    "Bạn là một người viết narration video ngắn tiếng Việt, giọng đời thường sắc bén.",
    "Hãy viết nội dung social video từ dữ liệu lesson bên dưới.",
    "",
    "Yêu cầu narration:",
    "- Viết như một người từng trải đang nói với một người khác, không như bài văn mẫu.",
    "- Target 75 đến 90 giây khi đọc thành tiếng.",
    "- Viết 12 đến 18 đoạn/câu, ưu tiên tổng khoảng 1050 đến 1320 ký tự để giữ nhịp video gọn.",
    "- Đi theo arc rõ: hook đời thường, tình huống cụ thể, mâu thuẫn/cái giá, diễn giải bài học, hành động nhỏ có thể làm ngay, câu chốt nhớ lâu.",
    "- Mỗi đoạn phải nối ý với đoạn trước; đừng xếp nhiều câu cụt như khẩu hiệu.",
    "- Mở bằng một tình huống nhỏ, một nhận xét có hơi người, hoặc một câu nói thẳng.",
    "- Dùng hình ảnh đời sống cụ thể: cuộc họp, tin nhắn, deadline, tiền bạc, uy tín, thói quen, một quyết định bị trì hoãn.",
    "- Dùng từ bình thường: việc, chuyện, ghi chú, quên, làm thử, nhớ lại.",
    "- Có câu ngắn xen câu dài hơn; đừng để câu nào cũng cùng một nhịp.",
    "- Có thể dùng 'mình', 'bạn' vừa phải nếu hợp ngữ cảnh.",
    "- Tập trung vào một ý chính và một hành động nhỏ có thể làm ngay.",
    "- Không giới thiệu tiểu sử tác giả.",
    "- Không mở bằng nguồn/tác phẩm/chương.",
    "- Không đưa sourceCredit, sourceAuthor, sourceWork vào scriptSegments.",
    "- Không dùng lại một công thức câu dẫn cố định nếu lesson không cần.",
    "- Tránh giọng quảng cáo, sáo rỗng, thần thánh hóa cổ nhân.",
    "- Tránh các cụm trừu tượng kiểu: tri thức là sức mạnh, biến thành hành động, vòng lặp, niềm vui thực sự, phản xạ, bài học cuộc sống.",
    "- Tránh các câu lặp máy móc kiểu: người khôn không đợi ai ép, việc này nghe đơn giản nhưng tích lại mạnh, rồi đi tiếp thôi.",
    "- Tránh kết bằng khẩu hiệu; kết bằng một câu nhắc cụ thể.",
    "",
    "Yêu cầu caption:",
    "- captionBase không có hashtag.",
    "- captions.* là captionBase cộng hashtag phù hợp từng nền tảng.",
    "- Giữ một dòng nguồn ngắn ở cuối captionBase.",
    "- Chỉ dùng sourceCredit cho dòng nguồn trong caption, không dùng trong script.",
    "- Hashtag đầu tiên nên bám vào bài học, không phải tên tác giả.",
    "",
    "Dữ liệu lesson:",
    JSON.stringify({
      sourceAuthor: lesson.sourceAuthor,
      sourceWork: lesson.sourceWork,
      chapter: lesson.chapter,
      title: lesson.title,
      viTitle: lesson.viTitle,
      hook: lesson.hook,
      angle: lesson.angle,
      takeaway: lesson.takeaway,
      beats: lesson.beats,
      sourceCredit: sourceCredit(lesson),
      platforms: supportedPlatforms,
      platformHashtags,
    }, null, 2),
  ].join("\n");
}

function visualPlanPrompt({ lesson, platform, duration, captionTracks }) {
  return [
    "You are a cinematic visual director for vertical Vietnamese short videos.",
    "Create a flexible visual plan from the narration timing. The number of images must follow the content, not a fixed template.",
    "",
    "Rules:",
    `- Produce ${visualBeatMinCount} to ${visualBeatMaxCount} visual beats.`,
    `- Target ${visualBeatMin.toFixed(1)} to ${visualBeatMax.toFixed(1)} seconds per visual beat when the content allows it.`,
    "- Merge adjacent captions when they describe the same location/action/idea.",
    "- Split when the meaning, location, visual metaphor, or emotional action changes.",
    "- Cover the full duration from 0 to the final timestamp with no gaps.",
    "- Use exact start/duration seconds derived from the provided caption timings.",
    "- Include the hook as the first visual beat, even if captions begin later.",
    "- Prompts must be in English and image-generation ready.",
    "- Prompts must be specific: subject, setting, action, camera angle, lighting, color, emotional beat.",
    "- Shared style: ancient Chinese war strategy, cinematic epic realism, vertical 9:16, high contrast, smoky torchlight, ember gold and deep crimson, no text, no logos, no modern objects.",
    "- Avoid graphic gore. War imagery may be tense and dramatic, but not explicit.",
    "- negativePrompt must include: text, typography, logo, watermark, modern clothes, modern weapons, guns, tanks, phones, city skyscrapers, gore, extra fingers, deformed hands.",
    "",
    "Return JSON only.",
    "",
    "Input:",
    JSON.stringify({
      platform,
      duration,
      lesson: {
        sourceAuthor: lesson.sourceAuthor,
        sourceWork: lesson.sourceWork,
        chapter: lesson.chapter,
        title: lesson.title,
        viTitle: lesson.viTitle,
        hook: lesson.hook,
        angle: lesson.angle,
        takeaway: lesson.takeaway,
      },
      captions: captionTracks.map((caption, index) => ({
        index: index + 1,
        text: caption.text,
        start: caption.start,
        duration: caption.duration,
      })),
    }, null, 2),
  ].join("\n");
}

function extractGeminiJson(response) {
  const text = response?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Gemini response did not contain JSON.");
    return JSON.parse(match[0]);
  }
}

function requireVertexConfig() {
  const projectId = process.env.VERTEX_PROJECT_ID?.trim();
  const location = process.env.VERTEX_LOCATION?.trim();
  if (!projectId || !location) {
    throw new Error("Missing Vertex AI config. Set VERTEX_PROJECT_ID and VERTEX_LOCATION before running daily generation.");
  }
  return { projectId, location };
}

function vertexAccessToken() {
  const envToken = process.env.VERTEX_ACCESS_TOKEN?.trim();
  if (envToken) return envToken;

  const result = spawnSync("gcloud", ["auth", "application-default", "print-access-token", "--quiet"], {
    encoding: "utf8",
    env: { ...process.env },
  });
  if (result.error || result.status !== 0) {
    throw new Error([
      "Unable to get Vertex AI access token from gcloud ADC.",
      "Run: gcloud auth application-default login",
      result.error?.message || result.stderr || result.stdout || "",
    ].filter(Boolean).join(" "));
  }
  const token = result.stdout.trim();
  if (!token) {
    throw new Error("gcloud returned an empty Vertex AI access token. Run: gcloud auth application-default login");
  }
  return token;
}

async function callGeminiForCopy(lesson, attempt) {
  const { projectId, location } = requireVertexConfig();
  const accessToken = vertexAccessToken();
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
  const temperature = clamp(Number(process.env.GEMINI_TEMPERATURE || 0.8), 0, 2);
  const url = new URL(`https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: geminiCopyPrompt(lesson) }] }],
      generationConfig: {
        temperature: Number(Math.max(0.1, temperature - attempt * 0.2).toFixed(2)),
        responseMimeType: "application/json",
        responseSchema: geminiCopySchema,
      },
    }),
  });
  const bodyText = await res.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = { raw: bodyText };
  }
  if (!res.ok) {
    const message = body?.error?.message || bodyText || `HTTP ${res.status}`;
    throw new Error(`Gemini API request failed: ${message}`);
  }
  return extractGeminiJson(body);
}

async function callGeminiForVisualPlan({ lesson, platform, duration, captionTracks }) {
  const { projectId, location } = requireVertexConfig();
  const accessToken = vertexAccessToken();
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
  const url = new URL(`https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: visualPlanPrompt({ lesson, platform, duration, captionTracks }) }] }],
      generationConfig: {
        temperature: 0.55,
        responseMimeType: "application/json",
        responseSchema: visualPlanSchema,
      },
    }),
  });
  const bodyText = await res.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = { raw: bodyText };
  }
  if (!res.ok) {
    const message = body?.error?.message || bodyText || `HTTP ${res.status}`;
    throw new Error(`Gemini visual plan request failed: ${message}`);
  }
  return extractGeminiJson(body);
}

function defaultNegativePrompt() {
  return "text, typography, logo, watermark, modern clothes, modern weapons, guns, tanks, phones, city skyscrapers, gore, extra fingers, deformed hands, low resolution, blurry face";
}

function visualStylePrefix() {
  return "Ancient Chinese war strategy, cinematic epic realism, vertical 9:16 composition, high contrast, smoky torchlight, ember gold and deep crimson palette, dramatic depth, no text, no logos, no modern objects.";
}

function fallbackPromptForCaption(text, index, lesson) {
  const normalized = normalizeForMatch(text);
  let subject = "an ancient Chinese strategist studying a battlefield map where one weak point glows";
  if (normalized.includes("phong thu") || normalized.includes("khong phong thu")) subject = "a guarded fortress with an unprotected side gate hidden in smoke";
  else if (normalized.includes("chu quan") || normalized.includes("khong kip")) subject = "a confident war camp caught unaware as shadows move behind the tents";
  else if (normalized.includes("tranh cai")) subject = "a noisy ancient court argument while one calm strategist steps away";
  else if (normalized.includes("canh tranh") || normalized.includes("chen")) subject = "a crowded battlefield road and one quiet empty path opening beside it";
  else if (normalized.includes("tien") || normalized.includes("toc do")) subject = "heavy gold chests beside a swift messenger horse racing through torchlight";
  else if (normalized.includes("tieng on") || normalized.includes("chinh xac")) subject = "chaotic drums and banners pierced by one precise arrow aimed at a tiny target";
  else if (normalized.includes("buc tuong")) subject = "a massive ancient city wall too thick to attack directly";
  else if (normalized.includes("canh cua")) subject = "a hidden wooden door revealed in the side of an ancient stone wall";
  else if (normalized.includes("chien luoc") || normalized.includes("mot don")) subject = "all forces converging into one bright decisive strike on a battlefield map";
  return [
    visualStylePrefix(),
    `Scene ${index + 1}: ${subject}.`,
    `Narration meaning: ${text}`,
    "Low angle cinematic camera, strong silhouette, volumetric smoke, sharp central focal point, poster-like clarity.",
  ].join(" ");
}

function fallbackVisualPlan({ lesson, duration, captionTracks }) {
  const beats = [];
  const captions = [{ text: lesson.hook, start: 0, duration: Math.min(3, duration), hook: true }, ...captionTracks];
  let group = null;
  const pushGroup = () => {
    if (!group) return;
    const end = Math.min(duration, Math.max(...group.items.map((item) => item.start + item.duration)));
    beats.push({
      start: group.start,
      duration: Number(Math.max(0.5, end - group.start).toFixed(2)),
      prompt: fallbackPromptForCaption(group.items.map((item) => item.text).join(" "), beats.length, lesson),
      negativePrompt: defaultNegativePrompt(),
      motion: ["push", "drift-left", "drift-right", "impact"][beats.length % 4],
      mood: "cinematic strategic tension",
      captionRefs: group.items.filter((item) => !item.hook).map((item) => captionTracks.indexOf(item) + 1).filter((index) => index > 0),
    });
    group = null;
  };

  for (const item of captions) {
    const itemEnd = item.start + item.duration;
    if (!group) {
      group = { start: item.start, items: [item] };
      continue;
    }
    const groupEnd = Math.max(...group.items.map((entry) => entry.start + entry.duration));
    const mergedDuration = itemEnd - group.start;
    const shouldMerge = mergedDuration <= visualBeatMax && beats.length + (captions.length - captions.indexOf(item)) > visualBeatMinCount;
    if (shouldMerge || groupEnd - group.start < visualBeatMin) {
      group.items.push(item);
    } else {
      pushGroup();
      group = { start: item.start, items: [item] };
    }
  }
  pushGroup();

  while (beats.length > visualBeatMax) {
    const last = beats.pop();
    const previous = beats[beats.length - 1];
    previous.duration = Number((last.start + last.duration - previous.start).toFixed(2));
    previous.prompt = `${previous.prompt} Continue the same visual metaphor into: ${last.prompt}`;
    previous.captionRefs = uniqueList([...previous.captionRefs, ...last.captionRefs]);
  }

  if (beats[0]) beats[0].start = 0;
  for (let i = 0; i < beats.length; i += 1) {
    const nextStart = i === beats.length - 1 ? duration : beats[i + 1].start;
    beats[i].duration = Number(Math.max(0.5, nextStart - beats[i].start).toFixed(2));
  }
  return {
    style: visualStylePrefix(),
    beats,
  };
}

function normalizeVisualPlan(rawPlan, { lesson, duration, captionTracks }) {
  const fallback = fallbackVisualPlan({ lesson, duration, captionTracks });
  const rawBeats = Array.isArray(rawPlan?.beats) ? rawPlan.beats : [];
  if (rawBeats.length < visualBeatMinCount || rawBeats.length > visualBeatMaxCount) return fallback;

  const sorted = rawBeats
    .map((beat, index) => ({
      start: Number(beat.start),
      duration: Number(beat.duration),
      prompt: auditHumanCopy(beat.prompt),
      negativePrompt: auditHumanCopy(beat.negativePrompt) || defaultNegativePrompt(),
      motion: ["push", "pull", "drift-left", "drift-right", "rise", "descend", "impact"].includes(beat.motion) ? beat.motion : "push",
      mood: auditHumanCopy(beat.mood) || "cinematic strategic tension",
      captionRefs: Array.isArray(beat.captionRefs) ? beat.captionRefs.map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= captionTracks.length) : [],
      originalIndex: index,
    }))
    .filter((beat) => Number.isFinite(beat.start) && Number.isFinite(beat.duration) && beat.duration > 0 && beat.prompt)
    .sort((a, b) => a.start - b.start || a.originalIndex - b.originalIndex);

  if (sorted.length < visualBeatMinCount) return fallback;

  const beats = sorted.slice(0, visualBeatMaxCount).map((beat, index, items) => {
    const start = index === 0 ? 0 : clamp(beat.start, 0, duration);
    const nextStart = index === items.length - 1 ? duration : clamp(items[index + 1].start, start + 0.5, duration);
    return {
      start: Number(start.toFixed(2)),
      duration: Number(Math.max(0.5, nextStart - start).toFixed(2)),
      prompt: `${visualStylePrefix()} ${beat.prompt}`,
      negativePrompt: beat.negativePrompt.includes("text") ? beat.negativePrompt : `${beat.negativePrompt}, ${defaultNegativePrompt()}`,
      motion: beat.motion,
      mood: beat.mood,
      captionRefs: uniqueList(beat.captionRefs),
    };
  }).filter((beat) => beat.duration > 0);

  if (!beats.length || Math.abs(beats[0].start) > 0.01) return fallback;
  const end = beats[beats.length - 1].start + beats[beats.length - 1].duration;
  if (Math.abs(end - duration) > 0.12) return fallback;
  return {
    style: auditHumanCopy(rawPlan?.style) || visualStylePrefix(),
    beats,
  };
}

async function generateVisualPlan({ lesson, platform, duration, captionTracks }) {
  if (process.env.ENABLE_GEMINI_VISUAL_PLAN === "false" || process.env.ENABLE_GEMINI_VISUAL_PLAN === "0") {
    return fallbackVisualPlan({ lesson, duration, captionTracks });
  }
  try {
    const raw = await callGeminiForVisualPlan({ lesson, platform, duration, captionTracks });
    return normalizeVisualPlan(raw, { lesson, duration, captionTracks });
  } catch (error) {
    console.warn(`Gemini visual plan skipped: ${error.message}`);
    return fallbackVisualPlan({ lesson, duration, captionTracks });
  }
}

function normalizeHashtag(value) {
  const text = auditHumanCopy(value);
  if (!text) return "";
  return text.startsWith("#") ? hashtagify(text.slice(1)) : hashtagify(text);
}

function appendHashtags(caption, tags) {
  const body = auditHumanCopy(caption);
  const tagLine = uniqueList(tags.map(normalizeHashtag)).join(" ");
  return tagLine ? `${body}\n\n${tagLine}` : body;
}

function stripCaptionNoise(caption, lesson) {
  return stripSourceLeadIns(auditHumanCopy(caption), lesson)
    .replace(/Nguồn\s*:[^\n#]+\.?/gi, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/#[\p{L}\p{N}_-]+/gu, "").trim())
    .filter((line) => line && !/^Nguồn\s*:/i.test(line))
    .join("\n");
}

function ensureSourceLine(caption, lesson) {
  const body = stripCaptionNoise(caption, lesson);
  const sourceLine = `Nguồn: ${sourceCredit(lesson)}.`;
  return body ? `${body}\n${sourceLine}` : sourceLine;
}

function stripScriptSourceMentions(segment, lesson) {
  return stripSourceLeadIns(auditHumanCopy(segment), lesson).trim();
}

function stripSourceLeadIns(text, lesson) {
  const author = escapeRegExp(lesson.sourceAuthor);
  const sourceWork = escapeRegExp(lesson.sourceWork);
  const sourceTitlePrefix = escapeRegExp(lesson.sourceTitlePrefix);
  return String(text || "")
    .replace(new RegExp(`\\b(?:như\\s+)?(?:${author})(?:\\s+[\\p{L}\\p{N}]+){0,6}\\s+(?:nói|nhắc|dạy|viết)(?:\\s+[\\p{L}\\p{N}]+){0,4}\\s*[:,]?\\s*`, "giu"), "")
    .replace(new RegExp(`\\b(?:trong\\s+)?(?:${sourceWork})\\s*,?\\s*`, "giu"), "")
    .replace(new RegExp(`\\b(?:${sourceTitlePrefix})\\s*,?\\s*`, "giu"), "");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateScriptSegments(segments, lesson) {
  const sourceTerms = [
    lesson.sourceAuthor,
    lesson.sourceWork,
    lesson.sourceTitlePrefix,
  ].map(normalizeForMatch).filter(Boolean);
  const clean = asCleanStringArray(segments, "scriptSegments", { min: 12, max: 18 })
    .map((segment) => stripScriptSourceMentions(segment, lesson))
    .filter(Boolean)
    .filter((segment) => !isPunctuationOnly(segment))
    .filter((segment) => {
      const normalized = normalizeForMatch(segment);
      return !sourceTerms.some((term) => normalized.includes(term));
    })
    .map((segment) => normalizeNarrationSegment(segment));
  if (clean.length < 12) {
    throw new Error(`Gemini script needs at least 12 usable narration segment(s); received ${clean.length}.`);
  }
  const scriptText = normalizeForMatch(clean.join(" "));
  const introText = normalizeForMatch(clean.slice(0, 2).join(" "));
  const blockedIntroTerms = [
    lesson.sourceAuthor,
    lesson.sourceWork,
    lesson.sourceTitlePrefix,
    "sinh ra",
    "tieu su",
    "tac gia",
  ].map(normalizeForMatch).filter(Boolean);
  if (blockedIntroTerms.some((term) => introText.includes(term))) {
    throw new Error("Gemini script includes author/source intro instead of lesson content.");
  }
  const stiffPhrases = [
    "tri thuc la suc manh",
    "bien kien thuc thanh hanh dong",
    "vong lap",
    "niem vui thuc su",
    "luyen no thanh phan xa",
    "bai hoc cuoc song",
    "nguoi khon khong doi ai ep",
    "nguoi khon dau doi doi ep",
    "nguoi khon nguoi ta khong doi",
    "viec nay nghe don gian nhung tich lai thi manh",
    "viec nay trong chang to tat nhung tich lai thi rat manh",
    "roi di tiep thoi",
  ];
  if (stiffPhrases.some((phrase) => scriptText.includes(phrase))) {
    throw new Error("Gemini script sounds too abstract/formulaic; retrying for a more human version.");
  }
  return clean;
}

function reorderAuthorTagsLast(tags, lesson) {
  const authorTag = normalizeHashtag(lesson.sourceAuthor);
  const sourceTag = normalizeHashtag(lesson.sourceTitlePrefix);
  const chapterTag = normalizeHashtag(`chuong ${lesson.chapter} ${lesson.sourceAuthor}`);
  const authorish = new Set([authorTag, sourceTag, chapterTag].filter(Boolean));
  const normalized = uniqueList(tags.map(normalizeHashtag));
  return [
    ...normalized.filter((tag) => !authorish.has(tag)),
    ...normalized.filter((tag) => authorish.has(tag)),
  ];
}

function validateGeminiCopy(raw, lesson) {
  const title = asCleanString(raw?.title || lesson.hook, "title").slice(0, 90);
  const scriptSegments = validateScriptSegments(raw?.scriptSegments, lesson);
  const captionBase = ensureSourceLine(asCleanString(raw?.captionBase, "captionBase"), lesson);
  const lessonTags = [
    normalizeHashtag(lesson.hook),
    normalizeHashtag(lesson.takeaway),
    normalizeHashtag(lesson.sourceWork),
  ];
  const hashtags = reorderAuthorTagsLast([
    ...lessonTags,
    ...asCleanStringArray(raw?.hashtags, "hashtags", { min: 5, max: 18 }),
    ...supportedPlatforms.flatMap((platform) => platformHashtags[platform]),
  ], lesson).slice(0, 18);
  const platformCaption = (platform, limit) => {
    const generated = raw?.captions?.[platform];
    const body = ensureSourceLine(generated || captionBase, lesson);
    return appendHashtags(body, uniqueList([...platformHashtags[platform], ...hashtags]).slice(0, limit));
  };
  const captions = {
    tiktok: platformCaption("tiktok", 11),
    "youtube-short": platformCaption("youtube-short", 10),
    "facebook-reel": platformCaption("facebook-reel", 10),
  };
  const youtubeTags = uniqueList([
    ...asCleanStringArray(raw?.youtubeTags, "youtubeTags", { min: 5, max: 18 }),
    lesson.hook,
    lesson.viTitle,
    lesson.sourceWork,
  ]).slice(0, 18);
  return {
    title,
    scriptSegments,
    captionBase,
    captions,
    hashtags,
    youtubeTags,
  };
}

async function generateCopyPack(lesson) {
  requireVertexConfig();
  const attempts = Math.max(1, Number(process.env.GEMINI_MAX_RETRIES || 2) + 1);
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return validateGeminiCopy(await callGeminiForCopy(lesson, attempt), lesson);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        console.warn(`Gemini copy attempt ${attempt + 1}/${attempts} failed: ${error.message}`);
      }
    }
  }
  throw new Error(`Gemini copy generation failed after ${attempts} attempt(s): ${lastError?.message || "unknown error"}`);
}

function postMetadata(lesson, platform, duration, copyPack) {
  return {
    platform: "all",
    platforms: supportedPlatforms,
    title: copyPack.title,
    caption: copyPack.captions.tiktok,
    captions: copyPack.captions,
    duration,
    language: "vi",
    aspectRatio: "9:16",
    sourceLesson: {
      author: lesson.sourceAuthor,
      work: lesson.sourceWork,
      chapter: lesson.chapter,
      title: lesson.title,
      viTitle: lesson.viTitle,
      sourceUrl: lesson.sourceUrl,
    },
    hashtags: copyPack.hashtags,
    youtubeTags: copyPack.youtubeTags,
  };
}

function outlineSvgForImage(img, subjectOutlines) {
  const outline = subjectOutlines.get(img.file);
  if (!outline?.width || !outline?.height || !outline.paths?.length) return "";
  const paths = outline.paths.map((path, index) => (
    `<path class="subject-path" data-outline-index="${index}" d="${escapeHtml(path.d)}" />`
  )).join("\n          ");
  return `<svg class="subject-outline" viewBox="0 0 ${outline.width} ${outline.height}" preserveAspectRatio="xMidYMid slice" data-layout-ignore>
          <defs>
            <filter id="outline-glow-${slugify(img.file)}" x="-18%" y="-18%" width="136%" height="136%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter="url(#outline-glow-${slugify(img.file)})">
          ${paths}
          </g>
        </svg>`;
}

function subjectDepthForImage(img, subjectOutlines) {
  const outline = subjectOutlines.get(img.file);
  const parts = [];
  if (outline?.hasSubjectLayer && outline.shadowPng) {
    parts.push(`<img class="subject-shadow" src="${escapeHtml(outline.shadowPng)}" alt="" data-layout-ignore />`);
  }
  if (outline?.hasSubjectLayer && outline.subjectPng) {
    parts.push(`<img class="subject-cutout" src="${escapeHtml(outline.subjectPng)}" alt="" data-layout-ignore />`);
    parts.push(`<div class="subject-rim" data-layout-ignore></div>`);
  }
  const outlineSvg = outlineSvgForImage(img, subjectOutlines);
  if (outlineSvg) parts.push(outlineSvg);
  if (!parts.length) return "";
  return `<div class="subject-depth${outline?.hasSubjectLayer ? " has-cutout" : ""}" data-layout-ignore>
          ${parts.join("\n          ")}
        </div>`;
}

function renderHtml({ lesson, platform, imageSources, duration, captionTracks, subjectOutlines = new Map() }) {
  const transitionDur = 0.58;
  const scenes = imageSources.map((img, i) => {
    const start = Number(img.start ?? (i === 0 ? 0 : imageSources[i - 1].start + imageSources[i - 1].duration));
    const dur = Number(img.duration ?? Math.max(0.5, duration - start));
    return `<div id="scene-${i + 1}" class="clip scene" style="z-index:${i + 1}" data-start="${start}" data-duration="${dur}" data-track-index="${10 + i}">
        <div class="scene-bg" style="background-image:url('${img.file}')" data-layout-ignore></div>
        <div class="scene-plane" data-layout-allow-overflow>
          <img class="scene-main" src="${img.file}" alt="" />
          ${subjectDepthForImage(img, subjectOutlines)}
        </div>
        <div class="scene-light" data-layout-ignore></div>
        <div class="scene-vignette-pulse" data-layout-ignore></div>
      </div>`;
  }).join("\n      ");

  const captions = captionTracks || fallbackCaptionTracks(narrationBundle(lesson).segments, duration);
  const capSpans = captions.map((caption, i) => `<span id="cap-${i + 1}">${escapeHtml(caption.text)}</span>`).join("\n        ");
  const capBeats = captions.map((caption, i) => {
    return `["#cap-${i + 1}", ${Number(caption.start).toFixed(2)}, ${Number(caption.duration).toFixed(2)}]`;
  }).join(",\n        ");

  const sceneTweens = imageSources.map((img, i) => {
    const start = Number(img.start ?? 0);
    const dur = Number(img.duration ?? Math.max(0.5, duration - start));
    const x1 = i % 2 === 0 ? -150 : 190;
    const x2 = i % 2 === 0 ? 150 : -210;
    const y1 = i % 3 === 0 ? 20 : -50;
    const y2 = i % 3 === 0 ? -100 : 110;
    const bgX1 = Math.round(x1 * -0.32);
    const bgX2 = Math.round(x2 * -0.28);
    const bgY1 = Math.round(y1 * -0.22);
    const bgY2 = Math.round(y2 * -0.2);
    const rotateFrom = i % 2 === 0 ? -0.45 : 0.45;
    const rotateTo = i % 2 === 0 ? 0.55 : -0.55;
    const subjectX1 = i % 2 === 0 ? -subjectDepthPush * 0.35 : subjectDepthPush * 0.35;
    const subjectX2 = i % 2 === 0 ? subjectDepthPush : -subjectDepthPush;
    const subjectY1 = i % 3 === 0 ? -subjectDepthPush * 0.18 : subjectDepthPush * 0.12;
    const subjectY2 = i % 3 === 0 ? subjectDepthPush * 0.55 : -subjectDepthPush * 0.42;
    const fadeIn = i === 0 ? `tl.set("#scene-${i + 1}", { opacity: 1, filter: "blur(0px)" }, 0);` : `tl.fromTo("#scene-${i + 1}", { opacity: 0, filter: "blur(12px)" }, { opacity: 1, filter: "blur(0px)", duration: ${Math.min(transitionDur, dur * 0.35).toFixed(2)}, ease: "power2.out" }, ${Math.max(0, +(start - transitionDur * 0.72).toFixed(2))});`;
    const outline = subjectOutlines.get(img.file);
    const subjectMotion = outline?.hasSubjectLayer ? `
      tl.fromTo("#scene-${i + 1} .subject-depth", { scale: 1.012, x: ${subjectX1.toFixed(2)}, y: ${subjectY1.toFixed(2)} }, { scale: 1.055, x: ${subjectX2.toFixed(2)}, y: ${subjectY2.toFixed(2)}, duration: ${dur}, ease: "sine.inOut" }, ${start});
      tl.fromTo("#scene-${i + 1} .subject-cutout", { filter: "contrast(1.28) saturate(1.35) sepia(0.2) brightness(1)" }, { filter: "contrast(1.45) saturate(1.55) sepia(0.22) brightness(1.12)", duration: 0.42, ease: "power2.out", yoyo: true, repeat: 1 }, ${start + 0.38});
      tl.fromTo("#scene-${i + 1} .subject-shadow", { opacity: 0, x: -10, y: 20, scale: 0.985 }, { opacity: ${subjectShadowOpacity}, x: 24, y: 42, scale: 1.035, duration: 0.7, ease: "power2.out" }, ${start + 0.24});
      tl.fromTo("#scene-${i + 1} .subject-rim", { opacity: 0, xPercent: -120 }, { opacity: 0.46, xPercent: 130, duration: 1.05, ease: "power2.out" }, ${start + 0.44});` : "";
    return `${fadeIn}
      tl.fromTo("#scene-${i + 1} .scene-bg", { scale: ${1.66 + i * 0.035}, x: ${bgX1}, y: ${bgY1}, rotation: ${-rotateFrom * 0.4} }, { scale: ${1.82 + i * 0.035}, x: ${bgX2}, y: ${bgY2}, rotation: ${-rotateTo * 0.4}, duration: ${dur}, ease: "sine.inOut" }, ${start});
      tl.fromTo("#scene-${i + 1} .scene-plane", { scale: ${1.42 + i * 0.04}, x: ${x1}, y: ${y1}, rotation: ${rotateFrom} }, { scale: ${1.68 + i * 0.04}, x: ${x2}, y: ${y2}, rotation: ${rotateTo}, duration: ${dur}, ease: "sine.inOut" }, ${start});
      ${subjectMotion}
      tl.fromTo("#scene-${i + 1} .scene-vignette-pulse", { opacity: 0 }, { opacity: 0.46, duration: 0.26, ease: "power1.out", yoyo: true, repeat: 1 }, ${start + 0.34});
      tl.fromTo("#scene-${i + 1} .scene-light", { xPercent: -110, opacity: 0.05 }, { xPercent: 115, opacity: 0.2, duration: ${dur * 0.78}, ease: "sine.inOut" }, ${start + dur * 0.08});`;
  }).join("\n      ");

  const transitionFlashes = imageSources.slice(1).map((_, i) => {
    const start = +(Number(imageSources[i + 1].start ?? 0) - transitionDur * 0.54).toFixed(2);
    return `tl.fromTo("#transition-flash", { opacity: 0 }, { opacity: 0.32, duration: 0.14, ease: "power1.out", yoyo: true, repeat: 1, overwrite: "auto" }, ${start});`;
  }).join("\n      ");

  const outlineTweens = imageSources.map((img, i) => {
    const outline = subjectOutlines.get(img.file);
    if (!outline?.paths?.length) return "";
    const start = +(Number(img.start ?? 0) + 0.42).toFixed(2);
    const sceneEnd = Math.min(duration, Number(img.start ?? 0) + Number(img.duration ?? 0));
    const drawDuration = Math.min(0.92, Math.max(0.28, sceneEnd - start - 0.78));
    const dimStart = +(Math.min(start + drawDuration + 0.24, sceneEnd - 0.72)).toFixed(2);
    const fadeAt = +(Math.max(dimStart + 0.42, Math.min(duration - 0.6, sceneEnd - 0.44))).toFixed(2);
    return `tl.to("#scene-${i + 1} .subject-outline", { "--outline-offset": 0, duration: ${drawDuration.toFixed(2)}, ease: "power2.out" }, ${start});
      tl.to("#scene-${i + 1} .subject-outline", { opacity: 0.82, duration: 0.22, ease: "power2.out", overwrite: "auto" }, ${start});
      tl.to("#scene-${i + 1} .subject-outline", { opacity: 0.32, duration: 0.34, ease: "sine.inOut", overwrite: "auto" }, ${dimStart});
      tl.to("#scene-${i + 1} .subject-outline", { opacity: 0, duration: 0.28, ease: "power1.in", overwrite: "auto" }, ${fadeAt});`;
  }).filter(Boolean).join("\n      ");

  const captionPulseOpacity = Math.min(1, subjectLayerOpacity + 0.07).toFixed(2);
  const captionPulseTweens = captions.map((caption, i) => {
    const start = +(caption.start + 0.07).toFixed(2);
    const sceneIndex = Math.max(0, imageSources.findIndex((img, index) => {
      const sceneStart = Number(img.start ?? 0);
      const sceneEnd = sceneStart + Number(img.duration ?? 0);
      return start >= sceneStart && (start < sceneEnd || index === imageSources.length - 1);
    }));
    const outline = subjectOutlines.get(imageSources[sceneIndex]?.file);
    if (!outline?.hasSubjectLayer) return "";
    return `tl.fromTo("#scene-${sceneIndex + 1} .subject-cutout", { opacity: ${subjectLayerOpacity} }, { opacity: ${captionPulseOpacity}, duration: 0.16, ease: "power2.out", yoyo: true, repeat: 1 }, ${start});`;
  }).filter(Boolean).join("\n      ");

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #070302; font-family: sans-serif; }
      #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: #070302; color: #fff; }
      .clip { position: absolute; inset: 0; overflow: hidden; }
      .scene { opacity: 0; filter: blur(0px); transform-origin: center; will-change: opacity, filter, transform; }
      #scene-1 { opacity: 1; }
      .scene-bg, .scene-plane { position: absolute; inset: -108px; width: calc(100% + 216px); height: calc(100% + 216px); transform-origin: center; will-change: transform; }
      .scene-bg { inset: -180px; width: calc(100% + 360px); height: calc(100% + 360px); background-size: cover; background-position: center; filter: blur(18px) contrast(1.16) saturate(1.34) sepia(0.28) brightness(0.86); opacity: 0.64; }
      .scene-plane { overflow: visible; }
      .scene-main, .subject-depth, .subject-shadow, .subject-cutout, .subject-outline, .subject-rim { position: absolute; inset: 0; width: 100%; height: 100%; }
      .scene-main { object-fit: cover; }
      .scene-main { filter: contrast(1.24) saturate(1.48) sepia(0.28) brightness(0.92); }
      .subject-depth { z-index: 6; opacity: 1; pointer-events: none; transform-origin: center; will-change: transform; }
      .subject-shadow, .subject-cutout { object-fit: cover; pointer-events: none; }
      .subject-shadow { z-index: 5; opacity: 0; filter: blur(5px); mix-blend-mode: multiply; }
      .subject-cutout { z-index: 7; opacity: ${subjectLayerOpacity}; filter: contrast(1.28) saturate(1.35) sepia(0.2) brightness(1.04); mix-blend-mode: normal; }
      .subject-rim { z-index: 8; opacity: 0; transform: skewX(-16deg); background: linear-gradient(90deg, transparent 0%, rgba(255, 231, 157, 0.0) 32%, rgba(255, 231, 157, 0.42) 49%, rgba(255, 73, 39, 0.16) 56%, transparent 72%); mix-blend-mode: screen; filter: blur(8px); pointer-events: none; }
      .subject-outline { z-index: 9; opacity: 0; overflow: visible; pointer-events: none; }
      .subject-path { opacity: 0.8; fill: none; stroke: rgba(255, 239, 168, 0.9); stroke-width: 9; stroke-linecap: round; stroke-linejoin: round; stroke-dashoffset: var(--outline-offset); vector-effect: non-scaling-stroke; mix-blend-mode: screen; filter: drop-shadow(0 0 8px rgba(255, 210, 88, 0.78)) drop-shadow(0 0 18px rgba(255, 72, 35, 0.52)); }
      .scene::before { content: ""; position: absolute; z-index: 2; inset: 0; background: radial-gradient(circle at 28% 16%, rgba(255, 224, 68, 0.45), transparent 28%), radial-gradient(circle at 82% 72%, rgba(221, 23, 17, 0.48), transparent 40%), linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.18) 44%, rgba(0,0,0,0.74) 100%); mix-blend-mode: overlay; pointer-events: none; }
      .scene::after { content: ""; position: absolute; z-index: 3; inset: 0; background: radial-gradient(ellipse at center, transparent 34%, rgba(0,0,0,0.74) 100%), repeating-linear-gradient(0deg, rgba(255,255,255,0.022) 0 1px, transparent 1px 7px); opacity: 0.64; pointer-events: none; }
      .scene-light { position: absolute; z-index: 4; top: -18%; bottom: -18%; left: -32%; width: 44%; transform: skewX(-18deg); background: linear-gradient(90deg, transparent 0%, rgba(255, 224, 147, 0.32) 46%, transparent 100%); mix-blend-mode: soft-light; opacity: 0.1; pointer-events: none; will-change: transform, opacity; }
      .scene-vignette-pulse { position: absolute; z-index: 5; inset: 0; opacity: 0; background: radial-gradient(circle at 50% 37%, rgba(255, 223, 137, 0.28), transparent 24%), radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.72) 100%); mix-blend-mode: soft-light; pointer-events: none; }
      .hook { --hook-alpha: 1; --hook-y: 0px; --hook-blur: 0px; position: absolute; z-index: 22; top: auto; left: 50px; right: 50px; bottom: 156px; height: 386px; padding-top: 18px; color: #fff8e7; font-size: 86px; font-weight: 950; line-height: 0.96; text-align: center; text-transform: uppercase; text-shadow: 0 4px 0 rgba(142, 12, 26, 0.96), 0 22px 50px rgba(0,0,0,0.78); filter: none; }
      .hook span, .hook em { display: block; overflow-wrap: normal; opacity: var(--hook-alpha); transform: translateY(var(--hook-y)); filter: blur(var(--hook-blur)); }
      .hook em { color: #ffdd57; font-style: normal; }
      .subtitle { position: absolute; z-index: 20; top: 50%; left: 0; right: 0; bottom: auto; height: 360px; transform: translateY(-50%); overflow: visible; display: flex; justify-content: center; align-items: center; pointer-events: none; }
      .subtitle span { position: absolute; left: 44px; right: 44px; top: 50%; bottom: auto; display: block; max-width: 992px; margin: 0 auto; padding: 22px 30px 25px; border: 4px solid rgba(224, 57, 137, 0.78); border-radius: 9px; background: rgba(24, 8, 28, 0.9); color: #fff5ff; font-size: 48px; font-weight: 950; line-height: 1.06; text-align: center; text-shadow: 0 2px 0 rgba(255, 71, 159, 0.65), 0 5px 14px rgba(0,0,0,0.88); box-shadow: 0 0 0 2px rgba(255,255,255,0.08), 0 20px 52px rgba(0,0,0,0.56); }
      .grain { position: absolute; z-index: 10; inset: 0; opacity: 0.07; background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(0,0,0,0.1) 0 1px, transparent 1px 8px); mix-blend-mode: soft-light; pointer-events: none; }
      .dust-veil { position: absolute; z-index: 9; inset: -12%; opacity: 0.12; background: radial-gradient(circle at 18% 24%, rgba(255,255,255,0.12), transparent 18%), radial-gradient(circle at 70% 42%, rgba(255,210,120,0.08), transparent 22%), radial-gradient(circle at 42% 78%, rgba(255,255,255,0.06), transparent 20%); filter: blur(12px); mix-blend-mode: screen; pointer-events: none; will-change: transform, opacity; }
      .transition-flash { position: absolute; z-index: 11; inset: 0; opacity: 0; background: radial-gradient(circle at 35% 28%, rgba(255, 224, 115, 0.6), transparent 34%), linear-gradient(115deg, transparent 0%, rgba(255, 68, 34, 0.22) 48%, transparent 74%); mix-blend-mode: screen; pointer-events: none; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="1080" data-height="1920">
      ${scenes}
      <div id="dust-veil" class="dust-veil" data-layout-ignore></div>
      <div class="grain" data-layout-ignore></div>
      <div id="transition-flash" class="transition-flash" data-layout-ignore></div>
      <div id="hero-hook" class="clip hook" data-start="0" data-duration="3" data-track-index="4">${hookHtml(lesson.hook)}</div>
      <div id="subtitles" class="clip subtitle" data-start="0" data-duration="${duration}" data-track-index="1" data-layout-allow-overflow>
        ${capSpans}
      </div>
      <audio id="narration" data-start="0" data-duration="${duration}" data-track-index="2" src="assets/narration.wav" data-volume="1"></audio>
      <audio id="music" data-start="0" data-duration="${duration}" data-track-index="3" src="assets/background_music.mp3" data-volume="1"></audio>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const fitHeroHook = () => {
        const hook = document.getElementById("hero-hook");
        if (!hook) return;
        const minSize = 58;
        const maxSize = 86;
        const scaleSafety = 1.035;
        const fits = (size) => {
          hook.style.fontSize = size + "px";
          const maxWidth = hook.clientWidth / scaleSafety;
          const maxHeight = hook.clientHeight / scaleSafety;
          const lines = Array.from(hook.children);
          return hook.scrollHeight <= maxHeight && lines.every((line) => line.scrollWidth <= maxWidth);
        };
        let low = minSize;
        let high = maxSize;
        for (let step = 0; step < 8; step += 1) {
          const mid = (low + high) / 2;
          if (fits(mid)) low = mid;
          else high = mid;
        }
        hook.style.fontSize = Math.max(minSize, Math.floor(low)) + "px";
      };
      fitHeroHook();
      document.querySelectorAll(".subject-outline").forEach((svg) => {
        const paths = Array.from(svg.querySelectorAll(".subject-path"));
        const maxLength = Math.max(0, ...paths.map((path) => path.getTotalLength()));
        svg.style.setProperty("--outline-offset", maxLength);
        paths.forEach((path) => {
          path.style.strokeDasharray = maxLength;
        });
      });
      const tl = gsap.timeline({ paused: true });
      ${sceneTweens}
      ${transitionFlashes}
      ${outlineTweens}
      tl.fromTo("#dust-veil", { x: -38, y: 24, opacity: 0.16 }, { x: 44, y: -32, opacity: 0.28, duration: ${duration}, ease: "sine.inOut" }, 0);
      tl.fromTo("#hero-hook", { y: 0, scale: 1 }, { y: -8, scale: 1.018, duration: 1.15, ease: "sine.inOut" }, 0);
      tl.to("#hero-hook", { "--hook-alpha": 0, "--hook-y": "-24px", "--hook-blur": "10px", duration: 0.24, ease: "power2.in", overwrite: "auto" }, 2.68);
      const captionBeats = [
        ${capBeats}
      ];
      gsap.set(".subtitle span", { opacity: 0, yPercent: -50, y: 32, scale: 0.96 });
      for (const [selector, start, duration] of captionBeats) {
        tl.fromTo(selector, { opacity: 0, yPercent: -50, y: 32, scale: 0.96 }, { opacity: 1, yPercent: -50, y: 0, scale: 1, duration: 0.2, ease: "power2.out" }, start + 0.03);
        tl.to(selector, { opacity: 0, yPercent: -50, y: 14, duration: 0.17, ease: "power2.in" }, start + duration - 0.18);
      }
      ${captionPulseTweens}
      tl.to("#root", { opacity: 0, duration: 0.35, ease: "power2.in" }, ${duration - 0.35});
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>`;
}

function run(cmd, args, cwd, env = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

function runCapture(cmd, args, cwd, env = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${result.stderr || result.stdout || "unknown error"}`);
  }
  return result.stdout;
}

function mediaDurationSeconds(file) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nk=1:nw=1",
    file,
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`ffprobe duration failed for ${file}: ${result.stderr || "unknown error"}`);
  }
  const duration = Number(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid media duration for ${file}: ${result.stdout.trim()}`);
  }
  return Number(duration.toFixed(3));
}

function validateNarrationDuration(duration) {
  if (duration < narrationDurationMin || duration > narrationDurationMax) {
    throw new Error(`Narration duration ${duration}s is outside the expected ${narrationDurationMin}-${narrationDurationMax}s range.`);
  }
}

function parseJsonFromOutput(output) {
  const text = String(output || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error(`Unable to parse JSON output: ${text.slice(0, 240)}`);
  }
}

function collectTranscriptWords(value, words = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectTranscriptWords(item, words);
    return words;
  }
  if (!value || typeof value !== "object") return words;

  const label = value.word ?? value.text ?? value.token;
  const start = Number(value.start ?? value.startTime ?? value.start_time);
  const end = Number(value.end ?? value.endTime ?? value.end_time);
  if (typeof label === "string" && Number.isFinite(start) && Number.isFinite(end) && end > start) {
    const normalizedWords = wordsForTiming(label);
    if (normalizedWords.length > 0 && normalizedWords.length <= 3) {
      words.push({ text: label.trim(), start, end });
      return words;
    }
  }

  for (const child of Object.values(value)) collectTranscriptWords(child, words);
  return words;
}

function extractTranscriptWords(transcript) {
  if (Array.isArray(transcript?.words)) {
    return collectTranscriptWords(transcript.words);
  }
  if (Array.isArray(transcript?.segments)) {
    const segmentWords = transcript.segments.flatMap((segment) => (
      Array.isArray(segment?.words) ? collectTranscriptWords(segment.words) : []
    ));
    if (segmentWords.length) return segmentWords;
  }
  return collectTranscriptWords(transcript);
}

function transcriptFromTranscribeResult(result, dir) {
  if (result?.ok === true && typeof result.transcriptPath === "string") {
    return JSON.parse(readFileSync(result.transcriptPath, "utf8"));
  }
  const localTranscript = path.join(dir, "assets", "transcript.json");
  if (existsSync(localTranscript)) {
    return JSON.parse(readFileSync(localTranscript, "utf8"));
  }
  return result;
}

function transcribeNarration(dir) {
  const language = process.env.TRANSCRIBE_LANGUAGE || "vi";
  const model = process.env.TRANSCRIBE_MODEL || "small";
  const output = runCapture("npx", [
    "--yes", "hyperframes@0.6.40",
    "transcribe", "assets/narration.wav",
    "--language", language,
    "--model", model,
    "--json",
  ], dir);
  const result = parseJsonFromOutput(output);
  const transcript = transcriptFromTranscribeResult(result, dir);
  const words = extractTranscriptWords(transcript);
  if (!words.length) {
    throw new Error(`Transcription completed with model "${model}" but no word-level timestamps were found.`);
  }
  return { transcript, words };
}

function captionTracksFromTranscript(segments, transcriptWords, duration) {
  const words = transcriptWords
    .filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start)
    .sort((a, b) => a.start - b.start);
  if (!segments.length || words.length < segments.length) {
    throw new Error(`Not enough transcript words for subtitle sync: ${words.length} words for ${segments.length} captions.`);
  }

  const counts = segments.map((segment) => Math.max(1, wordsForTiming(segment).length));
  const total = counts.reduce((sum, count) => sum + count, 0);
  let wordStart = 0;
  let cumulative = 0;
  let previousEnd = 0;

  return segments.map((text, index) => {
    cumulative += counts[index];
    const targetEnd = index === segments.length - 1
      ? words.length
      : Math.max(wordStart + 1, Math.round((cumulative / total) * words.length));
    const wordEnd = Math.min(words.length - 1, targetEnd - 1);
    const first = words[wordStart] || words[wordEnd];
    const last = words[wordEnd] || first;
    const start = Math.max(previousEnd, Math.max(0, first.start - 0.08));
    const rawEnd = Math.min(duration, last.end + 0.22);
    const end = Math.max(start + 0.45, rawEnd);
    previousEnd = Math.min(duration, end);
    wordStart = Math.min(words.length - 1, targetEnd);
    return {
      text,
      start: Number(start.toFixed(2)),
      duration: Number(Math.max(0.45, previousEnd - start).toFixed(2)),
    };
  });
}

async function generateSubjectOutlines(dir, imageSources = []) {
  const enabled = process.env.ENABLE_SUBJECT_OUTLINE !== "false" && process.env.ENABLE_SUBJECT_OUTLINE !== "0";
  const output = path.join(dir, "assets", "masks", "subject-outlines.json");
  if (!enabled) return new Map();
  const firstFile = imageSources.find((source) => source?.file)?.file || "assets/internet/scene-01.jpg";
  const assetPrefix = path.dirname(firstFile).replace(/\\/g, "/");
  const imagesDir = path.join(dir, assetPrefix);

  const python = process.env.SUBJECT_PYTHON_BIN || process.env.PYTHON_BIN || "python3";
  const script = path.join(projectRoot, "automation", "generate-subject-outlines.py");
  const args = [
    script,
    "--images-dir", imagesDir,
    "--output", output,
    "--asset-prefix", assetPrefix,
    "--model", process.env.SUBJECT_MODEL || "isnet-general-use",
    "--min-area-ratio", process.env.SUBJECT_MIN_AREA_RATIO || "0.015",
    "--max-contours", process.env.SUBJECT_MAX_CONTOURS || "3",
  ];
  if (process.env.ENABLE_SUBJECT_LAYERS !== "false" && process.env.ENABLE_SUBJECT_LAYERS !== "0") {
    args.push("--enable-layers");
  }

  try {
    const result = spawnSync(python, args, {
      cwd: dir,
      stdio: "inherit",
      env: { ...process.env },
    });
    if (result.error || result.status !== 0) {
      console.warn(`Subject outline generation skipped: ${result.error?.message || `${python} exited with ${result.status}`}`);
      return new Map();
    }
    return await readSubjectOutlines(output);
  } catch (error) {
    console.warn(`Subject outline generation skipped: ${error.message}`);
    return new Map();
  }
}

async function readSubjectOutlines(file) {
  try {
    if (!existsSync(file)) return new Map();
    const data = JSON.parse(await readFile(file, "utf8"));
    const outlines = new Map();
    for (const item of data.images || []) {
      outlines.set(item.file, item);
    }
    return outlines;
  } catch (error) {
    console.warn(`Subject outline JSON ignored: ${error.message}`);
    return new Map();
  }
}

async function prepareProject(lesson, platform) {
  const slug = `video-${slugify(lesson.title)}`;
  const dir = path.join(outRoot, slug);
  const copyPack = await generateCopyPack(lesson);
  const narration = narrationBundle(copyPack.scriptSegments);
  const text = narration.text;
  await mkdir(path.join(dir, "assets"), { recursive: true });
  await writeFile(path.join(dir, "script.txt"), text, "utf8");
  await writeFile(path.join(dir, "subtitle-segments.json"), JSON.stringify(narration.segments, null, 2), "utf8");
  await writeFile(path.join(dir, "generated-copy.json"), JSON.stringify(copyPack, null, 2), "utf8");
  await writeFile(path.join(dir, "hyperframes.json"), JSON.stringify({
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
  }, null, 2), "utf8");

  let duration;
  let captionTracks;
  if (process.env.SKIP_TTS !== "1") {
    const vieneuDir = process.env.VIENEU_DIR || path.resolve(projectRoot, "..", "VieNeu-TTS");
    const localPython = path.join(vieneuDir, ".venv", "bin", "python");
    const python = process.env.PYTHON_BIN || (existsSync(localPython) ? localPython : "python");
    const pythonEnv = {};
    const localSrc = path.join(vieneuDir, "src");
    if (existsSync(localSrc)) pythonEnv.PYTHONPATH = localSrc;
    run(python, [
      path.join(projectRoot, "automation", "generate-vieneu-tts.py"),
      "--text-file", path.join(dir, "script.txt"),
      "--output", path.join(dir, "assets", "narration_raw.wav"),
      "--voice", process.env.VIENEU_VOICE || "Tuyen",
    ], dir, pythonEnv);
    run("ffmpeg", [
      "-y", "-i", path.join(dir, "assets", "narration_raw.wav"),
      "-af", "highpass=f=75,lowpass=f=11500,equalizer=f=3200:t=q:w=1.2:g=2.0,acompressor=threshold=-18dB:ratio=2.5:attack=8:release=120:makeup=2,loudnorm=I=-14:TP=-1.0:LRA=7,volume=2,alimiter=limit=0.98",
      "-ar", "48000", "-ac", "2", path.join(dir, "assets", "narration.wav"),
    ], dir);
    duration = mediaDurationSeconds(path.join(dir, "assets", "narration.wav"));
    validateNarrationDuration(duration);
    const { transcript, words } = transcribeNarration(dir);
    await writeFile(path.join(dir, "transcript.json"), JSON.stringify(transcript, null, 2), "utf8");
    captionTracks = captionTracksFromTranscript(narration.segments, words, duration);
  } else {
    duration = Math.max(1, Math.ceil(text.length / 15));
    run("ffmpeg", ["-y", "-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo`, "-t", String(duration), path.join(dir, "assets", "narration.wav")], dir);
    captionTracks = fallbackCaptionTracks(narration.segments, duration);
  }
  await writeFile(path.join(dir, "caption-tracks.json"), JSON.stringify(captionTracks, null, 2), "utf8");

  const visualPlan = await generateVisualPlan({ lesson, platform, duration, captionTracks });
  await writeFile(path.join(dir, "visual-plan.json"), JSON.stringify(visualPlan, null, 2), "utf8");

  let imageSources;
  try {
    imageSources = await generateLessonImages(lesson, visualPlan, dir);
  } catch (error) {
    console.warn(`Generated images skipped; falling back to historical image search: ${error.message}`);
    const fallbackSources = await fallbackLessonImages(lesson, dir, visualPlan.beats.length);
    imageSources = applyVisualTimingToSources(fallbackSources, visualPlan);
  }
  const subjectOutlines = await generateSubjectOutlines(dir, imageSources);
  await writeFile(path.join(dir, "image-sources.json"), JSON.stringify(imageSources, null, 2), "utf8");

  const musicSource = path.join(projectRoot, "assets", "background_music.mp3");
  if (!existsSync(musicSource)) throw new Error("Missing assets/background_music.mp3");
  run("ffmpeg", [
    "-y", "-i", musicSource, "-t", String(duration),
    "-af", `volume=0.51,afade=t=in:st=0:d=1.1,afade=t=out:st=${Math.max(1, duration - 1.6)}:d=1.6`,
    "-ar", "48000", "-ac", "2", path.join(dir, "assets", "background_music.mp3"),
  ], projectRoot);

  await writeFile(path.join(dir, "index.html"), renderHtml({ lesson, platform, imageSources, duration, captionTracks, subjectOutlines }), "utf8");
  await writeFile(path.join(dir, "post.json"), JSON.stringify(postMetadata(lesson, platform, duration, copyPack), null, 2), "utf8");

  return {
    dir,
    slug,
    duration,
    sourceAuthor: lesson.sourceAuthor,
    sourceWork: lesson.sourceWork,
    chapter: lesson.chapter,
    title: lesson.title,
    slot,
  };
}

async function main() {
  const picked = pickLessons();
  const lesson = picked[Number(slot) - 1];
  const jobs = [await prepareProject(lesson, distribution)];
  await writeFile(path.join(outRoot, "manifest.json"), JSON.stringify({ date, slot, slotsPerDay, seriesStartDate, jobs }, null, 2), "utf8");
  console.log(JSON.stringify({ date, slot, slotsPerDay, seriesStartDate, jobs }, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(`daily:generate failed: ${error.message}`);
  process.exitCode = 1;
}
