const GITHUB_OWNER = "mun-jeong-min";
const GITHUB_REPO = "personal-blog";
const GITHUB_BRANCH = "main";
const POSTS_DIRECTORY = "posts";

const state = {
  posts: [],
  selectedTag: "전체",
  query: "",
};

const postList = document.querySelector("#postList");
const tagList = document.querySelector("#tagList");
const searchInput = document.querySelector("#searchInput");
const emptyState = document.querySelector("#emptyState");
const featuredPost = document.querySelector("#featuredPost");
const postSummary = document.querySelector("#postSummary");
const postCount = document.querySelector("#postCount");
const tagCount = document.querySelector("#tagCount");
const year = document.querySelector("#year");

year.textContent = new Date().getFullYear();

init();

async function init() {
  try {
    const paths = await loadPostPaths();
    const posts = await Promise.all(paths.map(loadPost));
    state.posts = posts
      .filter(Boolean)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    renderOverview();
    renderFeaturedPost();
    renderTags();
    renderPosts();
  } catch (error) {
    postList.innerHTML = `<p class="empty-state">글 목록을 불러오지 못했습니다.</p>`;
    console.error(error);
  }
}

function renderOverview() {
  const tags = new Set(state.posts.flatMap((post) => post.tags));
  postCount.textContent = state.posts.length;
  tagCount.textContent = tags.size;

  if (state.posts.length === 0) {
    postSummary.textContent = "아직 등록된 글이 없습니다. posts 폴더에 HTML 글을 올리면 이 화면에 바로 정리됩니다.";
    return;
  }

  const latest = state.posts[0];
  postSummary.textContent = `최근 글은 "${latest.title}"입니다. 글 목록에서 바로 열어볼 수 있습니다.`;
}

function renderFeaturedPost() {
  const latest = state.posts[0];

  if (!latest) {
    featuredPost.hidden = true;
    featuredPost.innerHTML = "";
    return;
  }

  featuredPost.hidden = false;
  featuredPost.innerHTML = `
    <div>
      <p class="eyebrow">Latest</p>
      <h2>${escapeHtml(latest.title)}</h2>
      <p>${escapeHtml(latest.description)}</p>
      <div class="post-meta">
        <time datetime="${escapeAttribute(latest.date)}">${formatDate(latest.date)}</time>
        ${latest.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
      </div>
      <a class="primary-button" href="${escapeAttribute(latest.path)}" target="_blank" rel="noreferrer">새 탭에서 읽기</a>
    </div>
    ${latest.cover ? `<img src="${escapeAttribute(latest.cover)}" alt="">` : ""}
  `;
}

async function loadPostPaths() {
  const githubPaths = await loadGitHubPostPaths();
  if (githubPaths.length > 0) return githubPaths;

  const manifestResponse = await fetch("posts.json", { cache: "no-store" });
  return manifestResponse.json();
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
    tags: splitTags(meta.tags),
    cover: meta.cover || "",
  };
}

function parseHtmlMeta(raw) {
  const document = new DOMParser().parseFromString(raw, "text/html");
  const title = readMeta(document, "title") || document.querySelector("title")?.textContent || document.querySelector("h1")?.textContent;
  const description = readMeta(document, "description") || document.querySelector("p")?.textContent;
  const date = readMeta(document, "date") || document.querySelector("time[datetime]")?.getAttribute("datetime") || "";
  const tags = readMeta(document, "tags") || "";
  const cover = readMeta(document, "cover") || readProperty(document, "og:image") || "";

  return {
    title: title?.trim(),
    description: description?.trim(),
    date: date.trim(),
    tags,
    cover,
  };
}

function readMeta(document, name) {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || "";
}

function readProperty(document, property) {
  return document.querySelector(`meta[property="${property}"]`)?.getAttribute("content") || "";
}

function splitTags(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function renderTags() {
  if (state.posts.length === 0) {
    tagList.innerHTML = `<span class="tag-hint">글을 올리면 키워드가 표시됩니다.</span>`;
    return;
  }

  const tags = ["전체", ...new Set(state.posts.flatMap((post) => post.tags))];
  tagList.innerHTML = tags
    .map(
      (tag) => `
        <button class="tag-button" type="button" aria-pressed="${tag === state.selectedTag}" data-tag="${escapeHtml(tag)}">
          ${escapeHtml(tag)}
        </button>
      `,
    )
    .join("");

  tagList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTag = button.dataset.tag;
      renderTags();
      renderPosts();
    });
  });
}

function renderPosts() {
  const filtered = state.posts.filter((post) => {
    const matchesTag = state.selectedTag === "전체" || post.tags.includes(state.selectedTag);
    const haystack = `${post.title} ${post.description} ${post.tags.join(" ")}`.toLowerCase();
    const matchesQuery = haystack.includes(state.query.toLowerCase().trim());
    return matchesTag && matchesQuery;
  });

  emptyState.hidden = filtered.length > 0;
  emptyState.textContent =
    state.posts.length === 0
      ? "아직 등록된 글이 없습니다. posts 폴더에 HTML 파일을 올리면 자동으로 목록에 표시됩니다."
      : "검색 조건에 맞는 글이 없습니다.";
  postList.innerHTML = filtered.map(renderPostCard).join("");
}

function renderPostCard(post) {
  return `
    <a class="post-card" href="${escapeAttribute(post.path)}" target="_blank" rel="noreferrer" data-slug="${escapeHtml(post.slug)}">
      ${post.cover ? `<img src="${escapeAttribute(post.cover)}" alt="">` : ""}
      <div class="post-card-body">
        <div class="post-meta">
          <time datetime="${escapeAttribute(post.date)}">${formatDate(post.date)}</time>
          <span>새 탭에서 열기</span>
        </div>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.description)}</p>
        <div class="tags">${post.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
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
