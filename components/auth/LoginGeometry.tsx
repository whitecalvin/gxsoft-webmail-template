import styles from "./LoginGeometry.module.css";

/** Decorative CSS-only motion: identical markup on server and client. */
export function LoginGeometry() {
  return (
    <div aria-hidden="true" className={styles.background}>
      <div className={styles.grid} />
      <span className={styles.orbit} />
      <span className={styles.innerOrbit} />
      <span className={styles.square} />
      <span className={styles.diamond} />
      <svg className={styles.triangle} viewBox="0 0 160 140" fill="none">
        <path d="M80 8 152 132H8Z" stroke="currentColor" strokeWidth="1" />
        <path d="M80 38 126 117H34Z" stroke="currentColor" strokeWidth="1" />
      </svg>
    </div>
  );
}
