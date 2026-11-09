<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 작업 진행 방식

- 새 작업을 시작하기 전에 단계별 체크리스트를 먼저 보여준다.
- 완료 단계는 [x], 미완료 단계는 [ ]로 표시하고 이번 작업 단계를 명시한다.
- docs/todo.md를 실제 구현 상태에 맞춰 갱신한다. UI 완료와 서버 기능 완료를 구분한다.
- 코드를 수정한 뒤에는 변경한 파일에 `pnpm exec prettier --write <파일 경로>`를 실행한다.
