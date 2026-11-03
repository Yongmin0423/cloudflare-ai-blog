# D1 연결

기준일: 2026-11-03. 작업 브랜치: feat/data-model-d1.

## 현재 상태

- Cloudflare 계정에 D1 데이터베이스 cloudflare-ai-blog 생성 (APAC 위치 힌트)
- DB ID: 457e1d1c-046f-4f9e-a723-1fea0fc9f61b
- admin-web와 blog-web의 wrangler.jsonc에 동일한 DB 바인딩 설정
- getDatabase()는 각 앱의 서버 전용 lib/database.ts에서만 사용
- 블로그 업무 테이블 7개는 로컬 D1에만 적용. 실제 원격 D1에는 아직 미적용
- 관리자 카테고리·설정은 로컬 D1을 사용. AI 화면은 D1의 작성 기본값·카테고리를 조회
- 게시글·공개 블로그는 아직 샘플/브라우저 저장. 이전 카테고리·설정 localStorage는 보존하지만 자동 이전하지 않음
- R2는 미생성·미연결

## 로컬과 원격

로컬 Next 개발 서버는 원격 운영 데이터에 접근하지 않습니다. 두 앱이 프로젝트 루트의 .wrangler/state를 사용하도록 next.config.ts에 persist 경로를 지정했습니다.

주의: Next/OpenNext의 getPlatformProxy persist.path는 실제 저장 디렉터리를 받으므로 `.wrangler/state/v3`를 사용합니다. Wrangler CLI의 `--persist-to .wrangler/state`는 내부에서 `v3`를 붙입니다. 이 차이를 반영해야 동일한 업무 테이블을 읽습니다.

OpenNext 로컬 preview도 --persist-to ../../.wrangler/state를 전달합니다. 직접 Wrangler를 사용할 때는 프로젝트 루트 기준 --persist-to .wrangler/state를 지정해야 같은 로컬 데이터를 조회합니다.

로컬 DB와 실제 Cloudflare D1은 서로 다른 데이터입니다. --remote 실행을 명시하지 않은 로컬 검증 데이터를 운영 DB로 자동 동기화하지 않습니다.

## 연결 확인

프로젝트 루트에서:

```powershell
pnpm db:check
pnpm db:check:remote
```

두 명령은 SELECT 1 AS connected만 실행하며 업무 데이터를 만들거나 수정하지 않습니다.

Next.js 개발 서버에서:

- 관리자: http://localhost:3001/api/health/db
- 공개 블로그: http://localhost:3000/api/health/db

정상 응답: HTTP 200, {"ok":true,"storage":"D1"}. 실패 시 503입니다. 이 엔드포인트는 상수 쿼리만 실행하며 인증 토큰·계정/DB ID·에러 상세를 반환하지 않습니다.

`pnpm dev` 실행에 별도 `wrangler dev`는 필요하지 않습니다. next.config.ts의 OpenNext 개발 어댑터가 로컬 바인딩을 제공합니다.

## 로컬 관리 데이터 준비

```powershell
pnpm db:migrate:local
pnpm db:bootstrap:local
pnpm dev:admin
```

초기 데이터는 고정된 개발용 블로그 한 개와 작성 설정만 추가하며 기존 행을 덮어쓰지 않습니다. 초기 카테고리·게시글은 없습니다. 원격 적용 명령은 실행하지 않습니다.

관리 API는 `/api/admin/settings`의 GET/PUT, `/api/admin/categories`의 GET/POST, `/api/admin/categories/[id]`의 PUT/DELETE입니다. 인증 전까지 development + localhost에서만 허용하며 production은 403입니다. 변경 요청은 동일 Origin과 JSON을 요구합니다. 관리 화면 자체의 인증 보호는 아직 미구현입니다. 블로그 ID는 서버가 고정하며 클라이언트가 지정할 수 없습니다.

카테고리 이름·슬러그 중복과 오래된 버전 저장은 409로 거부합니다. 설정과 작성 규칙은 D1 batch로 함께 저장합니다. 실제 게시글이 있는 카테고리는 삭제할 수 없습니다. AI 작업 실행은 여전히 시뮬레이션입니다.

```powershell
pnpm db:test:schema
pnpm db:test:management
```

## 다음 작업

1. 게시글·SEO의 공통 계약과 서버 쿼리 구현
2. 게시글 목록·에디터를 D1에 연결
3. 관리자 인증과 초안/변경 API 보호
4. 실제 D1에 검증된 마이그레이션 적용

Cloudflare OAuth 토큰은 Wrangler의 사용자 설정 폴더에 보관하며 저장소에는 넣지 않습니다. wrangler.jsonc의 계정 ID와 DB ID는 바인딩 식별자입니다.

참고: https://developers.cloudflare.com/d1/get-started/ · https://developers.cloudflare.com/d1/best-practices/local-development/ · https://opennext.js.org/cloudflare/bindings
