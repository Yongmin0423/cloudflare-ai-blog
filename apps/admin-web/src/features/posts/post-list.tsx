"use client";

import Link from "next/link";
import { useState } from "react";
import { statusLabels, type PostSummary } from "./demo-posts";

const PAGE_SIZE = 5;
type PreviewState = "ready" | "empty" | "loading" | "error";

export function PostList({ posts }: { posts: PostSummary[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<PreviewState>("ready");
  const source = preview === "empty" ? [] : posts;
  const categories = [...new Set(posts.map((post) => post.category))].sort();
  const filtered = source.filter((post) =>
    post.title.toLocaleLowerCase("ko").includes(query.trim().toLocaleLowerCase("ko")) &&
    (status === "all" || post.status === status) &&
    (category === "all" || post.category === category),
  ).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const reset = () => { setQuery(""); setStatus("all"); setCategory("all"); setPage(1); };

  return (
    <>
      <div className="posts-heading">
        <div className="page-heading"><p className="eyebrow">CONTENTS</p><h1>게시글</h1><p>직접 쓴 글과 AI가 만든 초안을 한곳에서 관리하세요.</p></div>
        <Link className="primary-link" href="/posts/new">새 글 작성 <span aria-hidden="true">＋</span></Link>
      </div>
      <div className="demo-notice">
        <p><strong>샘플 데이터 미리보기</strong> · 실제 저장·발행된 글이 아닙니다.</p>
        <label>화면 상태 <select value={preview} onChange={(e) => { setPreview(e.target.value as PreviewState); reset(); }}>
          <option value="ready">목록</option><option value="empty">빈 목록</option><option value="loading">로딩</option><option value="error">오류</option>
        </select></label>
      </div>
      <section className="posts-panel" aria-label="게시글 목록">
        <div className="posts-filters">
          <label className="search-field">제목 검색<input type="search" placeholder="검색할 제목을 입력하세요" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></label>
          <label>상태<select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="all">모든 상태</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>카테고리<select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="all">모든 카테고리</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
          <button className="outline-button" onClick={reset} type="button">초기화</button>
        </div>
        {preview === "loading" ? (
          <div className="list-message" role="status" aria-busy="true"><h2>게시글을 불러오는 중이에요.</h2><p>로딩 화면 예시입니다. 위의 화면 상태에서 목록으로 돌아갈 수 있어요.</p></div>
        ) : preview === "error" ? (
          <div className="list-message" role="alert"><h2>게시글을 불러오지 못했어요.</h2><p>오류 화면 예시입니다. 다시 시도하면 샘플 목록을 표시합니다.</p><button className="outline-button" onClick={() => setPreview("ready")}>다시 시도</button></div>
        ) : (
          <>
            <div className="list-summary"><p role="status">총 <strong>{filtered.length}</strong>개</p><span>최근 수정순 · 한국 시간</span></div>
            {visible.length === 0 ? (
              <div className="list-message"><h2>{source.length === 0 ? "아직 작성한 글이 없어요." : "검색 결과가 없어요."}</h2><p>{source.length === 0 ? "첫 번째 이야기를 직접 쓰거나 AI 글쓰기로 시작해 보세요." : "다른 제목으로 검색하거나 필터를 초기화해 보세요."}</p>
                {source.length === 0 ? <div className="empty-actions"><Link className="outline-button" href="/posts/new">직접 글쓰기</Link><Link className="outline-button" href="/ai-writing">AI 글쓰기</Link></div> : <button className="outline-button" onClick={reset}>검색 조건 초기화</button>}
              </div>
            ) : (
              <>
                <div className="table-scroll" role="region" aria-label="게시글 표, 작은 화면에서는 가로로 스크롤하세요" tabIndex={0}>
                  <table className="posts-table"><caption className="sr-only">게시글 제목, 카테고리, 상태, 작성 방식, 수정일</caption><thead><tr><th scope="col">제목</th><th scope="col">카테고리</th><th scope="col">상태</th><th scope="col">작성 방식</th><th scope="col">수정일</th></tr></thead>
                    <tbody>{visible.map((post) => <tr key={post.id}>
                      <td><Link className="post-title" href={`/posts/${post.id}/edit`}>{post.title}</Link></td><td>{post.category}</td><td><span className={`post-status status-${post.status}`}>{statusLabels[post.status]}</span></td><td>{post.origin === "ai" ? "AI 생성" : "직접 작성"}</td><td><time dateTime={post.updatedAt}>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(post.updatedAt))}</time></td>
                    </tr>)}</tbody>
                  </table>
                </div>
                <nav className="pagination" aria-label="게시글 페이지 이동">
                  <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>이전</button>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((number) => <button key={number} aria-label={`${number}페이지`} aria-current={currentPage === number ? "page" : undefined} onClick={() => setPage(number)}>{number}</button>)}
                  <button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>다음</button>
                </nav>
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
