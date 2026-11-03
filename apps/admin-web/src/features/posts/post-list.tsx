"use client";
import Link from "next/link";
import { useState } from "react";
import { postListResponseSchema,categoriesResponseSchema } from "@cloudflare-ai-blog/shared";
import { useApiResource } from "../management/use-api-resource";
import { statusLabels } from "./demo-posts";
export function PostList() {
  const [query,setQuery]=useState("");const [status,setStatus]=useState("all");const [category,setCategory]=useState("all");const [page,setPage]=useState(1);
  const params=new URLSearchParams({q:query,status,category,page:String(page)});
  const store=useApiResource('/api/admin/posts?'+params,postListResponseSchema);
  const categories=useApiResource('/api/admin/categories',categoriesResponseSchema);
  const data=store.data;const reset=()=>{setQuery("");setStatus("all");setCategory("all");setPage(1);};
  const pageCount=data?Math.max(1,Math.ceil(data.total/data.pageSize)):1;
  return <>
    <div className="posts-heading"><div className="page-heading"><p className="eyebrow">CONTENTS</p><h1>게시글</h1><p>직접 쓴 글과 AI가 만든 초안을 한곳에서 관리하세요.</p></div><Link className="primary-link" href="/posts/new">새 글 작성 ＋</Link></div>
    <div className="demo-notice"><p><strong>로컬 D1 게시글</strong> · 저장한 초안을 조회해요. 공개 블로그·대시보드·AI 작업은 아직 샘플이며 실제 발행은 후속 단계입니다.</p></div>
    <section className="posts-panel" aria-label="게시글 목록">
      <div className="posts-filters"><label className="search-field">제목 검색<input type="search" maxLength={200} placeholder="검색할 제목을 입력하세요" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} /></label>
        <label>상태<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="all">모든 상태</option>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>카테고리<select value={category} onChange={e=>{setCategory(e.target.value);setPage(1);}}><option value="all">모든 카테고리</option><option value="uncategorized">미분류</option>{categories.data?.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button className="outline-button" onClick={reset}>초기화</button><button className="outline-button" disabled={!store.ready} onClick={()=>{store.reload();categories.reload();}}>새로고침</button>
      </div>
      {categories.error&&<p role="alert">{categories.error} <button onClick={categories.reload}>카테고리 다시 불러오기</button></p>}
      {!store.ready?<div className="list-message" role="status">게시글을 불러오는 중이에요.</div>:store.error?<div className="list-message" role="alert"><h2>게시글을 불러오지 못했어요.</h2><p>{store.error}</p><button className="outline-button" onClick={store.reload}>다시 시도</button></div>:data&&<>
        <div className="list-summary"><p role="status">총 <strong>{data.total}</strong>개</p><span>최근 수정순 · 한국 시간</span></div>
        {!data.posts.length?<div className="list-message"><h2>{query||status!=="all"||category!=="all"?"검색 결과가 없어요.":"아직 작성한 글이 없어요."}</h2><p>새 글을 작성하거나 검색 조건을 바꿔 보세요.</p><Link className="outline-button" href="/posts/new">직접 글쓰기</Link></div>:<>
          <div className="table-scroll" role="region" aria-label="게시글 표" tabIndex={0}><table className="posts-table"><caption className="sr-only">제목, 카테고리, 상태, 작성 방식, 수정일</caption><thead><tr><th scope="col">제목</th><th scope="col">카테고리</th><th scope="col">상태</th><th scope="col">작성 방식</th><th scope="col">수정일</th></tr></thead><tbody>{data.posts.map(post=><tr key={post.id}><td><Link className="post-title" href={'/posts/'+post.id+'/edit'}>{post.title}</Link></td><td>{post.category}</td><td><span className={'post-status status-'+post.status}>{statusLabels[post.status]}</span></td><td>{post.origin==='ai'?'AI 생성':'직접 작성'}</td><td><time dateTime={new Date(post.updatedAt).toISOString()}>{new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short'}).format(new Date(post.updatedAt))}</time></td></tr>)}</tbody></table></div>
          <nav className="pagination" aria-label="게시글 페이지 이동"><button disabled={data.page===1} onClick={()=>setPage(data.page-1)}>이전</button><span>{data.page} / {pageCount}</span><button disabled={data.page>=pageCount} onClick={()=>setPage(data.page+1)}>다음</button></nav>
        </>}
      </>}
    </section>
  </>;
}
