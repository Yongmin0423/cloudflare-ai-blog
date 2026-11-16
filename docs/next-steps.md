# 발행 전 QA와 다음 개발 작업

## 다른 컴퓨터에서 시작하기

GitHub 저장소에 접근할 수 있는 계정, Node.js 24, pnpm 10.8.0을 준비합니다. 새 체크아웃에서 아래 명령을 실행합니다.

```powershell
git clone https://github.com/Yongmin0423/cloudflare-ai-blog.git
cd cloudflare-ai-blog
pnpm install --frozen-lockfile
pnpm admin:init
pnpm db:migrate:local
pnpm db:bootstrap:local
pnpm admin:create
```

이미 저장소를 받았다면 `main`으로 전환해 최신 변경을 받습니다. 기존 로컬 DB에 이어서 작업한다면 `pnpm db:migrate:local`로 QA 테이블을 추가합니다. 새 DB와 최초 관리자 설정은 [관리자 인증](./admin-auth.md)을 참고합니다.

로컬 D1의 글·관리자 계정과 연결된 ChatGPT 계정은 해당 컴퓨터에서 준비합니다. Git에는 마이그레이션과 초기화 스크립트가 포함됩니다. `.wrangler/state`, `.env.local`, `.dev.vars`의 실제 값과 토큰은 Git에 올리지 않습니다.

Cloudflare 프로젝트 계정으로 `pnpm exec wrangler login`을 실행해 Workers AI에 연결합니다. 터미널 두 개를 열고 저장소 루트에서 각각 다음 명령을 실행합니다.

```powershell
pnpm dev
pnpm dev:agent
```

관리자는 `http://localhost:3001`, 공개 블로그는 `http://localhost:3000`, Agent Worker는 `http://127.0.0.1:8789`를 사용합니다. 새 AI 초안이 필요하면 관리자에 로그인한 뒤 **AI 글쓰기**에서 ChatGPT 계정을 연결하고 모델을 선택합니다. 발행 전 QA는 Workers AI로 실행됩니다. 상세 설정은 [Agent Service 안내](../workers/agent-service/README.md)를 참고합니다.

## 먼저 확인할 작업

- [x] 저장된 AI 초안의 제목·본문·인용 원문을 대조하고, 편집기에 문제 문장과 이유를 표시
- [x] 현재 저장본이 통과했을 때만 서버에서 AI 글 발행 허용
- [x] 로컬 D1 마이그레이션, DB 버전 검사, 모의 Worker 인용 검토 경로 확인
- [ ] 영화·제품 비교·생활 안내 중 하나로 새 AI 초안을 생성하고 인용이 실제 주장을 뒷받침하는지 확인
- [ ] **QA 검토 요청 → 통과 → 발행 → 공개 블로그에서 확인**까지 실제 Workers AI로 검증
- [ ] 잘못된 날짜나 제품 사양을 넣은 테스트용 초안에서 **수정 필요**와 발행 차단을 확인한 뒤, 고쳐서 재검토
- [ ] 통과한 초안을 한 번 더 편집해 저장하면 결과가 검토 대기로 돌아오는지 확인

프로젝트의 QA 테스트는 아래 명령으로 실행합니다.

```powershell
pnpm db:test:schema
pnpm db:test:posts
pnpm --filter @cloudflare-ai-blog/agent-service test
pnpm --filter @cloudflare-ai-blog/admin-web typecheck
pnpm --filter @cloudflare-ai-blog/agent-service typecheck
```

## QA 검증 이후 개발 순서

1. **SEO Agent** — AI 글쓰기에서 본문과 SEO 제목·설명을 한 번에 생성하고 초안으로 저장합니다. 수동 글을 작성하거나 SEO를 다시 제안받으려면 저장 후 **검색엔진 설정 → AI SEO 제안 받기**를 사용합니다. 실제 Workers AI 연결에서 생성된 SEO가 편집 화면에 표시되고 다시 열어도 유지되는지 확인합니다.
2. **이미지 Agent** — AI 초안 생성 과정에서 대표 이미지와 대체 텍스트를 생성합니다. 관리자 편집 화면에서 이미지와 대체 텍스트를 확인하고, 실제 R2 저장과 발행 후 공개 페이지의 이미지 응답을 검증합니다.
3. **내부 링크 Agent** — 같은 블로그의 발행 글을 기준으로 관련 링크와 넣을 위치를 제안합니다.
4. **발행 흐름 통합** — 에이전트별 실행 결과를 기록하고, 관리자 검토·저장·최종 발행을 연결합니다.

전체 일정과 상태는 [개발 TODO](./todo.md)를 참고합니다.
