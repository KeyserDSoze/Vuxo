import { Alert, Button, Snackbar } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBuildInfo } from './BuildInfoProvider';
import { fetchFrontendBuildInfo, isSameFrontendBuild, type FrontendBuildInfo } from './buildInfo';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function BuildUpdateNotifier() {
  const { t } = useTranslation();
  const { build } = useBuildInfo();
  const [availableBuild, setAvailableBuild] = useState<FrontendBuildInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!build) return;

    let disposed = false;
    let checking = false;

    const checkForUpdate = async () => {
      if (checking) return;
      checking = true;
      try {
        const latest = await fetchFrontendBuildInfo();
        if (!disposed && !isSameFrontendBuild(build, latest)) {
          setAvailableBuild(latest);
          setOpen(true);
        }
      } catch {
        // Update checks are best-effort and must never interrupt gameplay.
      } finally {
        checking = false;
      }
    };

    const onFocus = () => void checkForUpdate();
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [build]);

  return (
    <Snackbar open={open && availableBuild !== null} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert
        data-testid="build-update-notice"
        severity="info"
        onClose={() => setOpen(false)}
        action={(
          <Button color="inherit" size="small" onClick={() => window.location.reload()}>
            {t('version.update.reload')}
          </Button>
        )}
      >
        {t('version.update.available', { version: availableBuild?.version ?? '' })}
      </Alert>
    </Snackbar>
  );
}
