import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostCard } from "@/components/blog/post-card";
import { CategoryNav, Pagination } from "@/components/blog/list-navigation";
import { publishedPosts, readPage, PAGE_SIZE, formatDate } from "@/features/blog/content";

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const page = readPage((await searchParams).page);
  const posts = publishedPosts(); const pages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  if (!page || page > pages) notFound();
  const featured = posts[0];
  return <div className="blog-container">
    {page > 1 && <header className="category-heading"><p className="eyebrow">THE JOURNAL</p><h1>모든 이야기</h1><p>차곡차곡 쌓아온 기록을 이어서 읽어보세요.</p></header>}
    {page === 1 && <>
      <section className="home-intro"><p className="eyebrow">A LITTLE EVERYDAY JOURNAL</p><h1>작은 일상을,<br /><span>오래 남는 이야기로.</span></h1><p>천천히 바라보고, 나의 언어로 남깁니다.<br />일상과 생활, 그리고 글을 쓰는 시간에 관하여.</p><span className="intro-stamp" aria-hidden="true">기록하는<br />마음</span></section>
      {featured && <section className="featured-post" aria-labelledby="featured-title"><Link href={`/posts/${featured.slug}`} className="featured-image" aria-label={`${featured.title} 읽기`}><Image src={featured.cover} alt={featured.coverAlt} width={1200} height={800} priority /></Link><div className="featured-copy"><p className="eyebrow">EDITOR’S PICK · 블로그 운영</p><h2 id="featured-title"><Link href={`/posts/${featured.slug}`}>{featured.title}</Link></h2><p>{featured.excerpt}</p><div className="featured-bottom"><time dateTime={featured.publishedAt}>{formatDate(featured.publishedAt)}</time><Link href={`/posts/${featured.slug}`} className="round-link" aria-label="추천 글 읽기">↗</Link></div></div></section>}
    </>}
    <section className="stories-section" id="stories" aria-labelledby="stories-title"><div className="section-heading"><div><p className="eyebrow">THE LATEST STORIES</p><h2 id="stories-title">차곡차곡 쌓이는 이야기</h2></div><span>총 {posts.length}개의 글</span></div><CategoryNav /><div className="post-grid">{posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((post) => <PostCard key={post.id} post={post} />)}</div><Pagination page={page} pages={pages} base="/" /></section>
    <aside className="journal-note"><span aria-hidden="true">✳</span><div><h2>빠르지 않아도 괜찮은 기록</h2><p>평범한 하루에도 남겨둘 이야기는 있습니다.</p></div><Link href="/category/daily">일상 이야기 둘러보기 →</Link></aside>
  </div>;
}
