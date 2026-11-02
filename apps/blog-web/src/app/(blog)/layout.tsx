import Link from "next/link";
import type { ReactNode } from "react";
import { blog, categories } from "@/features/blog/content";

export default function BlogLayout({ children }: { children: ReactNode }) {
  return <>
    <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
    <div className="sample-bar">샘플 블로그 · 관리자 데이터 연결 전 미리보기</div>
    <header className="blog-header"><div className="header-inner"><Link href="/" className="blog-brand"><span className="brand-leaf" aria-hidden="true">✳</span>{blog.name}</Link><nav aria-label="주요 메뉴"><Link href="/">홈</Link>{categories.slice(0, 3).map((category) => <Link key={category.id} href={`/category/${category.slug}`}>{category.name}</Link>)}</nav><span className="header-note">하루의 조각을 모으는 곳</span></div></header>
    <main id="main-content" tabIndex={-1}>{children}</main>
    <footer className="blog-footer"><div><Link href="/" className="blog-brand">{blog.name}</Link><p>{blog.description}</p></div><div className="footer-links"><Link href="/">전체 글</Link>{categories.map((category) => <Link key={category.id} href={`/category/${category.slug}`}>{category.name}</Link>)}</div><small>© {blog.name} · 오늘의 작은 기록을 내일의 이야기로.</small></footer>
  </>;
}
