/**
 * A slow, subtle, GPU-cheap animated backdrop for public-facing entry pages
 * (home, login, register) — never used on the authenticated dashboards,
 * which stay data-dense and still. Pure CSS: three large blurred blobs drift
 * on independent long loops behind the content. `aria-hidden` and
 * `pointer-events-none` keep it fully out of the way of interaction and
 * assistive tech, and it collapses to a static gradient under
 * `prefers-reduced-motion`.
 */
export function AnimatedBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="ambient-blob ambient-blob-a" />
      <div className="ambient-blob ambient-blob-b" />
      <div className="ambient-blob ambient-blob-c" />
      <div className="ambient-grid" />
      <style>{`
        .ambient-blob {
          position: absolute;
          border-radius: 9999px;
          filter: blur(70px);
          opacity: 0.35;
          will-change: transform;
        }
        .ambient-blob-a {
          top: -12%;
          left: -8%;
          width: 42vw;
          height: 42vw;
          max-width: 620px;
          max-height: 620px;
          background: radial-gradient(circle at 30% 30%, #2f66d6, transparent 70%);
          animation: drift-a 26s ease-in-out infinite;
        }
        .ambient-blob-b {
          bottom: -16%;
          right: -10%;
          width: 46vw;
          height: 46vw;
          max-width: 680px;
          max-height: 680px;
          background: radial-gradient(circle at 60% 40%, #0e9488, transparent 70%);
          animation: drift-b 32s ease-in-out infinite;
        }
        .ambient-blob-c {
          top: 30%;
          left: 45%;
          width: 30vw;
          height: 30vw;
          max-width: 460px;
          max-height: 460px;
          background: radial-gradient(circle at 50% 50%, #7c3aed, transparent 70%);
          opacity: 0.22;
          animation: drift-c 38s ease-in-out infinite;
        }
        .ambient-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(to right, rgba(15, 23, 42, 0.035) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(15, 23, 42, 0.035) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 20%, black 40%, transparent 90%);
        }
        @keyframes drift-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(6%, 8%) scale(1.08); }
        }
        @keyframes drift-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-7%, -6%) scale(1.1); }
        }
        @keyframes drift-c {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-46%, -54%) scale(1.15); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ambient-blob { animation: none !important; }
        }
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) .ambient-blob { opacity: 0.28; }
        }
        :root[data-theme="dark"] .ambient-blob { opacity: 0.28; }
      `}</style>
    </div>
  );
}
