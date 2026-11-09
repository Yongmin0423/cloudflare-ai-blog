import Link from "next/link";
import type { PublicCategory } from "@cloudflare-ai-blog/database/public-blog";
import { categoryPath } from "@/features/blog/content";

export function CategoryNav({
  categories,
  current,
}: {
  categories: PublicCategory[];
  current?: string;
}) {
  return (
    <nav className="category-nav" aria-label="글 카테고리">
      <Link
        href="/#stories"
        prefetch={false}
        aria-current={!current ? "page" : undefined}
      >
        전체 글
      </Link>
      {categories.map((item) => (
        <Link
          key={item.id}
          href={categoryPath(item.slug)}
          prefetch={false}
          aria-current={current === item.id ? "page" : undefined}
        >
          {item.name}
        </Link>
      ))}
    </nav>
  );
}

export function Pagination({
  page,
  pages,
  base,
}: {
  page: number;
  pages: number;
  base: string;
}) {
  if (pages <= 1) return null;
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const numbers = Array.from(
    { length: Math.min(5, pages) },
    (_, index) => start + index,
  );
  const href = (value: number) =>
    `${base}${value === 1 ? "" : `?page=${value}`}#stories`;
  return (
    <nav className="blog-pagination" aria-label="글 목록 페이지">
      <span>
        {page > 1 ? (
          <Link href={href(page - 1)} prefetch={false}>
            ← 이전
          </Link>
        ) : (
          <span aria-disabled="true">← 이전</span>
        )}
      </span>
      <div>
        {numbers.map((number) => (
          <Link
            key={number}
            href={href(number)}
            prefetch={false}
            aria-label={`${number}페이지`}
            aria-current={page === number ? "page" : undefined}
          >
            {number}
          </Link>
        ))}
      </div>
      <span>
        {page < pages ? (
          <Link href={href(page + 1)} prefetch={false}>
            다음 →
          </Link>
        ) : (
          <span aria-disabled="true">다음 →</span>
        )}
      </span>
    </nav>
  );
}
