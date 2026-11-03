# Shared

`src/management.ts`는 카테고리·블로그 설정의 Zod 입력/응답 계약과 공통 타입입니다. 게시글·에이전트 계약은 후속 단계입니다.

admin-web의 tsconfig source alias로 직접 참조합니다. Windows workspace symlink 제약을 피하며 소스를 복사하지 않습니다. 외부 Zod 의존성은 이 workspace가 선언합니다.

`src/posts.ts`는 게시글·SEO·Tiptap JSON 입력과 목록/상세 응답 계약입니다. `management.ts`에서 함께 내보냅니다.
