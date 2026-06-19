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
const year = document.querySelector("#year");

year.textContent = new Date().getFullYear();
state.query = new URLSearchParams(window.location.search).get("q") || "";
searchInput.value = state.query;

init();

async function init() {
  try {
    const paths = await loadPostPaths();
    const posts = await Promise.all(paths.map(loadPost));
    state.posts = posts
      .filter(Boolean)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    renderOverview();
    renderPosts();
  } catch (error) {
    postList.innerHTML = `<p class="empty-state">글 목록을 불러오지 못했습니다.</p>`;
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
  if (manifestPaths.length > 0) return manifestPaths;

  return loadGitHubPostPaths();
}

async function loadManifestPostPaths() {
  try {
    const manifestResponse = await fetch("posts.json", { cache: "no-store" });
    if (!manifestResponse.ok) return [];
    const paths = await manifestResponse.json();
    return Array.isArray(paths) ? paths : [];
  } catch (error) {
    console.warn("posts.json lookup failed. Falling back to GitHub.", error);
    return [];
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
    cover: meta.cover || "",
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
  postList.innerHTML = filtered.map((post, index) => renderPostCard(post, index === 0 && state.query.trim() === "")).join("");
}

function renderPostCard(post, isLatest = false) {
  return `
    <a class="post-card" href="${escapeAttribute(post.path)}" target="_blank" rel="noreferrer" data-slug="${escapeHtml(post.slug)}">
      ${post.cover ? `<img src="${escapeAttribute(post.cover)}" alt="">` : ""}
      <div class="post-card-body">
        <div class="post-meta">
          <time datetime="${escapeAttribute(post.date)}">${formatDate(post.date)}</time>
          ${isLatest ? `<span class="latest-badge">최신</span>` : ""}
          <span>${post.readingTime}분 읽기</span>
          <span>새 탭에서 열기</span>
        </div>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.description)}</p>
      </div>
    </a>
  `;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
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
  renderPosts();
});

clearSearch.addEventListener("click", () => {
  state.query = "";
  searchInput.value = "";
  searchInput.focus();
  renderPosts();
});

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
