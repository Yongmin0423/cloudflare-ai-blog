import Link from "next/link";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <>
      <div className="page-heading"><p className="eyebrow">MY WORKSPACE</p><h1>{title}</h1><p>{description}</p></div>
      <section className="empty-panel" aria-labelledby="preparing-title">
        <span className="pill">준비 중</span>
        <h2 id="preparing-title">{title} 기능을 준비하고 있어요.</h2>
        <p>관리자 기본 화면을 먼저 구성하고 있습니다.<br />실제 관리 기능은 다음 단계에서 연결할 예정이에요.</p>
        <Link className="secondary-link" href="/">대시보드로 돌아가기 <span aria-hidden="true">→</span></Link>
      </section>
    </>
  );
}
