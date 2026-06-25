const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SITE_CONFIG = readSiteConfig();
const SITE_URL = ensureTrailingSlash(SITE_CONFIG.siteUrl);
const SITE_NAME = SITE_CONFIG.siteName;
const SITE_LANGUAGE = SITE_CONFIG.language || "ko-KR";
const POSTS_DIR = path.join(ROOT, "posts");
const INDEX_PATH = path.join(ROOT, "index.html");
const CHECK_MODE = process.argv.includes("--check");

const CARD_START = "<!-- SEO_POST_CARDS_START -->";
const CARD_END = "<!-- SEO_POST_CARDS_END -->";

function main() {
  const posts = readPosts();
  const outputs = [
    ["posts.json", `${JSON.stringify(posts.map((post) => post.path), null, 2)}\n`],
    ["sitemap.xml", renderSitemap(posts)],
    ["feed.xml", renderFeed(posts)],
    ["robots.txt", renderRobots()],
    ["index.html", renderIndex(posts)],
  ];

  for (const [file, content] of outputs) {
    writeOrCheck(file, content);
  }
}

function readPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];

  return fs
    .readdirSync(POSTS_DIR)
    .filter((file) => file.toLowerCase().endsWith(".html"))
    .map((file) => {
      const relativePath = `posts/${file}`;
      const fullPath = path.join(POSTS_DIR, file);
      const html = fs.readFileSync(fullPath, "utf8");
      const stat = fs.statSync(fullPath);
      const title = readTitle(html) || file.replace(/\.html$/i, "");
      const description = readMeta(html, "description") || "";
      const date = readMeta(html, "date");
      const canonical = readCanonical(html) || new URL(relativePath, SITE_URL).toString();
      const modified = readProperty(html, "article:modified_time") || readMeta(html, "modified") || date || toDate(stat.mtime);
      const cover = readMeta(html, "cover") || readProperty(html, "og:image") || "";
      const readingTime = estimateReadingTime(html);
      const post = {
        path: relativePath,
        url: new URL(relativePath, SITE_URL).toString(),
        canonical,
        title,
        description,
        date,
        lastmod: normalizeDate(modified),
        cover: resolvePostAsset(relativePath, cover),
        readingTime,
      };

      validatePost(post, html);
      return post;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date) || a.path.localeCompare(b.path));
}

function readTitle(html) {
  const metaTitle = readMeta(html, "title");
  if (metaTitle) return metaTitle;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) return decodeEntities(stripTags(title[1]).trim());
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return h1 ? decodeEntities(stripTags(h1[1]).trim()) : "";
}

function readMeta(html, name) {
  const tag = findMetaTag(html, "name", name);
  return tag ? decodeEntities((readAttribute(tag, "content") || "").trim()) : "";
}

function readProperty(html, property) {
  const tag = findMetaTag(html, "property", property);
  return tag ? decodeEntities((readAttribute(tag, "content") || "").trim()) : "";
}

function readCanonical(html) {
  const links = html.match(/<link\b[^>]*>/gi) || [];
  const canonical = links.find((tag) => readAttribute(tag, "rel").toLowerCase() === "canonical") || "";
  return canonical ? decodeEntities((readAttribute(canonical, "href") || "").trim()) : "";
}

function findMetaTag(html, attribute, value) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  return metaTags.find((tag) => readAttribute(tag, attribute).toLowerCase() === value.toLowerCase()) || "";
}

function readAttribute(tag, attribute) {
  const escaped = escapeRegex(attribute);
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? match[2] : "";
}

function validatePost(post, html) {
  const failures = [];
  const ogUrl = readProperty(html, "og:url");
  const hasJsonLd = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html);

  if (!post.title) failures.push("title");
  if (!post.description) failures.push("description");
  if (!isIsoDate(post.date)) failures.push(`valid meta date (${post.date || "missing"})`);
  if (!isIsoDate(post.lastmod)) failures.push(`valid modified date (${post.lastmod || "missing"})`);
  if (!post.canonical) failures.push("canonical URL");
  if (post.canonical && post.canonical !== post.url) failures.push(`canonical URL matching ${post.url}`);
  if (!ogUrl) failures.push("og:url");
  if (ogUrl && ogUrl !== post.url) failures.push(`og:url matching ${post.url}`);
  if (!hasJsonLd) failures.push("JSON-LD script");

  if (failures.length > 0) {
    throw new Error(`${post.path} is missing required metadata: ${failures.join(", ")}`);
  }
}

function renderSitemap(posts) {
  const urls = [
    {
      loc: SITE_URL,
      lastmod: latestDate(posts.map((post) => post.lastmod)) || toDate(new Date()),
      priority: "1.0",
    },
    ...posts.map((post) => ({
      loc: post.url,
      lastmod: post.lastmod,
      priority: "0.8",
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      (item) => `  <url>
    <loc>${escapeXml(item.loc)}</loc>
    <lastmod>${escapeXml(item.lastmod)}</lastmod>
    <priority>${item.priority}</priority>
  </url>`,
    )
    .join("\n")}\n</urlset>\n`;
}

function renderFeed(posts) {
  const updated = latestDate(posts.map((post) => post.lastmod)) || toDate(new Date());
  const items = posts
    .map(
      (post) => `  <item>
    <title>${escapeXml(post.title)}</title>
    <link>${escapeXml(post.url)}</link>
    <guid isPermaLink="true">${escapeXml(post.url)}</guid>
    <pubDate>${new Date(post.date).toUTCString()}</pubDate>
    <description>${escapeXml(post.description)}</description>
  </item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n  <title>${escapeXml(SITE_NAME)}</title>\n  <link>${escapeXml(SITE_URL)}</link>\n  <atom:link href="${escapeXml(new URL("feed.xml", SITE_URL).toString())}" rel="self" type="application/rss+xml" />\n  <description>${escapeXml(`${SITE_NAME} RSS feed`)}</description>\n  <language>${escapeXml(SITE_LANGUAGE)}</language>\n  <lastBuildDate>${new Date(updated).toUTCString()}</lastBuildDate>\n${items}\n</channel>\n</rss>\n`;
}

function renderRobots() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap.xml", SITE_URL).toString()}\n`;
}

function renderIndex(posts) {
  let index = fs.readFileSync(INDEX_PATH, "utf8");
  const start = index.indexOf(CARD_START);
  const end = index.indexOf(CARD_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("SEO card markers are missing from index.html");
  }

  const summary =
    posts.length === 0
      ? "아직 등록된 글이 없습니다. posts 폴더에 HTML 글을 올리면 이 화면에 바로 정리됩니다."
      : "최근 글부터 차례대로 정리해 둔 글 목록입니다.";

  index = index
    .replace(/<p id="postSummary">[\s\S]*?<\/p>/, `<p id="postSummary">${escapeHtml(summary)}</p>`)
    .replace(/<strong id="postCount">[\s\S]*?<\/strong>/, `<strong id="postCount">${posts.length}</strong>`);

  const updatedStart = index.indexOf(CARD_START);
  const updatedEnd = index.indexOf(CARD_END);

  const before = index.slice(0, updatedStart + CARD_START.length);
  const after = index.slice(updatedEnd);
  const cards = posts.length === 0 ? "" : `\n${posts.map((post, index) => renderCard(post, index === 0)).join("\n")}\n            `;
  return `${before}${cards}${after}`;
}

function renderCard(post, isLatest) {
  const image = post.cover ? `\n              <img src="${escapeHtml(post.cover)}" alt="">` : "";
  const latest = isLatest ? `                  <span class="latest-badge">최신</span>\n` : "";

  return `            <a class="post-card" href="${escapeHtml(post.path)}">${image}
              <div class="post-card-body">
                <div class="post-meta">
                  <time datetime="${escapeHtml(post.date)}">${formatKoreanDate(post.date)}</time>
${latest}                  <span>${post.readingTime}분 읽기</span>
                </div>
                <h3>${escapeHtml(post.title)}</h3>
                <p>${escapeHtml(post.description)}</p>
              </div>
            </a>`;
}

function latestDate(values) {
  const timestamps = values.filter(Boolean).map((value) => new Date(value).getTime()).filter(Number.isFinite);
  if (timestamps.length === 0) return "";
  return toDate(new Date(Math.max(...timestamps)));
}

function toDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(new Date(value).getTime());
}

function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || "") : date.toISOString().slice(0, 10);
}

function resolvePostAsset(postPath, assetPath) {
  if (!assetPath) return "";
  if (/^(https?:)?\/\//i.test(assetPath) || assetPath.startsWith("/")) return assetPath;
  const base = postPath.slice(0, postPath.lastIndexOf("/") + 1);
  return `${base}${assetPath}`;
}

function formatKoreanDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, "");
}

function estimateReadingTime(html) {
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return 1;
  return Math.max(1, Math.ceil(text.length / 700));
}

function decodeEntities(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readSiteConfig() {
  const configPath = path.join(ROOT, "site.config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error("site.config.json is missing.");
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!config.siteUrl || !config.siteName) {
    throw new Error("site.config.json must define siteUrl and siteName.");
  }
  return config;
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function writeOrCheck(file, content) {
  const outputPath = path.join(ROOT, file);

  if (CHECK_MODE) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
    if (current !== content) {
      throw new Error(`${file} is out of date. Run node scripts/generate-seo.js.`);
    }
    return;
  }

  fs.writeFileSync(outputPath, content);
}

main();
