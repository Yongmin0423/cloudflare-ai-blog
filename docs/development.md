# 개발 기록

현재 개발 순서는 [개발 TODO](./todo.md)를 따릅니다. 아래 날짜별 다음 작업은 당시의 기록입니다.

## 2026-11-02 — 관리자 화면 구성 확정

- 작업 브랜치: feat/admin-screen-plan
- 이전 미커밋 관리자 레이아웃 작업을 유지한 상태에서 진행
- 대시보드·게시글·AI 글쓰기·카테고리·블로그 설정으로 메뉴 확정
- AI 글쓰기와 직접 글쓰기 준비 화면 및 대시보드 진입점 추가
- 화면별 기능·완료 기준과 후속 개발 TODO 문서화
- 실제 편집·저장·AI 생성 기능은 후속 단계에서 구현


## 2026-10-20 — 초기 환경 점검 및 폴더 구조

프로젝트 위치: C:\Users\yym21\Desktop\cloudflare-ai-blog

### 완료

- npm 잠금 파일을 pnpm으로 가져와 pnpm-lock.yaml 생성, package-lock.json 제거
- pnpm 10.8.0 고정, Windows 설치를 위한 hoisted 방식 적용
- Next.js 16.4.2, OpenNext 1.20.12, Wrangler 4.151.2 유지
- 앱과 설정을 apps/web으로 이동, pnpm 워크스페이스 구성
- 공개 홈을 (blog) 라우트 그룹으로 이동
- (admin)/admin, components, features, lib, types 디렉터리 준비
- Workers와 공통 패키지의 역할 문서 작성
- Windows 파일 출력에서 EPERM 재현. UV_THREADPOOL_SIZE=1로 빌드 성공 후 공통 도구 실행 스크립트에 적용

### 검증

- pnpm install --frozen-lockfile 성공
- pnpm typecheck 성공
- pnpm lint 성공
- pnpm build:worker 성공
- pnpm preview:worker 실행 후 홈 HTTP 200 및 제목 확인
- 없는 주소 HTTP 404 확인
- pnpm cf-typegen 성공

### 다음

1. 관리자·블로그 공통 레이아웃과 UI 구성
2. 관리자 인증 방식 확정 및 구현
3. D1·R2 연결과 데이터 모델 구현
4. 게시글 목록과 Tiptap 편집 화면 구현

인증 이전에 관리자용 데이터 API를 공개하지 않습니다.
GitHub 연결과 원격 배포, CI/CD는 아직 실행하지 않았습니다.

## 2026-10-20 — 관리자·공개 앱 분리 및 초기 커밋 준비

- apps/web을 apps/blog-web으로 이동하고 apps/admin-web을 별도 앱으로 구성
- 각 앱의 레이아웃·스타일·Next.js/OpenNext/Wrangler 설정과 Worker 이름 분리
- 개발 포트 blog 3000 / admin 3001, Workers 포트 blog 8787 / admin 8788
- 두 앱의 타입 생성·타입 검사·린트·Workers 빌드 성공
- 두 Worker 동시 실행에서 각각 HTTP 200과 서로 다른 제목 확인
- 관리자 기본 페이지의 noindex 출력 확인
- 기본 개발 포트 3000은 다른 프로세스가 사용 중이어서, 개발 서버는 3010/3011로 각각 실행해 HTTP 200 확인
- root layout의 children은 ReactNode를 명시해 생성 전 LayoutProps 타입에 대한 편집기 의존성 제거
- origin: https://github.com/Yongmin0423/cloudflare-ai-blog.git
- GitHub push와 Cloudflare 원격 배포는 수행하지 않음

다음 작업은 앱별 실제 레이아웃 디자인과 관리자 인증 방식 결정입니다.

## 2026-11-02 — 게시글 목록 UI

- 샘플 12개, 제목 검색·상태/카테고리 필터·최근 수정순·5개씩 페이지 이동
- 샘플 데이터임을 명시하고 빈 목록·로딩·오류 UI 전환 제공
- 새 글 작성과 글별 수정 준비 화면 연결, 존재하지 않는 샘플 ID는 404
- 타입 검사·린트 통과. 브라우저에서 검색 후 페이지 초기화, 필터 결합, 검색 결과 없음, 조건 초기화, 오류 재시도, 선택한 글 수정 경로 확인
- 실제 저장·발행·편집 기능은 아직 미구현

## 2026-11-02 — Tiptap 작성·수정 UI

- 이전 1~2단계와 레이아웃을 9370019 커밋으로 저장
- Tiptap 3 무료 StarterKit과 Image 확장, H2/H3·서식·목록·인용·링크·이미지·실행 취소/다시 실행
- JSON 본문과 같은 확장을 사용하는 읽기 전용 미리보기
- 제목·슬러그·카테고리·대표 이미지 URL/alt·SEO 제목/설명 입력
- localStorage 임시 저장과 명시적 복원. 새 글 슬롯 1개, 샘플 수정은 ID별 저장. 샘플 목록에 반영되지 않음
- 입력 검증, 손상된 저장본 감지, 저장 실패 안내, 내부 링크 이동 및 새로고침/닫기 이탈 경고
- 브라우저의 같은 문서 뒤로/앞으로 이동은 현재 이탈 경고 범위 밖. 실제 서버 저장 연결 전 내비게이션 보호 보완 필요
- 파일 업로드·중복 슬러그 서버 검사·실제 발행은 후속 단계. 발행 버튼 비활성화
- 모델 테스트: node --experimental-strip-types --test apps/admin-web/src/features/posts/editor-model.test.mjs (5개 통과)
- 타입 검사·린트·frozen lockfile 설치 통과
- 브라우저에서 필수값 오류, 제목/본문 입력, H2, 저장 후 새로고침·복원, 미리보기, 이미지 URL 거부, 미저장 링크 이동 취소 확인
- 브라우저에 '편집기 확인용 초안' 테스트 저장본 1개 생성

## 2026-11-02 — 카테고리·블로그 설정 UI

- 3단계 편집기를 07ec7c9 커밋으로 저장한 뒤 4단계 작업 진행
- shadcn/ui 공식 new-york 레지스트리의 Dialog·Alert Dialog·Button만 수동 도입. components/ui/LICENSE.md에 원본 MIT 라이선스 보관
- Tailwind는 도입한 컴포넌트의 유틸리티 스타일에 사용하며 preflight를 제외해 기존 화면과 Tiptap 스타일 유지
- 카테고리 이름·슬러그·설명·순서 편집, 중복·입력 검증, 샘플 글 수 표시, 소속 글 있는 분류 삭제 차단
- 추가·수정 Dialog와 삭제 Alert Dialog, 닫힌 뒤 제목으로 포커스 복귀
- 설정: 블로그 이름·소개·언어·공개 주소(읽기 전용), AI 주제·독자·말투·규칙·피해야 할 표현
- localStorage 저장/새로고침 복원. 손상된 저장본 또는 접근 실패 시 변경 차단, 저장 실패 시 입력 유지
- 현재 카테고리는 편집기/목록과 독립된 UI 데이터. 설정은 공개 사이트/AI에 아직 미반영. 연결은 D1 및 AI 단계에서 진행
- 모델 테스트 3개, 타입 검사, 린트, 프로덕션 빌드, frozen-lockfile 설치 통과
- 브라우저: 중복 차단, 추가·수정·순서·삭제 취소/확인, 새로고침 복원, 필수 이름 검사, 설정 저장/복원 확인
- 모바일 설정 폼은 가로 넘침 없음. 테스트 분류 삭제 및 테스트 주제 입력 정리 완료
- 기존 alert/confirm·레이아웃은 변경하지 않음. 앞으로 필요한 shadcn 컴포넌트만 선택적으로 사용

## 2026-11-02 — 편집기 모달 통일

- 본문 미리보기의 native dialog를 shadcn Dialog로 변경
- 내부 링크 이동·저장본 덮어쓰기의 window.confirm을 shadcn Alert Dialog로 변경
- 취소 시 편집 내용 유지, 확인 시에만 이동/복원, 닫힌 뒤 호출한 컨트롤로 포커스 복귀
- 새로고침/창 닫기는 브라우저 beforeunload 경고 유지. 같은 문서 뒤로/앞으로 이동 보호는 기존 보완 항목 유지
- 타입 검사·린트 통과. 브라우저에서 미리보기 열기/닫기, 이동 취소/승인, 저장본 덮어쓰기 취소/승인 확인

닫기 X 버튼 보완: preflight 미사용으로 남아 있던 브라우저 기본 테두리·배경·여백을 닫기 버튼에 한정해 제거하고, 28px 클릭 영역과 16px 아이콘을 중앙 정렬했습니다. 브라우저에서 border 0px·투명 배경 및 닫기 동작을 확인했고 해당 컴포넌트 린트를 통과했습니다.
