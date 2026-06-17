const state = {
  posts: [],
  selectedTag: "전체",
  query: "",
};

const postList = document.querySelector("#postList");
const tagList = document.querySelector("#tagList");
const searchInput = document.querySelector("#searchInput");
const emptyState = document.querySelector("#emptyState");
const postView = document.querySelector("#postView");
const year = document.querySelector("#year");

year.textContent = new Date().getFullYear();

init();

async function init() {
  try {
    const manifestResponse = await fetch("posts.json", { cache: "no-store" });
    const paths = await manifestResponse.json();
    const posts = await Promise.all(paths.map(loadPost));
    state.posts = posts
      .filter(Boolean)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    renderTags();
    renderPosts();
    renderPostFromUrl();
  } catch (error) {
    postList.innerHTML = `<p class="empty-state">글 목록을 불러오지 못했습니다.</p>`;
    console.error(error);
  }
}

async function loadPost(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) return null;

  const raw = await response.text();
  const { meta, body } = parseFrontMatter(raw);
  const slug = path.split("/").pop().replace(/\.[^.]+$/, "");

  return {
    path,
    slug,
    title: meta.title || slug,
    date: meta.date || "",
    description: meta.description || "",
    tags: splitTags(meta.tags),
    cover: meta.cover || "",
    body,
  };
}

function parseFrontMatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const meta = {};
  match[1].split("\n").forEach((line) => {
    const separator = line.indexOf(":");
    if (separator === -1) return;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    meta[key] = value;
  });

  return { meta, body: match[2].trim() };
}

function splitTags(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function renderTags() {
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
  postList.innerHTML = filtered.map(renderPostCard).join("");
}

function renderPostCard(post) {
  return `
    <a class="post-card" href="#post-${encodeURIComponent(post.slug)}" data-slug="${escapeHtml(post.slug)}">
      ${post.cover ? `<img src="${escapeAttribute(post.cover)}" alt="">` : ""}
      <div class="post-card-body">
        <div class="post-meta">
          <time datetime="${escapeAttribute(post.date)}">${formatDate(post.date)}</time>
        </div>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.description)}</p>
        <div class="tags">${post.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      </div>
    </a>
  `;
}

function renderPostFromUrl() {
  const slug = decodeURIComponent(location.hash.replace("#post-", ""));
  const post = state.posts.find((item) => item.slug === slug);

  if (!post) {
    postView.hidden = true;
    return;
  }

  postView.hidden = false;
  postView.innerHTML = `
    <div class="post-view-inner">
      <div>
        <p class="eyebrow">${formatDate(post.date)}</p>
        <h1>${escapeHtml(post.title)}</h1>
        <div class="post-meta">${post.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
        <div class="post-content">${post.body}</div>
      </div>
      ${post.cover ? `<img src="${escapeAttribute(post.cover)}" alt="">` : ""}
    </div>
  `;
  postView.scrollIntoView({ behavior: "smooth", block: "start" });
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

window.addEventListener("hashchange", renderPostFromUrl);
