const GITHUB_OWNER = "mun-jeong-min";
const GITHUB_REPO = "personal-blog";
const GITHUB_BRANCH = "main";
const POSTS_DIRECTORY = "posts";

const state = {
  posts: [],
  query: "",
};

const postList = document.querySelector("#postList");
const searchInput = document.querySelector("#searchInput");
const clearSearch = document.querySelector("#clearSearch");
const emptyState = document.querySelector("#emptyState");
const postSummary = document.querySelector("#postSummary");
const postCount = document.querySelector("#postCount");
const resultStatus = document.querySelector("#resultStatus");
const year = document.querySelector("#year");

assertRequiredElements({
  postList,
  searchInput,
  clearSearch,
  emptyState,
  postSummary,
  postCount,
  resultStatus,
  year,
});

year.textContent = new Date().getFullYear();
state.query = new URLSearchParams(window.location.search).get("q") || "";
searchInput.value = state.query;

init();

async function init() {
  try {
    const paths = await loadPostPaths();
    const settledPosts = await Promise.allSettled(paths.map(loadPost));
    const posts = settledPosts
      .filter((result) => result.status === "fulfilled" && result.value)
      .map((result) => result.value)
      .sort(sortPostsByDateDesc);

    if (paths.length > 0 && posts.length === 0) {
      throw new Error("No posts could be loaded.");
    }

    state.posts = posts;
    renderOverview();
    renderPosts();
  } catch (error) {
    postSummary.textContent = "글 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    resultStatus.textContent = "글 목록을 불러오지 못했습니다.";
    console.error(error);
  }
}

function renderOverview() {
  postCount.textContent = state.posts.length;

  if (state.posts.length === 0) {
    postSummary.textContent = "아직 등록된 글이 없습니다. posts 폴더에 HTML 글을 올리면 이 화면에 바로 정리됩니다.";
    return;
  }

  postSummary.textContent = "최근 글부터 차례대로 정리해 둔 글 목록입니다.";
}

async function loadPostPaths() {
  const manifestPaths = await loadManifestPostPaths();
  if (manifestPaths !== null) return manifestPaths;

  return loadGitHubPostPaths();
}

async function loadManifestPostPaths() {
  try {
    const manifestResponse = await fetch("posts.json", { cache: "no-store" });
    if (!manifestResponse.ok) return null;
    const paths = await manifestResponse.json();
    return Array.isArray(paths)
      ? paths.filter((entry) => typeof entry === "string" && /^posts\/[^/]+\.html$/i.test(entry))
      : null;
  } catch (error) {
    console.warn("posts.json lookup failed. Falling back to GitHub.", error);
    return null;
  }
}

async function loadGitHubPostPaths() {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${POSTS_DIRECTORY}?ref=${GITHUB_BRANCH}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!response.ok) return [];

    const items = await response.json();
    if (!Array.isArray(items)) return [];

    return items
      .filter((item) => item.type === "file" && item.name.toLowerCase().endsWith(".html"))
      .map((item) => `${POSTS_DIRECTORY}/${item.name}`);
  } catch (error) {
    console.warn("GitHub posts directory lookup failed. Falling back to posts.json.", error);
    return [];
  }
}

async function loadPost(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) return null;

  const raw = await response.text();
  const meta = parseHtmlMeta(raw);
  const slug = path.split("/").pop().replace(/\.[^.]+$/, "");

  return {
    path,
    slug,
    title: meta.title || slug,
    date: meta.date || "",
    description: meta.description || "",
    cover: resolvePostAsset(path, meta.cover || ""),
    readingTime: estimateReadingTime(raw),
  };
}

function parseHtmlMeta(raw) {
  const document = new DOMParser().parseFromString(raw, "text/html");
  const title = readMeta(document, "title") || document.querySelector("title")?.textContent || document.querySelector("h1")?.textContent;
  const description = readMeta(document, "description") || document.querySelector("p")?.textContent;
  const date = readMeta(document, "date") || document.querySelector("time[datetime]")?.getAttribute("datetime") || "";
  const cover = readMeta(document, "cover") || readProperty(document, "og:image") || "";

  return {
    title: title?.trim(),
    description: description?.trim(),
    date: date.trim(),
    cover,
  };
}

function readMeta(document, name) {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || "";
}

function readProperty(document, property) {
  return document.querySelector(`meta[property="${property}"]`)?.getAttribute("content") || "";
}

function renderPosts() {
  const filtered = state.posts.filter((post) => {
    const haystack = `${post.title} ${post.description}`.toLowerCase();
    const matchesQuery = haystack.includes(state.query.toLowerCase().trim());
    return matchesQuery;
  });

  emptyState.hidden = filtered.length > 0;
  emptyState.textContent =
    state.posts.length === 0
      ? "아직 등록된 글이 없습니다. posts 폴더에 HTML 파일을 올리면 자동으로 목록에 표시됩니다."
      : "검색 조건에 맞는 글이 없습니다.";
  clearSearch.hidden = state.query.trim() === "";
  resultStatus.textContent = renderResultStatus(filtered.length);
  postList.innerHTML = filtered.map((post, index) => renderPostCard(post, index === 0 && state.query.trim() === "")).join("");
}

function renderPostCard(post, isLatest = false) {
  return `
    <a class="post-card" href="${escapeAttribute(post.path)}" data-slug="${escapeHtml(post.slug)}">
      ${post.cover ? `<img src="${escapeAttribute(post.cover)}" alt="">` : ""}
      <div class="post-card-body">
        <div class="post-meta">
          <time datetime="${escapeAttribute(post.date)}">${formatDate(post.date)}</time>
          ${isLatest ? `<span class="latest-badge">최신</span>` : ""}
          <span>${post.readingTime}분 읽기</span>
        </div>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.description)}</p>
      </div>
    </a>
  `;
}

function sortPostsByDateDesc(a, b) {
  const first = parseDate(b.date)?.getTime() ?? 0;
  const second = parseDate(a.date)?.getTime() ?? 0;
  return first - second || a.path.localeCompare(b.path);
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  updateSearchUrl();
  renderPosts();
});

clearSearch.addEventListener("click", () => {
  state.query = "";
  searchInput.value = "";
  updateSearchUrl();
  searchInput.focus();
  renderPosts();
});

function renderResultStatus(count) {
  if (state.posts.length === 0) return "등록된 글이 없습니다.";
  const query = state.query.trim();
  if (!query) return `전체 ${count}개의 글을 보여주고 있습니다.`;
  return `"${query}" 검색 결과 ${count}개를 보여주고 있습니다.`;
}

function updateSearchUrl() {
  const url = new URL(window.location.href);
  const query = state.query.trim();
  if (query) {
    url.searchParams.set("q", query);
  } else {
    url.searchParams.delete("q");
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function resolvePostAsset(postPath, assetPath) {
  if (!assetPath) return "";
  if (/^(https?:)?\/\//i.test(assetPath) || assetPath.startsWith("/")) return assetPath;
  const base = postPath.slice(0, postPath.lastIndexOf("/") + 1);
  return `${base}${assetPath}`;
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function assertRequiredElements(elements) {
  const missing = Object.entries(elements)
    .filter(([, element]) => !element)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required page elements: ${missing.join(", ")}`);
  }
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
