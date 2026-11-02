"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const navigation = [
  { href: "/", label: "대시보드", mark: "◫" },
  { href: "/posts", label: "게시글", mark: "≡" },
  { href: "/ai-writing", label: "AI 글쓰기", mark: "✦" },
  { href: "/categories", label: "카테고리", mark: "▦" },
  { href: "/settings", label: "블로그 설정", mark: "⚙" },
];

export function AdminShell({ children, blogUrl }: { children: ReactNode; blogUrl?: string }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const menuOpen = openPath === pathname;
  const current = navigation.find(({ href }) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`),
  );

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <aside className="sidebar">
        <div className="brand-row">
          <Link href="/" className="brand" onClick={() => setOpenPath(null)}>
            <span className="brand-symbol" aria-hidden="true">b.</span>
            <span>Blog Studio<small>나의 블로그 관리 공간</small></span>
          </Link>
          <button className="menu-toggle" type="button" aria-expanded={menuOpen}
            aria-controls="admin-navigation" onClick={() => setOpenPath(menuOpen ? null : pathname)}>
            {menuOpen ? "메뉴 닫기" : "메뉴 열기"}
          </button>
        </div>
        <div id="admin-navigation" className={`sidebar-content${menuOpen ? " is-open" : ""}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpenPath(null);
              document.querySelector<HTMLButtonElement>(".menu-toggle")?.focus();
            }
          }}>
          <p className="nav-label">워크스페이스</p>
          <nav aria-label="관리자 메뉴">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href}
                aria-current={current?.href === item.href ? "page" : undefined}
                onClick={() => setOpenPath(null)}>
                <span className="nav-icon" aria-hidden="true">{item.mark}</span>{item.label}
              </Link>
            ))}
          </nav>
          <div className="sidebar-note">좋은 글을 위한 작은 시작<small>콘텐츠에 집중하는 공간</small></div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <p><span className="breadcrumb">관리자 / </span>{current?.label ?? "관리자"}</p>
          <div className="topbar-actions"><Link href="/login" className="auth-preview-link">인증 연결 전 · 로그인 화면</Link>{blogUrl ? (
            <a className="blog-link" href={blogUrl} target="_blank" rel="noopener noreferrer">
              블로그 보기 <span aria-hidden="true">↗</span><span className="sr-only"> (새 탭)</span>
            </a>
          ) : <span className="domain-pending">블로그 주소 연결 전</span>}</div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>{children}</main>
        <footer className="admin-footer">Blog Studio <span>나만의 이야기를 쌓아가는 곳</span></footer>
      </div>
    </div>
  );
}
