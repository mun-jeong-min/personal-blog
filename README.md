# Personal Blog

GitHub Pages용 정적 개인 블로그입니다. 별도 빌드 과정 없이 루트의 `index.html`을 그대로 배포합니다.

## 로컬에서 확인

```sh
python3 -m http.server 8080
```

브라우저에서 `http://127.0.0.1:8080/`을 엽니다.

## 새 글 추가

1. `posts/my-post.html` 파일을 만듭니다.
2. 일반 HTML 문서처럼 작성합니다.
3. GitHub에 올리면 블로그 목록에 자동으로 추가됩니다.

목록 카드는 HTML의 `<head>` 안에 있는 메타 태그를 읽습니다.

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>글 제목</title>
    <meta name="description" content="목록에 보일 짧은 설명">
    <meta name="date" content="2026-06-17">
    <meta name="tags" content="태그1, 태그2">
    <meta name="cover" content="https://images.unsplash.com/...">
  </head>
  <body>
    <h1>글 제목</h1>
    <p>본문을 HTML로 작성합니다.</p>
  </body>
</html>
```

목록에서 글을 누르면 `posts/my-post.html` 파일 자체가 새 탭에서 열립니다.
로컬에서만 새 파일을 미리 보고 싶다면 `posts.json`에도 경로를 추가하세요. GitHub Pages에 올라간 뒤에는 GitHub 폴더 목록을 자동으로 읽습니다.

## GitHub Pages 배포

GitHub 저장소 Settings -> Pages에서 Source를 `Deploy from a branch`, Branch를 `main`, Folder를 `/ (root)`로 설정합니다.
