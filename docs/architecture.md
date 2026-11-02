# 구조와 경계

관리자 화면과 개발 순서는 [화면 기획](./admin-screen-plan.md)과 [개발 TODO](./todo.md)를 기준으로 합니다.

- apps/admin-web: 관리자 전용 Next.js 앱. 글 작성·설정·AI 작업 UI와 관리자 인증을 구현합니다.
- apps/blog-web: 공개 블로그 전용 Next.js 앱. 공개된 콘텐츠 조회와 SEO를 구현합니다.
- 두 앱은 layout.tsx, globals.css, next.config.ts, open-next.config.ts, wrangler.jsonc를 독립적으로 가집니다.
- 두 앱은 서로의 src를 직접 가져오지 않습니다. 공통 기능은 실제 필요할 때 packages로 추출합니다.
- packages/shared: 공통 타입과 Zod 계약. DB 비밀값이나 서버 구현은 넣지 않습니다.
- packages/database: D1 스키마·마이그레이션·쿼리. 서버 전용으로 사용합니다.
- workers/agent-service: Agents SDK·Durable Objects·Workflows를 담당할 별도 Worker입니다.

관리자 앱은 admin.example.com, 공개 블로그는 example.com에 연결하는 것을 목표로 하되 실제 도메인은 아직 연결하지 않았습니다.
관리자 기능은 주소 구분만으로 보호하지 않고 서버 인증을 적용합니다.
여러 블로그가 생겨도 blog-web 앱 하나에서 도메인별 blogId를 확인하는 방향입니다.

로컬 개발 포트는 blog 3000 / admin 3001, Workers는 blog 8787 / admin 8788로 분리합니다.
Worker 이름과 WORKER_SELF_REFERENCE도 각각 달라 앱 간 자기 참조가 섞이지 않습니다.
