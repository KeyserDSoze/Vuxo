import { useEffect, useState } from 'react';

type BuildInfo = { version: string; commit: string; buildDateUtc: string };

export function VersionPage() {
  const [build, setBuild] = useState<BuildInfo | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}version.json`).then(r => r.json()).then(setBuild).catch(() => setBuild(null));
  }, []);

  return (
    <section className="page">
      <h1>Versione</h1>
      <dl>
        <dt>Frontend</dt><dd>{build?.version ?? 'unknown'}</dd>
        <dt>Commit</dt><dd>{build?.commit ?? 'unknown'}</dd>
        <dt>Build UTC</dt><dd>{build?.buildDateUtc ?? 'unknown'}</dd>
      </dl>
    </section>
  );
}
