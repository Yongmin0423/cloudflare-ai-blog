# 관리자 인증

관리자 앱은 Cloudflare Workers에서 실행할 Next.js 서버 API와 Better Auth 1.7.17, D1을 사용합니다. 공개 회원가입과 소셜 로그인은 제공하지 않습니다.

## 현재 로컬 초기 설정

프로젝트 루트에서 실행합니다.

```powershell
pnpm admin:init
pnpm db:migrate:local
pnpm db:bootstrap:local
pnpm admin:create
```

`admin:init`은 관리자 앱의 무시된 `.env.local`과 `.dev.vars`에 AUTH_SECRET, ADMIN_ORIGIN, ADMIN_BLOG_ID를 준비합니다. 이미 있는 키는 유지하며 출력하지 않습니다. 기본 로컬 주소는 `http://localhost:3001`입니다.

마이그레이션과 환경 준비를 이미 마쳤다면 `pnpm admin:create`만 실행합니다. 터미널에서 아이디와 비밀번호를 직접 입력합니다. 비밀번호는 화면·로그·명령 인수에 표시하지 않으며 12~128자입니다. 아이디는 3~32자의 영문 소문자·숫자·점·밑줄·하이픈입니다. 최초 관리자만 생성하며, 기존 관리자를 덮어쓰지 않습니다.

생성 후 `/login`을 새로고침합니다. 개발 서버가 환경 변경을 읽지 못했다면 직접 실행한 개발 서버를 다시 시작합니다. 일반 로컬 DB는 `.wrangler/state/v3`입니다. 별도 검증용 `.wrangler/auth-test-state/v3`의 `test_owner`는 일반 로컬 앱의 관리자가 아닙니다. 둘 다 Cloudflare 원격 DB와 자동 동기화되지 않습니다.

관리자 여부만 확인하는 로컬 쿼리:

```powershell
node scripts/run-tool.mjs wrangler d1 execute cloudflare-ai-blog --config apps/admin-web/wrangler.jsonc --local --persist-to .wrangler/state --command "SELECT u.id, u.username, a.blog_id FROM auth_users u JOIN auth_administrators a ON a.user_id=u.id"
```

## 인증 흐름

1. `/api/auth/sign-in/username`으로 아이디·비밀번호를 전송합니다.
2. Better Auth가 해시된 비밀번호를 검사하고 D1 세션을 생성합니다.
3. `auth_administrators`에서 해당 블로그의 관리자 권한을 확인합니다. 권한이 없으면 새 세션을 폐기합니다.
4. 브라우저에는 HttpOnly·SameSite=Lax 쿠키를 전달하고, JSON에는 세션 토큰을 내보내지 않습니다. HTTPS 설정에서는 Secure도 적용합니다.
5. 관리자 레이아웃과 모든 관리 API가 DB 세션 및 블로그 권한을 각각 검사합니다. 쿠키 존재나 JWT 내용 디코딩만으로 권한을 판정하지 않습니다.
6. 로그아웃은 POST와 동일 Origin을 요구하며 D1 세션을 폐기합니다.

세션 수명은 8시간으로 고정하고 쿠키 캐시와 자동 세션 연장은 사용하지 않습니다. 허용한 Origin의 JSON 변경 요청만 받습니다. 로그인은 관리자 1명인 초기 범위를 기준으로 IP를 신뢰하지 않는 공통 버킷에서 분당 5회로 제한합니다. D1의 단일 원자적 UPSERT로 병렬 시도를 계산합니다. 제한에 걸리면 잠시 기다린 뒤 다시 시도합니다.

## 파일 역할과 재사용

- `packages/auth/src/config.ts`: 인증 설정과 아이디·복귀 경로·Origin 검증
- `packages/auth/src/handler.ts`: 허용한 로그인/로그아웃 API, 입력 크기 제한, 권한 확인
- `packages/auth/src/provision.ts`: 최초 관리자 해시 저장과 블로그 권한 등록
- `packages/auth/src/rate-limit.ts`: D1 기반 로그인 시도 제한
- `apps/admin-web/src/lib/auth.ts`: Next.js·Cloudflare 바인딩 연결
- `apps/admin-web/src/lib/local-admin.ts`: 관리 API의 로그인·권한·Origin 검사. 이름은 기존 파일을 유지했지만 localhost 전용 우회는 제거했습니다.

다른 블로그에서는 공통 인증 코드와 DB 마이그레이션을 사용하고 배포별 AUTH_SECRET, ADMIN_ORIGIN, ADMIN_BLOG_ID를 설정합니다. 별도 Worker 인증 서비스로 분리하려면 공통 코드는 재사용하되 서비스 간 쿠키·세션 확인 경계를 추가로 설계해야 합니다.

## Presslearn과의 차이

Presslearn 프론트는 별도 백엔드의 로그인·토큰 갱신 API를 호출하고 Access/Refresh Token을 HttpOnly 쿠키에 보관합니다. 현재 블로그는 Next.js 서버가 백엔드 역할을 하며 D1의 불투명 세션을 확인합니다. 로그인 폼, HttpOnly 쿠키, 401/403 구분은 참고하지만 별도 백엔드의 토큰 발급·갱신 규약을 그대로 복사하지 않습니다. 참고 프로젝트는 읽기만 했습니다.

## 검증과 남은 범위

인증 테스트 6개, 기존 DB 테스트 16개, 타입 검사·린트·관리자 Workers 빌드 통과. 별도 로컬 D1과 Next 개발 API에서 로그인·관리 화면/API 차단·로그인 후 초안 저장·Origin 검사·로그아웃 후 세션 폐기를 확인했습니다.

사용자가 일반 로컬 앱에서 관리자 인증 완료를 확인했습니다 (2026-11-06). 실제 Workers 런타임에서의 인증 왕복과 로그아웃·재접근을 포함한 브라우저 전체 흐름 검증은 이어서 확인합니다. 비밀번호 변경/분실 복구·다중 관리자·회원 인증·원격 초기 관리자 생성·원격 마이그레이션 및 배포는 이번 로컬 초기 설정에 포함하지 않습니다. 원격 배포 전에 원격 DB에 인증 스키마와 관리자를 별도로 준비해야 합니다.

## 브라우저 확장에 의한 hydration 경고

로그의 서버/클라이언트 차이가 `<html trancy-version="...">`라면 Trancy 확장이 HTML에 속성을 넣은 경우인지 확인합니다. localhost에서 해당 확장을 비활성화하거나 확장이 꺼진 시크릿 창으로 확인합니다. 로그인 계정 미등록 안내와는 별개이며, 경고를 숨기기 위해 전역 suppressHydrationWarning을 추가하지 않습니다.

참고: https://better-auth.com/docs/integrations/next · https://better-auth.com/docs/plugins/username · https://better-auth.com/docs/concepts/rate-limit
