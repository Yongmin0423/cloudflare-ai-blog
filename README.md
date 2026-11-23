# Cloudflare AI Blog

> AI 초안을 편집하고, 인용 근거를 검토한 뒤 발행하는 블로그 플랫폼

관리자에서 글을 직접 작성하거나 AI 초안을 생성할 수 있습니다. 제목·본문·이미지·SEO 정보를 편집하고, 발행 전 QA에서 확인이 필요한 문장과 이유를 살펴봅니다. 검토를 통과한 AI 글은 발행 후 공개 블로그에서 읽을 수 있습니다.

**Next.js · OpenNext · Cloudflare Workers · D1 · R2**

## 글이 발행되기까지

| 단계       | 하는 일                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| 초안 작성  | 관리자 편집기에서 글을 작성하거나 AI로 초안을 만듭니다.                                                     |
| 편집       | 본문과 대표 이미지, SEO 제목·설명, 내부 링크를 확인하고 다듬습니다.                                         |
| 발행 전 QA | 저장된 제목과 본문의 주장을 인용 원문과 대조합니다. AI 글은 현재 저장본이 QA를 통과해야 발행할 수 있습니다. |
| 발행       | 공개 블로그에서 글을 읽을 수 있습니다. 공개 앱은 RSS와 사이트맵도 제공합니다.                               |

## 로컬에서 시작하기

**Node.js 24**와 **pnpm 10.8.0**을 준비합니다. 저장소를 받은 뒤 로컬 D1과 첫 관리자 계정을 설정합니다.

```bash
git clone https://github.com/Yongmin0423/cloudflare-ai-blog.git
cd cloudflare-ai-blog
pnpm install --frozen-lockfile
pnpm admin:init
pnpm db:migrate:local
pnpm db:bootstrap:local
pnpm admin:create
pnpm dev
```

| 앱          | Next.js 개발 서버                                   | Workers 미리보기                        |
| ----------- | --------------------------------------------------- | --------------------------------------- |
| 공개 블로그 | [localhost:3000](http://localhost:3000)             | [localhost:8787](http://localhost:8787) |
| 관리자      | [localhost:3001/login](http://localhost:3001/login) | [localhost:8788](http://localhost:8788) |

AI 기능을 사용하려면 별도 터미널에서 `pnpm dev:agent`를 실행하고 [Agent Service 설정](workers/agent-service/README.md)에 따라 초안 생성과 Workers AI 검토 환경을 연결합니다. 관리자 계정과 로컬 환경 변수는 [관리자 초기 설정](docs/admin-auth.md)을 참고하세요.

## 프로젝트 구조

공개 블로그와 관리자 앱은 레이아웃, 스타일, Wrangler 설정, 빌드 출력을 각각 관리합니다.

| 경로                                                                    | 역할                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`apps/blog-web`](apps/blog-web)                                        | 공개 글, RSS, 사이트맵 · `cloudflare-ai-blog-blog`         |
| [`apps/admin-web`](apps/admin-web)                                      | 관리자 인증, 편집, 검토, 발행 · `cloudflare-ai-blog-admin` |
| [`workers/agent-service`](workers/agent-service)                        | AI 초안 생성과 발행 전 QA                                  |
| [`packages/database`](packages/database)                                | D1 스키마와 쿼리                                           |
| [`packages/auth`](packages/auth) · [`packages/shared`](packages/shared) | 인증, 공통 타입, 입출력 검증                               |
| [`scripts`](scripts)                                                    | 로컬 개발과 초기 설정 도구                                 |

## 개발 명령

| 명령                                       | 역할                                           |
| ------------------------------------------ | ---------------------------------------------- |
| `pnpm dev:blog` / `pnpm dev:admin`         | 앱 하나만 개발 모드로 실행                     |
| `pnpm lint` / `pnpm typecheck`             | 두 앱의 린트와 타입 검사                       |
| `pnpm build`                               | 두 앱의 Next.js 빌드                           |
| `pnpm build:worker`                        | 두 앱의 Workers 빌드                           |
| `pnpm build:blog` / `pnpm build:admin`     | 앱 하나의 Workers 빌드                         |
| `pnpm preview`                             | 두 앱을 Workers용으로 빌드하고 로컬에서 실행   |
| `pnpm preview:worker`                      | 빌드된 두 앱을 Workers 런타임에서 실행         |
| `pnpm preview:blog` / `pnpm preview:admin` | 빌드된 Worker 하나만 실행                      |
| `pnpm cf-typegen`                          | 두 앱의 Cloudflare 타입 생성                   |
| `pnpm deploy:blog` / `pnpm deploy:admin`   | Cloudflare 로그인 후 원하는 앱을 빌드하고 배포 |

## 더 살펴보기

- [아키텍처](docs/architecture.md) · [개발 환경](docs/development.md) · [D1 설정](docs/d1-setup.md)
- [AI 글쓰기 품질](docs/ai-writing-quality.md) · [발행 전 QA와 다음 작업](docs/next-steps.md) · [개발 TODO](docs/todo.md)
