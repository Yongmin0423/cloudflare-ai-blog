# 개발 기록

현재 개발 순서는 [개발 TODO](./todo.md)를 따릅니다. 아래 날짜별 다음 작업은 당시의 기록입니다.

## 2026-11-02 — 관리자 화면 구성 확정

- 작업 브랜치: feat/admin-screen-plan
- 이전 미커밋 관리자 레이아웃 작업을 유지한 상태에서 진행
- 대시보드·게시글·AI 글쓰기·카테고리·블로그 설정으로 메뉴 확정
- AI 글쓰기와 직접 글쓰기 준비 화면 및 대시보드 진입점 추가
- 화면별 기능·완료 기준과 후속 개발 TODO 문서화
- 실제 편집·저장·AI 생성 기능은 후속 단계에서 구현


## 2026-10-20 — 초기 환경 점검 및 폴더 구조

프로젝트 위치: C:\Users\yym21\Desktop\cloudflare-ai-blog

### 완료

- npm 잠금 파일을 pnpm으로 가져와 pnpm-lock.yaml 생성, package-lock.json 제거
- pnpm 10.8.0 고정, Windows 설치를 위한 hoisted 방식 적용
- Next.js 16.4.2, OpenNext 1.20.12, Wrangler 4.151.2 유지
- 앱과 설정을 apps/web으로 이동, pnpm 워크스페이스 구성
- 공개 홈을 (blog) 라우트 그룹으로 이동
- (admin)/admin, components, features, lib, types 디렉터리 준비
- Workers와 공통 패키지의 역할 문서 작성
- Windows 파일 출력에서 EPERM 재현. UV_THREADPOOL_SIZE=1로 빌드 성공 후 공통 도구 실행 스크립트에 적용

### 검증

- pnpm install --frozen-lockfile 성공
- pnpm typecheck 성공
- pnpm lint 성공
- pnpm build:worker 성공
- pnpm preview:worker 실행 후 홈 HTTP 200 및 제목 확인
- 없는 주소 HTTP 404 확인
- pnpm cf-typegen 성공

### 다음

1. 관리자·블로그 공통 레이아웃과 UI 구성
2. 관리자 인증 방식 확정 및 구현
3. D1·R2 연결과 데이터 모델 구현
4. 게시글 목록과 Tiptap 편집 화면 구현

인증 이전에 관리자용 데이터 API를 공개하지 않습니다.
GitHub 연결과 원격 배포, CI/CD는 아직 실행하지 않았습니다.

## 2026-10-20 — 관리자·공개 앱 분리 및 초기 커밋 준비

- apps/web을 apps/blog-web으로 이동하고 apps/admin-web을 별도 앱으로 구성
- 각 앱의 레이아웃·스타일·Next.js/OpenNext/Wrangler 설정과 Worker 이름 분리
- 개발 포트 blog 3000 / admin 3001, Workers 포트 blog 8787 / admin 8788
- 두 앱의 타입 생성·타입 검사·린트·Workers 빌드 성공
- 두 Worker 동시 실행에서 각각 HTTP 200과 서로 다른 제목 확인
- 관리자 기본 페이지의 noindex 출력 확인
- 기본 개발 포트 3000은 다른 프로세스가 사용 중이어서, 개발 서버는 3010/3011로 각각 실행해 HTTP 200 확인
- root layout의 children은 ReactNode를 명시해 생성 전 LayoutProps 타입에 대한 편집기 의존성 제거
- origin: https://github.com/Yongmin0423/cloudflare-ai-blog.git
- GitHub push와 Cloudflare 원격 배포는 수행하지 않음

다음 작업은 앱별 실제 레이아웃 디자인과 관리자 인증 방식 결정입니다.

## 2026-11-02 — 게시글 목록 UI

- 샘플 12개, 제목 검색·상태/카테고리 필터·최근 수정순·5개씩 페이지 이동
- 샘플 데이터임을 명시하고 빈 목록·로딩·오류 UI 전환 제공
- 새 글 작성과 글별 수정 준비 화면 연결, 존재하지 않는 샘플 ID는 404
- 타입 검사·린트 통과. 브라우저에서 검색 후 페이지 초기화, 필터 결합, 검색 결과 없음, 조건 초기화, 오류 재시도, 선택한 글 수정 경로 확인
- 실제 저장·발행·편집 기능은 아직 미구현
