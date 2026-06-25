# Personal Blog

GitHub Pages용 정적 개인 블로그입니다. 별도 빌드 과정 없이 루트의 `index.html`을 그대로 배포합니다.

사이트 이름, 공개 URL, 언어 설정은 `site.config.json`에서 관리합니다.

## 로컬에서 확인

```sh
python3 -m http.server 8080
```

브라우저에서 `http://127.0.0.1:8080/`을 엽니다.

정적 파일과 글 본문 변경 여부를 빠르게 확인하려면 아래 명령을 실행합니다.

```sh
node scripts/check-site.js
node scripts/smoke-routes.js
```

## 새 글 추가

1. `templates/post-template.html`을 참고해서 `posts/my-post.html` 파일을 만듭니다.
2. 일반 HTML 문서처럼 작성하고 `<head>`의 제목, 설명, 날짜, canonical URL, Open Graph URL, JSON-LD를 바꿉니다.
3. GitHub에 올리면 블로그 목록과 SEO 파일이 자동으로 갱신됩니다.

목록 카드는 HTML의 `<head>` 안에 있는 메타 정보를 읽습니다.

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>글 제목</title>
    <meta name="description" content="목록에 보일 짧은 설명">
    <meta name="date" content="2026-06-17">
    <meta name="cover" content="https://images.unsplash.com/...">
    <meta name="robots" content="index, follow">
    <meta property="og:url" content="https://mun-jeong-min.github.io/personal-blog/posts/my-post.html">
    <link rel="canonical" href="https://mun-jeong-min.github.io/personal-blog/posts/my-post.html">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": "글 제목",
        "description": "목록에 보일 짧은 설명",
        "datePublished": "2026-06-17",
        "dateModified": "2026-06-17",
        "url": "https://mun-jeong-min.github.io/personal-blog/posts/my-post.html",
        "mainEntityOfPage": "https://mun-jeong-min.github.io/personal-blog/posts/my-post.html",
        "inLanguage": "ko-KR"
      }
    </script>
  </head>
  <body>
    <a class="post-home-link" href="../">Panda Blog 홈</a>
    <main>
      <article>
        <h1>글 제목</h1>
        <p>본문을 HTML로 작성합니다.</p>
      </article>
    </main>
  </body>
</html>
```

목록에서 글을 누르면 `posts/my-post.html` 파일 자체가 같은 탭에서 열립니다.

## SEO 파일 갱신

`posts/*.html`이 GitHub에 올라가면 GitHub Actions가 아래 파일을 자동 갱신합니다.

- `posts.json`: 메인 화면 글 목록용
- `sitemap.xml`: 검색엔진 크롤링용
- `feed.xml`: RSS 피드
- `index.html`: 검색엔진이 JavaScript 없이도 볼 수 있는 정적 글 링크
- `robots.txt`: sitemap 위치 안내
- `404.html`: 잘못된 주소에서 홈으로 돌아가는 안내 페이지

로컬에서 직접 갱신하려면 아래 명령을 실행합니다.

```sh
node scripts/generate-seo.js
node scripts/generate-seo.js --check
node scripts/check-site.js
node scripts/smoke-routes.js
```

## GitHub Pages 배포

GitHub 저장소 Settings -> Pages에서 Source를 `Deploy from a branch`, Branch를 `main`, Folder를 `/ (root)`로 설정합니다.
