import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
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
];
const slotsPerDay = 8;
const date = process.env.VIDEO_DATE || vietnamDate();
const slot = normalizeSlot(process.env.RUN_SLOT || inferSlotFromUtcHour(new Date().getUTCHours()));
const distribution = { id: "social", label: "TikTok / Shorts / Reels" };

const outRoot = path.join(projectRoot, "daily", date, `slot-${slot}`);
await mkdir(outRoot, { recursive: true });
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

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function hookHtml(text) {
  const words = text.trim().split(/\s+/);
  const splitAt = Math.max(1, Math.ceil(words.length / 2));
  const lead = words.slice(0, splitAt).join(" ");
  const punch = words.slice(splitAt).join(" ");
  return punch ? `${lead}<em>${punch}</em>` : lead;
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

function isHistoricalImage(item) {
  const text = imageText(item);
  const culturallyRelevant = chineseHistoricalTerms.some((term) => text.includes(term));
  return culturallyRelevant && historicalScore(item) >= requiredHistoricalScore;
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

async function downloadLessonImages(lesson, dir) {
  const assetsDir = path.join(dir, "assets", "internet");
  await mkdir(assetsDir, { recursive: true });
  const selected = [];
  const seen = new Set();
  const fallbackQueries = fallbackQueriesForLesson(lesson);

  const lessonQueries = lesson.searchQueries.flatMap((query) => [
    `${query} painting`,
    `${query} scroll`,
    `${query} engraving`,
    `${query} ancient Chinese`,
    `${query} museum artifact`,
  ]);
  const queryVariants = [
    ...lessonQueries,
    ...fallbackQueries,
  ];

  for (const query of queryVariants) {
    const results = [
      ...await commonsSearch(query, 10),
      ...await openverseSearch(query, 10),
    ];
    for (const item of results) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      selected.push({ ...item, query });
    }
  }

  selected.sort((a, b) => imageRank(b) - imageRank(a));

  if (selected.length < 3) {
    throw new Error(`Not enough historical image candidates for ${lesson.chapter}; found ${selected.length}`);
  }

  const sources = [];
  for (const item of selected) {
    if (sources.length >= 7) break;
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
        provider: item.provider,
        historicalScore: historicalScore(item),
      });
    } catch (error) {
      console.warn(`Skipping image: ${item.url} (${error.message})`);
    }
  }

  if (sources.length < 3) {
    throw new Error(`Not enough downloadable historical images for ${lesson.chapter}; found ${sources.length}`);
  }

  const downloaded = [...sources];
  while (sources.length < 7) {
    const source = downloaded[sources.length % downloaded.length];
    const ext = path.extname(source.file) || ".jpg";
    const filename = `scene-${String(sources.length + 1).padStart(2, "0")}${ext}`;
    await copyFile(path.join(dir, source.file), path.join(assetsDir, filename));
    sources.push({ ...source, file: `assets/internet/${filename}`, repeatedFrom: source.file });
  }
  return sources;
}

function narrationText(lesson) {
  return [
    `${lesson.sourceTitlePrefix}, chương ${lesson.chapter}, nói về ${lesson.viTitle.toLowerCase()}.`,
    lesson.angle,
    ...lesson.beats.slice(0, 7),
    `Nhớ lấy: ${lesson.takeaway}`,
  ].join(" ");
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

function viralPostPack(lesson) {
  const sourceTag = hashtagify(lesson.sourceTitlePrefix);
  const authorTag = hashtagify(lesson.sourceAuthor);
  const chapterTag = hashtagify(`chuong ${lesson.chapter} ${lesson.sourceAuthor}`);
  const lessonTag = hashtagify(lesson.hook);
  const coreHashtags = [
    sourceTag,
    authorTag,
    lesson.sourceAuthor === "Tôn Tử" ? "#ArtOfWar" : "#TrietHocPhuongDong",
    "#BaiHocCuocSong",
    "#TuDuyChienLuoc",
    "#ChienLuoc",
    "#KyNangSong",
    "#TriTueCoNhan",
    chapterTag,
    lessonTag,
  ];
  const platformHashtags = {
    tiktok: ["#TikTokVietnam", "#LearnOnTikTok", "#ViralVietnam"],
    "youtube-short": ["#Shorts", "#YouTubeShorts", "#ShortsVietnam"],
    "facebook-reel": ["#Reels", "#FacebookReels", "#ReelsVietnam"],
  };
  const hookQuestion = lesson.sourceAuthor === "Tôn Tử"
    ? `Nếu gặp đối thủ mạnh hơn, bạn sẽ đánh vào đâu?`
    : `Bạn sẽ áp dụng bài học này vào chuyện gì hôm nay?`;
  const lessonLine = `Bài học hôm nay: ${lesson.takeaway}`;
  const ctaLine = `Comment "CỔ NHÂN" nếu muốn phần tiếp theo.`;
  const sourceLine = `${lesson.sourceAuthor} - ${lesson.sourceWork}, chương ${lesson.chapter}: ${lesson.viTitle}`;
  const base = [
    `${lesson.sourceTitlePrefix}: ${lesson.hook}`,
    "",
    hookQuestion,
    lessonLine,
    sourceLine,
    "",
    ctaLine,
  ].join("\n");

  const captions = {
    tiktok: `${base}\n\n${uniqueList([...coreHashtags, ...platformHashtags.tiktok]).slice(0, 14).join(" ")}`,
    "youtube-short": `${base}\n\n${uniqueList([...coreHashtags, ...platformHashtags["youtube-short"]]).slice(0, 13).join(" ")}`,
    "facebook-reel": `${base}\n\n${uniqueList([...coreHashtags, ...platformHashtags["facebook-reel"]]).slice(0, 13).join(" ")}`,
  };
  const youtubeTags = uniqueList([
    lesson.sourceTitlePrefix,
    lesson.sourceAuthor,
    lesson.sourceWork,
    "triết học phương Đông",
    "bài học cuộc sống",
    "tư duy chiến lược",
    "kỹ năng sống",
    "triết lý cổ nhân",
    lesson.hook,
    lesson.viTitle,
    lesson.title,
    `Chương ${lesson.chapter}`,
  ]);

  return {
    baseCaption: captions.tiktok,
    captions,
    hashtags: uniqueList([...coreHashtags, ...platformHashtags.tiktok, ...platformHashtags["youtube-short"], ...platformHashtags["facebook-reel"]]),
    youtubeTags,
  };
}

function postMetadata(lesson, platform, duration) {
  const title = `${lesson.sourceTitlePrefix}: ${lesson.hook}`;
  const postPack = viralPostPack(lesson);
  return {
    platform: "all",
    platforms: ["tiktok", "youtube-short", "facebook-reel"],
    title,
    caption: postPack.baseCaption,
    captions: postPack.captions,
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
    hashtags: postPack.hashtags,
    youtubeTags: postPack.youtubeTags,
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

function renderHtml({ lesson, platform, imageSources, duration, subjectOutlines = new Map() }) {
  const sceneDur = duration / 7;
  const transitionDur = 0.58;
  const scenes = imageSources.map((img, i) => {
    const nominalStart = +(i * sceneDur).toFixed(2);
    const start = i === 0 ? 0 : Math.max(0, +(nominalStart - transitionDur).toFixed(2));
    const nextStart = i === 6 ? duration : +((i + 1) * sceneDur).toFixed(2);
    const dur = +(nextStart - start).toFixed(2);
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

  const captions = lesson.beats.slice(0, 8);
  const capStart = 3;
  const capDur = (duration - capStart - 1.2) / captions.length;
  const capSpans = captions.map((beat, i) => `<span id="cap-${i + 1}">${beat}</span>`).join("\n        ");
  const capBeats = captions.map((_, i) => {
    const start = +(capStart + i * capDur).toFixed(2);
    return `["#cap-${i + 1}", ${start}, ${+capDur.toFixed(2)}]`;
  }).join(",\n        ");

  const sceneTweens = imageSources.map((img, i) => {
    const start = +(i * sceneDur).toFixed(2);
    const nextStart = +((i + 1) * sceneDur).toFixed(2);
    const dur = i === 6 ? +(duration - start).toFixed(2) : +(nextStart - start).toFixed(2);
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
    const fadeIn = i === 0 ? `tl.set("#scene-${i + 1}", { opacity: 1, filter: "blur(0px)" }, 0);` : `tl.fromTo("#scene-${i + 1}", { opacity: 0, filter: "blur(12px)" }, { opacity: 1, filter: "blur(0px)", duration: ${transitionDur}, ease: "power2.out" }, ${Math.max(0, +(start - transitionDur * 0.72).toFixed(2))});`;
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
    const start = +(((i + 1) * sceneDur) - transitionDur * 0.54).toFixed(2);
    return `tl.fromTo("#transition-flash", { opacity: 0 }, { opacity: 0.32, duration: 0.14, ease: "power1.out", yoyo: true, repeat: 1 }, ${start});`;
  }).join("\n      ");

  const outlineTweens = imageSources.map((img, i) => {
    const outline = subjectOutlines.get(img.file);
    if (!outline?.paths?.length) return "";
    const start = +(i * sceneDur + 0.42).toFixed(2);
    const fadeAt = +(Math.min(duration - 0.6, (i + 1) * sceneDur - 1.3)).toFixed(2);
    return `tl.to("#scene-${i + 1} .subject-outline", { "--outline-offset": 0, opacity: 0.82, duration: 0.92, ease: "power2.out" }, ${start});
      tl.to("#scene-${i + 1} .subject-outline", { opacity: 0.32, duration: 0.4, ease: "sine.inOut", overwrite: "auto" }, ${start + 1.2});
      tl.to("#scene-${i + 1} .subject-outline", { opacity: 0, duration: 0.32, ease: "power1.in", overwrite: "auto" }, ${fadeAt});`;
  }).filter(Boolean).join("\n      ");

  const captionPulseOpacity = Math.min(1, subjectLayerOpacity + 0.07).toFixed(2);
  const captionPulseTweens = captions.map((_, i) => {
    const start = +(capStart + i * capDur + 0.07).toFixed(2);
    const sceneIndex = Math.min(6, Math.floor(start / sceneDur));
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
      .scene-bg { inset: -180px; width: calc(100% + 360px); height: calc(100% + 360px); background-size: cover; background-position: center; filter: blur(28px) contrast(1.22) saturate(1.45) sepia(0.32) brightness(0.86); opacity: 0.8; }
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
      .scene::after { content: ""; position: absolute; z-index: 3; inset: 0; background: radial-gradient(ellipse at center, transparent 34%, rgba(0,0,0,0.76) 100%), repeating-linear-gradient(0deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 5px); opacity: 0.82; pointer-events: none; }
      .scene-light { position: absolute; z-index: 4; top: -18%; bottom: -18%; left: -32%; width: 44%; transform: skewX(-18deg); background: linear-gradient(90deg, transparent 0%, rgba(255, 224, 147, 0.32) 46%, transparent 100%); mix-blend-mode: soft-light; opacity: 0.1; pointer-events: none; will-change: transform, opacity; }
      .scene-vignette-pulse { position: absolute; z-index: 5; inset: 0; opacity: 0; background: radial-gradient(circle at 50% 37%, rgba(255, 223, 137, 0.28), transparent 24%), radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.72) 100%); mix-blend-mode: soft-light; pointer-events: none; }
      .hook { position: absolute; z-index: 22; top: auto; left: 50px; right: 50px; bottom: 190px; height: 310px; color: #fff8e7; font-size: 86px; font-weight: 950; line-height: 0.96; text-align: center; text-transform: uppercase; text-shadow: 0 4px 0 rgba(142, 12, 26, 0.96), 0 22px 50px rgba(0,0,0,0.78); filter: none; }
      .hook em { display: block; color: #ffdd57; font-style: normal; }
      .subtitle { position: absolute; z-index: 20; top: auto; left: 0; right: 0; bottom: 178px; height: 250px; overflow: visible; display: flex; justify-content: center; align-items: flex-end; pointer-events: none; }
      .subtitle span { position: absolute; left: 44px; right: 44px; bottom: 0; display: block; max-width: 992px; margin: 0 auto; padding: 22px 30px 25px; border: 4px solid rgba(224, 57, 137, 0.78); border-radius: 9px; background: rgba(24, 8, 28, 0.9); color: #fff5ff; font-size: 48px; font-weight: 950; line-height: 1.06; text-align: center; text-shadow: 0 2px 0 rgba(255, 71, 159, 0.65), 0 5px 14px rgba(0,0,0,0.88); box-shadow: 0 0 0 2px rgba(255,255,255,0.08), 0 20px 52px rgba(0,0,0,0.56); }
      .grain { position: absolute; z-index: 10; inset: 0; opacity: 0.14; background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,0.18) 0 1px, transparent 1px 6px); mix-blend-mode: soft-light; pointer-events: none; }
      .dust-veil { position: absolute; z-index: 9; inset: -12%; opacity: 0.2; background: radial-gradient(circle at 18% 24%, rgba(255,255,255,0.18), transparent 18%), radial-gradient(circle at 70% 42%, rgba(255,210,120,0.12), transparent 22%), radial-gradient(circle at 42% 78%, rgba(255,255,255,0.1), transparent 20%); filter: blur(18px); mix-blend-mode: screen; pointer-events: none; will-change: transform, opacity; }
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
      <div id="subtitles" class="clip subtitle" data-start="3" data-duration="${duration - 3}" data-track-index="1" data-layout-allow-overflow>
        ${capSpans}
      </div>
      <audio id="narration" data-start="0" data-duration="${duration}" data-track-index="2" src="assets/narration.wav" data-volume="1"></audio>
      <audio id="music" data-start="0" data-duration="${duration}" data-track-index="3" src="assets/background_music.mp3" data-volume="1"></audio>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
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
      tl.set("#hero-hook", { opacity: 1, y: 0, scale: 1, filter: "none" }, 0);
      tl.fromTo("#hero-hook", { y: 0, scale: 1 }, { y: -8, scale: 1.018, duration: 1.15, ease: "sine.inOut" }, 0);
      tl.to("#hero-hook", { opacity: 0, y: -32, filter: "blur(10px)", duration: 0.24, ease: "power2.in", overwrite: "auto" }, 2.68);
      tl.set("#hero-hook", { opacity: 0 }, 3.00);
      const captionBeats = [
        ${capBeats}
      ];
      gsap.set(".subtitle span", { opacity: 0, y: 32, scale: 0.96 });
      for (const [selector, start, duration] of captionBeats) {
        tl.fromTo(selector, { opacity: 0, y: 32, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: "power2.out" }, start + 0.03);
        tl.to(selector, { opacity: 0, y: 14, duration: 0.17, ease: "power2.in" }, start + duration - 0.18);
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

async function generateSubjectOutlines(dir) {
  const enabled = process.env.ENABLE_SUBJECT_OUTLINE !== "false" && process.env.ENABLE_SUBJECT_OUTLINE !== "0";
  const output = path.join(dir, "assets", "masks", "subject-outlines.json");
  if (!enabled) return new Map();

  const python = process.env.SUBJECT_PYTHON_BIN || process.env.PYTHON_BIN || "python3";
  const script = path.join(projectRoot, "automation", "generate-subject-outlines.py");
  const args = [
    script,
    "--images-dir", path.join(dir, "assets", "internet"),
    "--output", output,
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
  await mkdir(path.join(dir, "assets"), { recursive: true });

  const imageSources = await downloadLessonImages(lesson, dir);
  const subjectOutlines = await generateSubjectOutlines(dir);
  const text = narrationText(lesson);
  await writeFile(path.join(dir, "script.txt"), text, "utf8");
  await writeFile(path.join(dir, "image-sources.json"), JSON.stringify(imageSources, null, 2), "utf8");
  await writeFile(path.join(dir, "hyperframes.json"), JSON.stringify({
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
  }, null, 2), "utf8");

  const duration = Math.min(60, Math.max(38, Math.ceil(text.length / 18)));
  await writeFile(path.join(dir, "index.html"), renderHtml({ lesson, platform, imageSources, duration, subjectOutlines }), "utf8");
  await writeFile(path.join(dir, "post.json"), JSON.stringify(postMetadata(lesson, platform, duration), null, 2), "utf8");

  const musicSource = path.join(projectRoot, "assets", "background_music.mp3");
  if (!existsSync(musicSource)) throw new Error("Missing assets/background_music.mp3");
  run("ffmpeg", [
    "-y", "-i", musicSource, "-t", String(duration),
    "-af", `volume=0.34,afade=t=in:st=0:d=1.1,afade=t=out:st=${Math.max(1, duration - 1.6)}:d=1.6`,
    "-ar", "48000", "-ac", "2", path.join(dir, "assets", "background_music.mp3"),
  ], projectRoot);

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
  } else {
    run("ffmpeg", ["-y", "-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo`, "-t", String(duration), path.join(dir, "assets", "narration.wav")], dir);
  }

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

const picked = pickLessons();
const lesson = picked[Number(slot) - 1];
const jobs = [await prepareProject(lesson, distribution)];
await writeFile(path.join(outRoot, "manifest.json"), JSON.stringify({ date, slot, slotsPerDay, seriesStartDate, jobs }, null, 2), "utf8");
console.log(JSON.stringify({ date, slot, slotsPerDay, seriesStartDate, jobs }, null, 2));
