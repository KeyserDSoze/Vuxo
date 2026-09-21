import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchFrontendBuildInfo, type FrontendBuildInfo } from './buildInfo';

type BuildInfoContextValue = {
  build: FrontendBuildInfo | null;
  loading: boolean;
  error: boolean;
};

const BuildInfoContext = createContext<BuildInfoContextValue | null>(null);

export function BuildInfoProvider({ children }: { children: ReactNode }) {
  const [build, setBuild] = useState<FrontendBuildInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void fetchFrontendBuildInfo(controller.signal)
      .then(value => {
        setBuild(value);
        setError(false);
      })
      .catch(fetchError => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const value = useMemo(() => ({ build, loading, error }), [build, loading, error]);
  return <BuildInfoContext.Provider value={value}>{children}</BuildInfoContext.Provider>;
}

export function useBuildInfo(): BuildInfoContextValue {
  const value = useContext(BuildInfoContext);
  if (!value) throw new Error('useBuildInfo must be used inside BuildInfoProvider');
  return value;
}
