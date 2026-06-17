# Personal Blog

GitHub Pages용 정적 개인 블로그입니다. 별도 빌드 과정 없이 루트의 `index.html`을 그대로 배포합니다.

## 로컬에서 확인

```sh
python3 -m http.server 8080
```

브라우저에서 `http://127.0.0.1:8080/`을 엽니다.

## 새 글 추가

1. `posts/my-post.html` 파일을 만듭니다.
2. 아래 형식으로 front matter를 작성합니다.
3. `posts.json`에 글 경로를 추가합니다.

```html
---
title: 글 제목
date: 2026-06-17
description: 목록에 보일 짧은 설명
tags: 태그1, 태그2
cover: https://images.unsplash.com/...
---

<p>본문을 HTML로 작성합니다.</p>
<h2>소제목</h2>
<p>문단을 이어서 작성합니다.</p>
```

`---` 아래에 있는 HTML이 글 상세 화면에 그대로 렌더링됩니다.

## GitHub Pages 배포

GitHub 저장소 Settings -> Pages에서 Source를 `Deploy from a branch`, Branch를 `main`, Folder를 `/ (root)`로 설정합니다.
