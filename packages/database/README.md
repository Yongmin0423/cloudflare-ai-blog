# Database

Cloudflare D1 cloudflare-ai-blog를 두 앱의 DB 바인딩으로 연결했습니다.

- [연결·로컬 상태 경로](../../docs/d1-setup.md)
- [테이블 설계 v1](../../docs/database-schema.md)
- migrations/0001_blog_schema.sql: 업무 테이블 7개, 로컬 적용 완료·원격 미적용
- tests/schema.test.mjs: SQLite 제약 테스트
- tests/local-smoke.sql: 로컬 D1 삽입/조회/관계 정리 검증 (예약 검증 ID만 사용)

- src/management.ts: 카테고리·설정 D1 쿼리 (서버 어댑터에서만 호출)
- local-bootstrap.sql: 기존 값을 덮어쓰지 않는 개발 블로그 초기 데이터
- tests/management.test.mjs: 계약·쿼리·동시 수정·블로그 범위·접근 차단 검증

관리자 카테고리·설정은 로컬 D1에 연결했습니다. 게시글 쿼리와 원격 적용은 후속 작업입니다. 인증 전 관리 API는 development localhost만 허용하며 production은 차단합니다.
