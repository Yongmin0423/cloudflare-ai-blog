import Link from "next/link";
import { categories } from "@/features/blog/content";
export function CategoryNav({ current }: { current?: string }) {
  return <nav className="category-nav" aria-label="글 카테고리"><Link href="/#stories" aria-current={!current ? "page" : undefined}>전체 글</Link>{categories.map((item) => <Link key={item.id} href={`/category/${item.slug}`} aria-current={current === item.id ? "page" : undefined}>{item.name}</Link>)}</nav>;
}
export function Pagination({ page, pages, base }: { page: number; pages: number; base: string }) {
  if (pages <= 1) return null;
  const href = (value: number) => `${base}${value === 1 ? "" : `?page=${value}`}#stories`;
  return <nav className="blog-pagination" aria-label="글 목록 페이지"><span>{page > 1 ? <Link href={href(page - 1)}>← 이전</Link> : <span aria-disabled="true">← 이전</span>}</span><div>{Array.from({ length: pages }, (_, i) => i + 1).map((number) => <Link key={number} href={href(number)} aria-label={`${number}페이지`} aria-current={page === number ? "page" : undefined}>{number}</Link>)}</div><span>{page < pages ? <Link href={href(page + 1)}>다음 →</Link> : <span aria-disabled="true">다음 →</span>}</span></nav>;
}
