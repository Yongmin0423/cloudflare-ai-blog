# Agent Service

관리자 API가 인증된 블로그 ID와 글 생성 요청을 이 Worker에 전달합니다. Main Agent는 블로그별 Durable Object에서 D1 작성 설정을 읽고, Workers AI의 GLM-4.7-Flash로 검색 의도와 목차를 만든 뒤 본문을 작성합니다. 두 응답을 Zod로 검증하고 본문을 Tiptap JSON으로 변환해 AI 초안으로 저장합니다.

공통 글쓰기 원칙과 참고 글 메모는 [글쓰기 가이드](./src/editorial-guide.md)에 적습니다. Main Agent는 목차와 본문을 생성할 때 이 파일과 관리자 화면의 블로그별 작성 설정을 함께 사용합니다.

로컬에서는 저장소 루트에서 `pnpm db:migrate:local`로 기존 D1 마이그레이션을 적용합니다. `pnpm exec wrangler login`으로 프로젝트의 Cloudflare 계정에 로그인하면 `AI` 바인딩이 로컬 개발 중에도 그 계정의 Workers AI에서 모델을 실행합니다. 초안과 블로그 설정은 로컬 D1에 저장됩니다.

`pnpm dev`로 관리자와 블로그를 실행하고, 다른 터미널에서 `pnpm dev:agent`로 Agent Worker를 실행합니다. 관리자에 로그인해 **AI 글쓰기 → AI 초안 생성 → 초안 편집하기** 순서로 확인합니다. AI 초안은 게시글 목록에서도 찾을 수 있습니다.

배포 환경에서는 관리자 Worker의 `AGENT_SERVICE` 서비스 바인딩으로 호출합니다. 대상 D1과 Agent Worker를 준비한 뒤 관리자 Worker를 배포합니다. 같은 요청 ID로 재시도하면 저장된 초안을 돌려줍니다.
