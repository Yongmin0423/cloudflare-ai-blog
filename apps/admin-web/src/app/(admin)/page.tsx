import Link from "next/link";

export default function AdminHome() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">MY WORKSPACE</p>
        <h1>대시보드</h1>
        <p>글을 쓰고, 정리하고, 독자와 만날 준비를 해보세요.</p>
      </div>
      <section className="welcome-panel" aria-labelledby="welcome-title">
        <div>
          <span className="pill">여기서 시작하세요</span>
          <h2 id="welcome-title">당신의 다음 이야기를<br />담을 공간이에요.</h2>
          <p>게시글부터 카테고리까지.<br />블로그에 필요한 것들을 한곳에서 관리하세요.</p>
          <div className="writing-actions">
            <Link className="primary-link" href="/posts/new">직접 글쓰기 <span aria-hidden="true">→</span></Link>
            <Link className="secondary-link" href="/ai-writing">AI 글쓰기 <span aria-hidden="true">✦</span></Link>
          </div>
        </div>
        <div className="editorial-art" aria-hidden="true">
          <div className="art-paper"><span>YOUR NEXT STORY</span><i /><i /><i /><b>새로운 생각,<br />새로운 이야기.</b><div className="art-circle" /></div>
        </div>
      </section>
      <section className="quick-section" aria-labelledby="quick-title">
        <h2 id="quick-title">블로그 관리</h2>
        <div className="quick-grid">
          <Link className="quick-card" href="/posts"><span className="card-number">01</span><h3>게시글</h3><p>글을 작성하고 발행 상태를 관리해요.</p><span className="card-arrow" aria-hidden="true">↗</span></Link>
          <Link className="quick-card" href="/categories"><span className="card-number">02</span><h3>카테고리</h3><p>글의 주제를 나누고 보기 좋게 정리해요.</p><span className="card-arrow" aria-hidden="true">↗</span></Link>
          <Link className="quick-card" href="/settings"><span className="card-number">03</span><h3>블로그 설정</h3><p>블로그의 이름과 소개를 관리해요.</p><span className="card-arrow" aria-hidden="true">↗</span></Link>
        </div>
      </section>
      <p className="setup-note">현재는 화면 구성 단계입니다. 게시글 작성과 저장 기능은 순서대로 연결할 예정이에요.</p>
    </>
  );
}
