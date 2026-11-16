# Agent Service

관리자 API가 인증된 블로그 ID와 글 생성 요청을 이 Worker에 전달합니다. 먼저 키워드로 대상 이름과 유형을 제안합니다. 관리자가 대상을 확인하면 Main Agent가 블로그별 D1 작성 설정과 확인한 대상을 바탕으로 Workers AI의 GLM-4.7-Flash로 목차와 본문을 작성해 편집 가능한 Tiptap 초안으로 저장합니다. 작성 지침은 모델이 확신하기 어려운 날짜·수치·사양이나 지어낸 출처를 피하도록 안내합니다. 기본 모드의 초안은 출처를 조사하거나 사실을 확인한 결과가 아니므로 발행 전 관리자 검토가 필요합니다.

### 로컬에서 ChatGPT로 본문 작성

관리자에 로그인하고 **AI 글쓰기 → Continue with ChatGPT**를 눌러 ChatGPT 구독 사용을 승인합니다. 돌아온 화면에서 **초안 작성 모델**에서 ChatGPT 모델을 선택하고 **출처 검색하고 초안 생성**을 누릅니다. 로컬에서 모델을 선택해야 AI 초안을 저장할 수 있습니다. ChatGPT 웹 검색으로 수집한 링크의 원문을 읽어 목차를 구성하고, 선택한 ChatGPT 모델이 근거를 인용해 본문을 작성합니다. Workers AI가 목차와 사실 검증을 처리합니다. 검색이나 원문 확인에 실패하면 초안 저장을 중단합니다. 저장한 초안은 로컬 D1에서 확인할 수 있습니다.

ChatGPT 계정 연결에는 로컬 관리자 개발 서버의 3001번 포트와 Agent Worker의 8789번 포트를 사용합니다. OpenAI API 키 없이 계정을 연결할 수 있습니다. [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source) · [ChatGPT 사용량 및 앱 관리](https://chatgpt.com/settings/usage)

### 출처 기반 생성 설정

별도 검색과 사실 검증을 테스트할 때는 Agent Worker에 `AI_DRAFT_SOURCE_CHECK="true"`와 `CERAMIC_API_KEY`를 함께 설정합니다. 로컬에서는 `workers/agent-service/.dev.vars`를 사용합니다. Worker가 Ceramic.ai에서 찾은 페이지를 읽고, 원문 인용과 초안을 대조하는 별도 모델 호출을 수행합니다. 검사에 통과한 초안에는 원문 링크가 포함됩니다. [Ceramic.ai 검색 API](https://docs.ceramic.ai/api-reference/search)

공통 글쓰기 원칙과 참고 글 메모는 [글쓰기 가이드](./src/editorial-guide.md)에 적습니다. Main Agent는 목차와 본문을 생성할 때 이 파일과 관리자 화면의 블로그별 작성 설정을 함께 사용합니다.

로컬에서는 저장소 루트에서 `pnpm db:migrate:local`로 기존 D1 마이그레이션을 적용합니다. `pnpm exec wrangler login`으로 프로젝트의 Cloudflare 계정에 로그인하면 `AI` 바인딩이 로컬 개발 중에도 그 계정의 Workers AI에서 모델을 실행합니다. 초안과 블로그 설정은 로컬 D1에 저장됩니다.

`pnpm dev`로 관리자와 블로그를 실행하고, 다른 터미널에서 `pnpm dev:agent`로 Agent Worker를 실행합니다. 관리자에 로그인해 **AI 글쓰기 → 대상 확인 → 이 대상으로 초안 생성 → 초안 편집하기** 순서로 확인합니다. AI 초안은 게시글 목록에서도 찾을 수 있습니다.

배포 환경에서는 관리자 Worker의 `AGENT_SERVICE` 서비스 바인딩으로 호출합니다. 대상 D1과 Agent Worker를 준비한 뒤 관리자 Worker를 배포합니다. 같은 요청 ID로 재시도하면 저장된 초안을 돌려줍니다.

AI 글쓰기에서 초안을 생성하면 SEO 제목·설명, 대표 이미지 1장, 본문 이미지와 각 이미지의 대체 텍스트가 함께 저장됩니다. 본문 이미지는 관련 소제목 아래에 기본 2장, 추가로 설명할 내용이 있으면 최대 3장 배치합니다. 소제목에 본문이 있는 구간이 적으면 그 수만큼 생성합니다. 본문 이미지를 선택한 뒤 도구 모음에서 ‘이미지’를 누르면 주소와 대체 텍스트를 수정하거나 삭제할 수 있습니다. Agent Worker의 `BLOG_MEDIA`는 관리자·공개 Worker와 같은 R2 버킷을 사용합니다.

참고 URL과 검색으로 찾은 HTML 원문에서 대표 이미지, 본문 이미지와 캡션을 수집합니다. 이미지에 연결된 구조화 데이터에 CC0 1.0 또는 크레딧을 포함한 CC BY 4.0이 명시되면, 글과 관련 있는 이미지를 원본 URL과 출처·라이선스 링크로 초안에 배치할 수 있습니다. 그 외 이미지는 편집기에서 원문과 함께 열어본 뒤 본문에 추가할 수 있습니다. 이미지 후보 저장에는 D1 마이그레이션 `0006_post_source_images.sql`이 필요합니다.

모의 응답으로 전체 생성 경로를 테스트하려면 루트에서 `pnpm --filter @cloudflare-ai-blog/agent-service test`를 실행합니다.
