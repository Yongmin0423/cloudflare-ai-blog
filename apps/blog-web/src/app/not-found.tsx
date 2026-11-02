import Link from "next/link";
export default function NotFound() {
  return <main className="not-found"><p className="eyebrow">404 · PAGE NOT FOUND</p><h1>이야기를 찾을 수 없어요.</h1><p>주소가 올바른지 확인하거나 다른 글을 둘러보세요.</p><Link href="/">블로그 홈으로 →</Link></main>;
}
