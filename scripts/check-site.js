const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = process.cwd();
const SITE_CONFIG = readSiteConfig();
const POSTS_DIR = path.join(ROOT, "posts");
const POSTS_JSON = path.join(ROOT, "posts.json");
const INDEX_PATH = path.join(ROOT, "index.html");
const NOT_FOUND_PATH = path.join(ROOT, "404.html");
const STYLES_PATH = path.join(ROOT, "styles.css");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const FEED_PATH = path.join(ROOT, "feed.xml");
const SITE_URL = ensureTrailingSlash(SITE_CONFIG.siteUrl);
const SITE_LANGUAGE = SITE_CONFIG.language || "ko-KR";
const BASE_REF = resolveBaseRef(process.env.BASE_REF);
const SEO_CARD_START = "<!-- SEO_POST_CARDS_START -->";
const SEO_CARD_END = "<!-- SEO_POST_CARDS_END -->";

const errors = [];

function main() {
  checkIndexMarkers();
  checkAppShell();
  checkStyles();
  checkNotFoundPage();
  checkHomeSeo();
  const postPaths = readPostPaths();
  checkManifest(postPaths);
  checkGeneratedUrls(postPaths);
  checkPostMetadata(postPaths);
  checkArticleTextUnchanged(postPaths);

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Site check passed for ${postPaths.length} posts.`);
}

function checkStyles() {
  if (!fs.existsSync(STYLES_PATH)) {
    errors.push("styles.css is missing.");
    return;
  }

  const css = readFile(STYLES_PATH);
  if (!css.includes(":focus-visible")) {
    errors.push("styles.css is missing focus-visible styles.");
  }
  if (!css.includes("scroll-margin-top")) {
    errors.push("styles.css is missing sticky-header scroll margin styles.");
  }
  if (!css.includes("prefers-reduced-motion: reduce")) {
    errors.push("styles.css is missing reduced-motion handling.");
  }
}

function checkNotFoundPage() {
  if (!fs.existsSync(NOT_FOUND_PATH)) {
    errors.push("404.html is missing.");
    return;
  }

  const html = readFile(NOT_FOUND_PATH);
  if (readMeta(html, "robots") !== "noindex") {
    errors.push("404.html must use noindex robots meta.");
  }
  if (!new RegExp(`<a\\b[^>]*href=["']${escapeRegex(SITE_URL)}["'][^>]*>`).test(html)) {
    errors.push("404.html is missing a home link.");
  }
}

function checkHomeSeo() {
  const index = readFile(INDEX_PATH);
  const robotsPath = path.join(ROOT, "robots.txt");
  const canonical = readCanonical(index);
  const ogUrl = readProperty(index, "og:url");
  const rssHref = readLink(index, "alternate", "application/rss+xml");
  const blogJsonLd = readJsonLd(index).find((item) => item["@type"] === "Blog");

  if (canonical !== SITE_URL) errors.push(`index.html canonical URL must be ${SITE_URL}.`);
  if (ogUrl !== SITE_URL) errors.push(`index.html og:url must be ${SITE_URL}.`);
  if (rssHref !== new URL("feed.xml", SITE_URL).toString()) {
    errors.push("index.html RSS alternate link is missing or incorrect.");
  }
  if (!blogJsonLd) {
    errors.push("index.html is missing Blog JSON-LD.");
  } else {
    if (blogJsonLd.name !== SITE_CONFIG.siteName) {
      errors.push(`index.html Blog JSON-LD name must be ${SITE_CONFIG.siteName}.`);
    }
    if (blogJsonLd.url !== SITE_URL) errors.push(`index.html Blog JSON-LD url must be ${SITE_URL}.`);
    if (blogJsonLd.inLanguage !== SITE_LANGUAGE) {
      errors.push(`index.html Blog JSON-LD inLanguage must be ${SITE_LANGUAGE}.`);
    }
    if (blogJsonLd.potentialAction?.["@type"] !== "SearchAction") {
      errors.push("index.html Blog JSON-LD is missing SearchAction.");
    }
  }

  if (!fs.existsSync(robotsPath)) {
    errors.push("robots.txt is missing.");
  } else if (!readFile(robotsPath).includes(`Sitemap: ${new URL("sitemap.xml", SITE_URL).toString()}`)) {
    errors.push("robots.txt sitemap URL is missing or incorrect.");
  }
}

function checkAppShell() {
  const index = readFile(INDEX_PATH);
  const requiredIds = [
    "top",
    "posts",
    "about",
    "postList",
    "searchInput",
    "clearSearch",
    "emptyState",
    "postSummary",
    "postCount",
    "resultStatus",
    "year",
  ];

  for (const id of requiredIds) {
    if (!new RegExp(`\\bid=["']${escapeRegex(id)}["']`).test(index)) {
      errors.push(`index.html is missing #${id}.`);
    }
  }

  if (!index.includes('href="#posts"')) errors.push("index.html is missing skip/archive link to #posts.");
  if (!index.includes('href="#top"')) errors.push("index.html is missing footer link to #top.");

  const internalBlankPostLinks = Array.from(index.matchAll(/<a\b[^>]*href=["']posts\/[^"']+\.html["'][^>]*>/gi))
    .filter((match) => /\btarget=["']_blank["']/i.test(match[0]));
  if (internalBlankPostLinks.length > 0) {
    errors.push("index.html post cards must not force internal posts into a new tab.");
  }

  const blankLinks = Array.from(index.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi));
  for (const link of blankLinks) {
    const rel = readAttribute(link[0], "rel").toLowerCase().split(/\s+/);
    if (!rel.includes("noopener") || !rel.includes("noreferrer")) {
      errors.push("index.html external new-tab links must use rel=\"noopener noreferrer\".");
    }
  }
}

function checkIndexMarkers() {
  const index = readFile(INDEX_PATH);
  if (!index.includes(SEO_CARD_START) || !index.includes(SEO_CARD_END)) {
    errors.push("index.html is missing SEO post card markers.");
  }
}


function readPostPaths() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs
    .readdirSync(POSTS_DIR)
    .filter((file) => file.toLowerCase().endsWith(".html"))
    .map((file) => `posts/${file}`)
    .sort();
}

function checkManifest(postPaths) {
  if (!fs.existsSync(POSTS_JSON)) {
    errors.push("posts.json is missing.");
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFile(POSTS_JSON));
  } catch (error) {
    errors.push(`posts.json is not valid JSON: ${error.message}`);
    return;
  }

  if (!Array.isArray(manifest)) {
    errors.push("posts.json must contain an array of post paths.");
    return;
  }

  const missing = postPaths.filter((postPath) => !manifest.includes(postPath));
  const stale = manifest.filter((postPath) => !postPaths.includes(postPath));

  for (const postPath of missing) {
    errors.push(`posts.json is missing ${postPath}.`);
  }

  for (const postPath of stale) {
    errors.push(`posts.json contains stale path ${postPath}.`);
  }
}

function checkGeneratedUrls(postPaths) {
  const expectedUrls = [SITE_URL, ...postPaths.map((postPath) => new URL(postPath, SITE_URL).toString())];

  if (!fs.existsSync(SITEMAP_PATH)) {
    errors.push("sitemap.xml is missing.");
  } else {
    const sitemapUrls = extractTagValues(readFile(SITEMAP_PATH), "loc");
    compareUrlSet("sitemap.xml", sitemapUrls, expectedUrls);
  }

  if (!fs.existsSync(FEED_PATH)) {
    errors.push("feed.xml is missing.");
  } else {
    const feed = readFile(FEED_PATH);
    const feedLinks = extractTagValues(feed, "link");
    compareUrlSet("feed.xml", feedLinks, expectedUrls);
    if (!feed.includes(`<language>${SITE_LANGUAGE}</language>`)) {
      errors.push(`feed.xml is missing ${SITE_LANGUAGE} language.`);
    }
    if (!feed.includes(`<atom:link href="${new URL("feed.xml", SITE_URL).toString()}" rel="self" type="application/rss+xml" />`)) {
      errors.push("feed.xml is missing Atom self link.");
    }
    for (const postPath of postPaths) {
      const postUrl = new URL(postPath, SITE_URL).toString();
      if (!feed.includes(`<guid isPermaLink="true">${postUrl}</guid>`)) {
        errors.push(`feed.xml is missing permalink guid for ${postUrl}.`);
      }
    }
  }
}

function compareUrlSet(file, actualUrls, expectedUrls) {
  const actual = new Set(actualUrls);
  const expected = new Set(expectedUrls);

  for (const expectedUrl of expected) {
    if (!actual.has(expectedUrl)) {
      errors.push(`${file} is missing ${expectedUrl}.`);
    }
  }

  for (const actualUrl of actual) {
    if (!expected.has(actualUrl)) {
      errors.push(`${file} contains stale URL ${actualUrl}.`);
    }
  }
}

function checkPostMetadata(postPaths) {
  for (const postPath of postPaths) {
    const html = readFile(path.join(ROOT, postPath));
    if (!/<a\b[^>]*class=["'][^"']*\bpost-home-link\b[^"']*["'][^>]*href=["']\.\.\/["'][^>]*>/i.test(html)) {
      errors.push(`${postPath} is missing the post home link.`);
    }
    if (!/<main\b[^>]*>[\s\S]*<article\b/i.test(html)) {
      errors.push(`${postPath} article must be wrapped in main.`);
    }

    const title = readTitle(html);
    const description = readMeta(html, "description");
    const date = readMeta(html, "date");
    const canonical = readCanonical(html);
    const ogUrl = readProperty(html, "og:url");
    const expectedUrl = new URL(postPath, SITE_URL).toString();
    const articleJsonLd = readJsonLd(html).find((item) => item["@type"] === "BlogPosting");
    const modified = readProperty(html, "article:modified_time") || readMeta(html, "modified") || date;

    if (!title) errors.push(`${postPath} is missing a title.`);
    if (!description) errors.push(`${postPath} is missing meta description.`);
    if (!date) errors.push(`${postPath} is missing meta date.`);
    if (date && Number.isNaN(new Date(date).getTime())) {
      errors.push(`${postPath} has an invalid meta date: ${date}.`);
    }
    if (!readMeta(html, "viewport")) errors.push(`${postPath} is missing viewport meta.`);
    if (!canonical) errors.push(`${postPath} is missing canonical URL.`);
    if (canonical && canonical !== expectedUrl) errors.push(`${postPath} canonical URL must be ${expectedUrl}.`);
    if (!ogUrl) errors.push(`${postPath} is missing og:url.`);
    if (ogUrl && ogUrl !== expectedUrl) errors.push(`${postPath} og:url must be ${expectedUrl}.`);
    if (!articleJsonLd) {
      errors.push(`${postPath} is missing BlogPosting JSON-LD.`);
    } else {
      if (articleJsonLd.headline !== title) errors.push(`${postPath} JSON-LD headline must match title.`);
      if (articleJsonLd.description !== description) errors.push(`${postPath} JSON-LD description must match meta description.`);
      if (articleJsonLd.datePublished !== date) errors.push(`${postPath} JSON-LD datePublished must match meta date.`);
      if (articleJsonLd.dateModified !== modified) errors.push(`${postPath} JSON-LD dateModified must match modified date.`);
      if (articleJsonLd.url !== expectedUrl) errors.push(`${postPath} JSON-LD url must be ${expectedUrl}.`);
      if (articleJsonLd.mainEntityOfPage !== expectedUrl) errors.push(`${postPath} JSON-LD mainEntityOfPage must be ${expectedUrl}.`);
      if (articleJsonLd.inLanguage !== SITE_LANGUAGE) {
        errors.push(`${postPath} JSON-LD inLanguage must be ${SITE_LANGUAGE}.`);
      }
    }
  }
}

function checkArticleTextUnchanged(postPaths) {
  for (const postPath of postPaths) {
    const current = readFile(path.join(ROOT, postPath));
    const baseline = readGitHeadFile(postPath);
    if (!baseline) continue;

    const currentText = normalizeArticleText(current);
    const baselineText = normalizeArticleText(baseline);

    if (currentText !== baselineText) {
      errors.push(`${postPath} article text changed relative to HEAD.`);
    }
  }
}

function readGitHeadFile(relativePath) {
  try {
    return execFileSync("git", ["show", `${BASE_REF}:${relativePath}`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function resolveBaseRef(value) {
  if (!value || /^0{40}$/.test(value)) return "HEAD";
  return value;
}

function readTitle(html) {
  const metaTitle = readMeta(html, "title");
  if (metaTitle) return metaTitle;
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return title ? decodeEntities(stripTags(title[1]).trim()) : "";
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
  return readLink(html, "canonical");
}

function readLink(html, rel, type = "") {
  const links = html.match(/<link\b[^>]*>/gi) || [];
  const link = links.find((tag) => {
    const rels = readAttribute(tag, "rel").toLowerCase().split(/\s+/);
    const typeMatches = !type || readAttribute(tag, "type").toLowerCase() === type.toLowerCase();
    return rels.includes(rel.toLowerCase()) && typeMatches;
  }) || "";
  return link ? decodeEntities((readAttribute(link, "href") || "").trim()) : "";
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

function extractTagValues(xml, tagName) {
  return Array.from(xml.matchAll(new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`, "gi")))
    .map((match) => decodeEntities(match[1].trim()));
}

function readJsonLd(html) {
  const scripts = Array.from(
    html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  );
  const values = [];

  for (const script of scripts) {
    try {
      values.push(JSON.parse(script[1]));
    } catch (error) {
      errors.push(`Invalid JSON-LD: ${error.message}`);
    }
  }

  return values.flatMap((value) => Array.isArray(value) ? value : [value]);
}

function normalizeArticleText(html) {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const source = article ? article[1] : html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  return decodeEntities(
    stripTags(
      source
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " "),
    ),
  )
    .replace(/\s+/g, " ")
    .trim();
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
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

main();
