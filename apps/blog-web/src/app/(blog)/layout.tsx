import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { categoryPath, RSS_PATH } from "@/features/blog/content";
import {
  getCategories,
  getPublicBlog,
  getPublicSiteOrigin,
} from "@/lib/public-blog";

export async function generateMetadata(): Promise<Metadata> {
  const blog = await getPublicBlog();
  if (!blog) notFound();
  const origin = await getPublicSiteOrigin(blog.domain);
  return {
    title: { default: blog.name, template: `%s | ${blog.name}` },
    description: blog.description || undefined,
    alternates: origin
      ? { types: { "application/rss+xml": new URL(RSS_PATH, origin).href } }
      : undefined,
  };
}

export default async function BlogLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [blog, categories] = await Promise.all([
    getPublicBlog(),
    getCategories(),
  ]);
  if (!blog) notFound();

  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <header className="blog-header">
        <div className="header-inner">
          <Link href="/" prefetch={false} className="blog-brand">
            <span className="brand-leaf" aria-hidden="true">
              ✳
            </span>
            {blog.name}
          </Link>
          <nav aria-label="주요 메뉴">
            <Link href="/" prefetch={false}>
              홈
            </Link>
            {categories.slice(0, 3).map((category) => (
              <Link
                key={category.id}
                href={categoryPath(category.slug)}
                prefetch={false}
              >
                {category.name}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="blog-footer">
        <div>
          <Link href="/" prefetch={false} className="blog-brand">
            {blog.name}
          </Link>
          {blog.description && <p>{blog.description}</p>}
        </div>
        <div className="footer-links">
          <Link href="/" prefetch={false}>
            전체 글
          </Link>
          {categories.map((category) => (
            <Link
              key={category.id}
              href={categoryPath(category.slug)}
              prefetch={false}
            >
              {category.name}
            </Link>
          ))}
        </div>
        <small>© {blog.name}</small>
      </footer>
    </>
  );
}
