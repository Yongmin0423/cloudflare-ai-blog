# 선택적 UI 컴포넌트

기존 관리자 레이아웃과 Tiptap을 유지하고 필요한 컴포넌트만 shadcn/ui에서 가져옵니다.

- 원본: https://ui.shadcn.com/r/styles/new-york/dialog.json
- 원본: https://ui.shadcn.com/r/styles/new-york/alert-dialog.json
- 원본: https://ui.shadcn.com/r/styles/new-york/button.json
- 원본 MIT 라이선스: LICENSE.md
- 수정: 닫기 라벨 한국어, 앱의 utils/button 경로 적용, 기존 CSS와 공존하도록 button 기본 border 리셋 추가
- 스타일: src/app/shadcn.css. 전체 CSS 리셋(preflight)은 사용하지 않습니다.
- 새 컴포넌트 추가 시 기존 화면에 영향을 주는 전역 리셋/테마 변경을 피합니다.
