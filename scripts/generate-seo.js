const fs = require("fs");
const path = require("path");

const SITE_URL = "https://mun-jeong-min.github.io/personal-blog/";
const SITE_NAME = "Panda Blog";
const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, "posts");
const INDEX_PATH = path.join(ROOT, "index.html");

const CARD_START = "<!-- SEO_POST_CARDS_START -->";
const CARD_END = "<!-- SEO_POST_CARDS_END -->";

function main() {
  const posts = readPosts();
  writeJson("posts.json", posts.map((post) => post.path));
  writeSitemap(posts);
  writeFeed(posts);
  updateIndexCards(posts);
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
      const date = readMeta(html, "date") || toDate(stat.mtime);
      const tags = splitTags(readMeta(html, "tags"));
      const cover = readMeta(html, "cover") || readProperty(html, "og:image") || "";

      return {
        path: relativePath,
        url: new URL(relativePath, SITE_URL).toString(),
        title,
        description,
        date,
        lastmod: toDate(stat.mtime),
        tags,
        cover,
      };
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

function findMetaTag(html, attribute, value) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  return tags.find((tag) => readAttribute(tag, attribute).toLowerCase() === value.toLowerCase()) || "";
}

function readAttribute(tag, attribute) {
  const escaped = escapeRegex(attribute);
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? match[2] : "";
}

function splitTags(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function writeJson(file, value) {
  fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(value, null, 2)}\n`);
}

function writeSitemap(posts) {
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

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      (item) => `  <url>
    <loc>${escapeXml(item.loc)}</loc>
    <lastmod>${escapeXml(item.lastmod)}</lastmod>
    <priority>${item.priority}</priority>
  </url>`,
    )
    .join("\n")}\n</urlset>\n`;

  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml);
}

function writeFeed(posts) {
  const updated = latestDate(posts.map((post) => post.lastmod)) || toDate(new Date());
  const items = posts
    .map(
      (post) => `  <item>
    <title>${escapeXml(post.title)}</title>
    <link>${escapeXml(post.url)}</link>
    <guid>${escapeXml(post.url)}</guid>
    <pubDate>${new Date(post.date).toUTCString()}</pubDate>
    <description>${escapeXml(post.description)}</description>
  </item>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n  <title>${escapeXml(SITE_NAME)}</title>\n  <link>${escapeXml(SITE_URL)}</link>\n  <description>${escapeXml(`${SITE_NAME} RSS feed`)}</description>\n  <lastBuildDate>${new Date(updated).toUTCString()}</lastBuildDate>\n${items}\n</channel>\n</rss>\n`;

  fs.writeFileSync(path.join(ROOT, "feed.xml"), xml);
}

function updateIndexCards(posts) {
  const index = fs.readFileSync(INDEX_PATH, "utf8");
  const start = index.indexOf(CARD_START);
  const end = index.indexOf(CARD_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("SEO card markers are missing from index.html");
  }

  const before = index.slice(0, start + CARD_START.length);
  const after = index.slice(end);
  const cards = posts.length === 0 ? "" : `\n${posts.map((post, index) => renderCard(post, index === 0)).join("\n")}\n            `;
  fs.writeFileSync(INDEX_PATH, `${before}${cards}${after}`);
}

function renderCard(post, isLatest) {
  const tags = post.tags.map((tag) => `                  <span class="tag">${escapeHtml(tag)}</span>`).join("\n");
  const image = post.cover ? `\n              <img src="${escapeHtml(post.cover)}" alt="">` : "";
  const latest = isLatest ? `                  <span class="latest-badge">최신</span>\n` : "";

  return `            <a class="post-card" href="${escapeHtml(post.path)}" target="_blank" rel="noreferrer">${image}
              <div class="post-card-body">
                <div class="post-meta">
                  <time datetime="${escapeHtml(post.date)}">${formatKoreanDate(post.date)}</time>
${latest}                  <span>새 탭에서 열기</span>
                </div>
                <h3>${escapeHtml(post.title)}</h3>
                <p>${escapeHtml(post.description)}</p>
                <div class="tags">
${tags}
                </div>
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

main();
