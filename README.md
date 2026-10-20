# Cloudflare AI Blog

Next.js 16 + OpenNext + Cloudflare Workers 기반 블로그 모노레포입니다.
관리자와 공개 블로그는 별도 Next.js 앱이며 레이아웃·스타일·Worker 설정·빌드 출력을 각각 관리합니다.

## 환경과 실행

Node.js 24, pnpm 10.8.0을 사용합니다.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

| 앱 | 개발 주소 | Workers 미리보기 | Worker 이름 |
| --- | --- | --- | --- |
| 공개 블로그 | http://localhost:3000 | http://localhost:8787 | cloudflare-ai-blog-blog |
| 관리자 | http://localhost:3001 | http://localhost:8788 | cloudflare-ai-blog-admin |

새로 설치한 경우 각 앱의 `.dev.vars.example`을 같은 폴더의 `.dev.vars`로 복사합니다.
아직 관리자 로그인과 데이터 API는 구현하지 않았습니다. 기본 페이지에는 비공개 데이터가 없습니다.
관리자 도메인을 연결할 때도 서버 인증과 권한 검사는 별도로 구현해야 합니다.

## 구조

```text
apps/
  admin-web/             관리자 Next.js 앱
    src/app/layout.tsx   관리자 전용 루트 레이아웃
    src/app/globals.css  관리자 전용 스타일
    wrangler.jsonc       관리자 Worker 설정
  blog-web/              공개 블로그 Next.js 앱
    src/app/layout.tsx   블로그 전용 루트 레이아웃
    src/app/globals.css  블로그 전용 스타일
    wrangler.jsonc       블로그 Worker 설정
workers/agent-service/   AI Worker 준비 영역
packages/shared/        공통 타입·검증 준비 영역
packages/database/      D1 스키마·쿼리 준비 영역
scripts/                로컬 개발 도구 실행 보조
docs/                  구조·개발 기록
```

`workers`와 `packages`에는 역할 문서만 있으며 아직 실행 패키지는 없습니다.
공통 UI 패키지는 실제 재사용 수요가 생겼을 때 추가합니다.

## 루트 명령

| 명령 | 역할 |
| --- | --- |
| pnpm dev | 두 앱 동시 개발 실행 |
| pnpm dev:admin / pnpm dev:blog | 앱 하나만 개발 실행 |
| pnpm typecheck | 두 앱 타입 검사 |
| pnpm lint | 두 앱 ESLint 검사 |
| pnpm build | 두 앱 Next.js 빌드 |
| pnpm build:worker | 두 앱 Workers 순차 빌드 |
| pnpm build:admin / pnpm build:blog | 앱 하나의 Workers 빌드 |
| pnpm preview | 두 앱 Workers 빌드 후 동시 로컬 실행 |
| pnpm preview:worker | 이미 빌드한 두 Worker 동시 실행 |
| pnpm preview:admin / pnpm preview:blog | 이미 빌드한 Worker 하나 실행 |
| pnpm cf-typegen | 두 앱 Cloudflare 타입 생성 |
| pnpm deploy:admin / pnpm deploy:blog | 선택한 앱만 빌드·수동 배포 |

실제 배포에는 별도 Cloudflare 로그인이 필요합니다. 아직 원격 배포하지 않았습니다.

## 공통 설정

- pnpm-workspace.yaml: 앱·Worker·공통 패키지 위치
- .npmrc: 프로젝트 내부 패키지 저장소와 Windows 링크 권한을 피하는 hoisted 설치 방식
- scripts/run-tool.mjs: Windows 파일 작업 동시성 제한, 앱별 Wrangler 로컬 상태 경로
- 각 앱의 next.config.ts: Next.js 설정과 모노레포 경로
- 각 앱의 open-next.config.ts: Workers 변환 설정

`.env*`, `.dev.vars*` 실제 값, `.pnpm-store`, `node_modules`와 빌드 출력은 Git에서 제외합니다.
D1·R2, 관리자 인증, 도메인 연결, AI 기능, CI/CD는 아직 구현하지 않았습니다.

## 공식 문서

- https://opennext.js.org/cloudflare/get-started
- https://pnpm.io/workspaces
