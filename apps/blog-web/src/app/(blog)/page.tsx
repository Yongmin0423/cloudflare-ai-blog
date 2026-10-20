import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1>Cloudflare AI Blog</h1>
          <p>프로젝트 기본 페이지입니다.</p>
        </div>
      </main>
    </div>
  );
}
