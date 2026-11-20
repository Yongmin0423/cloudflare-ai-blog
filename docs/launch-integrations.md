# 운영 도메인과 검색·분석 연결

## 진행 순서

1. 현재 `workers.dev` 주소에서 글을 여러 편 작성·발행하고 공개 페이지와 사이트맵을 확인한다.
2. GA4 속성과 웹 스트림을 준비한다. 임시 주소에서 측정을 시작했다면 도메인 연결 후 같은 스트림의 웹사이트 URL을 수정하고 새 주소에서 이벤트를 확인한다. [GA4 웹 스트림 수정](https://support.google.com/analytics/answer/9304776)
3. 도메인을 구매해 연결한 뒤 Search Console에 최종 도메인 속성을 인증하고 새 사이트맵을 제출한다. 임시 주소의 검색 상태를 먼저 확인할 필요가 있으면 별도 URL 접두어 속성으로 인증할 수 있다. [Search Console 속성 유형](https://support.google.com/webmasters/answer/34592)

## 공개 주소와 배포

- 현재 공개 주소는 [공개 블로그](https://cloudflare-ai-blog-blog.yym21345.workers.dev), 관리자 주소는 [관리자 로그인](https://cloudflare-ai-blog-admin.yym21345.workers.dev/login)이다. AI Agent는 내부 연결을 사용한다.
- [ ] Cloudflare Registrar에서 도메인 후보의 등록 가능 여부와 등록·갱신 비용을 비교한다. 이 프로젝트에 사용할 공개 주소 한 개를 정한 뒤 구매한다. [도메인 등록](https://developers.cloudflare.com/registrar/get-started/register-domain/)
- [x] 원격 D1에 마이그레이션을 적용하고 블로그 초기 데이터와 운영 관리자 계정을 준비한다. 세 Worker가 같은 D1과 비공개 R2 버킷을 사용하도록 바인딩을 확인한다.
- [x] AI Agent Worker를 먼저 배포한 뒤 `AGENT_SERVICE` 바인딩을 사용하는 관리자 Worker와 공개 Worker를 배포한다. Agent는 서비스 바인딩으로 호출한다. [Worker 서비스 바인딩](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [ ] 공개 Worker에는 대표 도메인, 관리자 Worker에는 `admin.example.com` 같은 서브도메인을 Custom Domain으로 연결한다. `www`도 열 경우 대표 주소로 경로와 쿼리를 유지해 영구 리디렉션한다. [Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [x] 첫 배포에 `workers.dev` 주소로 `PUBLIC_SITE_URL`과 `ADMIN_ORIGIN`을 설정했다. 두 앱은 같은 블로그 ID를 사용하며 관리자의 `AUTH_SECRET`은 Worker 시크릿에 등록했다. 재배포 시 현재 변수 값을 유지하고, 커스텀 도메인 연결 때 두 주소를 갱신한다. [관리자 인증](./admin-auth.md) · [Worker 시크릿](https://developers.cloudflare.com/workers/configuration/secrets/)
- [x] 운영 주소에서 관리자 로그인·인증된 대시보드·로그아웃과 공개 홈·사이트맵·RSS 응답을 확인했다.
- [ ] 운영 관리자에서 초안 저장, AI 생성, QA, 발행을 확인한다. 공개 주소에서 발행 글과 대표·본문 이미지가 열리는지 확인한다. 현재 ChatGPT 구독 연결은 로컬 전용이므로 첫 운영 검증은 Workers AI로 진행한다. [Agent Service 안내](../workers/agent-service/README.md)

## Search Console

- [x] `/sitemap.xml`은 발행 글의 대표 URL을 제공하고 `/robots.txt`는 사이트맵 주소를 안내한다.
- [ ] 운영 주소에서 `/sitemap.xml`과 `/robots.txt`가 열리는지 확인한다. 사이트맵과 발행 글의 canonical이 같은 호스트를 쓰는지, 초안·비공개 글이 빠져 있는지 확인한다.
- [ ] Google Search Console에 도메인 속성을 만들고 Cloudflare DNS에 TXT 레코드를 추가해 소유권을 확인한다. 운영 사이트맵을 제출한 뒤 홈과 발행 글 한 건을 URL 검사로 확인한다. [소유권 확인](https://support.google.com/webmasters/answer/9008080) · [사이트맵 제출](https://support.google.com/webmasters/answer/7451001)

## GA4·Clarity·Meta Pixel

공개 운영 블로그에서만 태그를 실행한다. GA4와 Clarity는 분석, Meta Pixel은 광고 측정으로 설정을 구분한다. 태그를 사용자의 동의 선택에 맞춰 로드하고, 거부·철회 시 해당 이벤트가 전송되지 않는지 확인한다. [Google Consent Mode](https://developers.google.com/tag-platform/security/concepts/consent-mode) · [Clarity Consent Mode](https://learn.microsoft.com/en-us/clarity/setup-and-installation/cookie-consent)

| 서비스            | 필요한 값                          | 연결 확인                                                                       |
| ----------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| GA4               | 웹 데이터 스트림의 측정 ID (`G-…`) | DebugView에서 첫 방문과 글 사이 이동마다 `page_view`가 한 번씩 수집되는지 확인  |
| Microsoft Clarity | 프로젝트 ID                        | 테스트 세션이 수집되고 녹화에 민감한 내용이 노출되지 않는지 확인                |
| Meta Pixel        | Events Manager의 Pixel ID          | Test Events에서 첫 방문과 글 사이 이동마다 `PageView`가 한 번씩 수집되는지 확인 |

- [ ] 운영 도메인에 해당하는 ID를 준비하고 태그 연결과 동의 설정을 구현한다. [GA4 설정](https://support.google.com/analytics/answer/9304153) · [Clarity 설치](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup) · [Meta Events Manager](https://business.facebook.com/events_manager2/)
- [ ] 위 표의 확인 절차를 실행한다. 홈페이지 직접 접속, 글 사이의 화면 이동, 새로고침으로 페이지뷰 중복을 확인한다. 관리자·미리보기 화면에서도 태그가 로드되지 않는지 확인한다. [GA4 단일 페이지 앱 측정](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications)
- [ ] GA4 웹 스트림과 Search Console 속성을 연결해 검색 유입과 방문 이후 행동을 함께 확인한다. [Search Console과 GA4 연결](https://support.google.com/analytics/answer/10737381)
