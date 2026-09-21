import { Alert, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBuildInfo } from '../features/version/BuildInfoProvider';
import { fetchBackendBuildInfo, type BackendBuildInfo } from '../features/version/buildInfo';

export function VersionPage() {
  const { t } = useTranslation();
  const { build: frontendBuild, error: frontendError } = useBuildInfo();
  const [backendBuild, setBackendBuild] = useState<BackendBuildInfo | null>(null);
  const [backendError, setBackendError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setBackendError(false);

    void fetchBackendBuildInfo(controller.signal)
      .then(setBackendBuild)
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setBackendBuild(null);
        setBackendError(true);
      });

    return () => controller.abort();
  }, []);

  const unknown = t('version.unknown');
  const unavailable = t('version.unavailable');

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h2" component="h1">{t('version.title')}</Typography>
        <Typography color="text.secondary">{t('version.description')}</Typography>
      </Stack>

      {frontendError ? <Alert severity="warning">{t('version.frontendUnavailable')}</Alert> : null}
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Typography variant="h6" sx={{ px: 2, pt: 2 }}>{t('version.frontend')}</Typography>
        <Table>
          <TableBody>
            <TableRow><TableCell component="th">{t('version.version')}</TableCell><TableCell data-testid="frontend-version">{frontendBuild?.version ?? unknown}</TableCell></TableRow>
            <TableRow><TableCell component="th">{t('version.commit')}</TableCell><TableCell data-testid="frontend-commit" sx={{ fontFamily: 'monospace' }}>{frontendBuild?.commit ?? unknown}</TableCell></TableRow>
            <TableRow><TableCell component="th">{t('version.buildUtc')}</TableCell><TableCell>{frontendBuild?.buildDateUtc ?? unknown}</TableCell></TableRow>
          </TableBody>
        </Table>
      </Paper>

      {backendError ? (
        <Alert data-testid="backend-version-unavailable" severity="warning">{t('version.backendUnavailable')}</Alert>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Typography variant="h6" sx={{ px: 2, pt: 2 }}>{t('version.backend')}</Typography>
          <Table>
            <TableBody>
              <TableRow><TableCell component="th">{t('version.application')}</TableCell><TableCell>{backendBuild?.application ?? unavailable}</TableCell></TableRow>
              <TableRow><TableCell component="th">{t('version.version')}</TableCell><TableCell data-testid="backend-version">{backendBuild?.version ?? unavailable}</TableCell></TableRow>
              <TableRow><TableCell component="th">{t('version.informationalVersion')}</TableCell><TableCell sx={{ fontFamily: 'monospace' }}>{backendBuild?.informationalVersion ?? unavailable}</TableCell></TableRow>
              <TableRow><TableCell component="th">{t('version.commit')}</TableCell><TableCell sx={{ fontFamily: 'monospace' }}>{backendBuild?.commit ?? unavailable}</TableCell></TableRow>
              <TableRow><TableCell component="th">{t('version.buildUtc')}</TableCell><TableCell>{backendBuild?.buildDateUtc ?? unavailable}</TableCell></TableRow>
              <TableRow><TableCell component="th">{t('version.environment')}</TableCell><TableCell data-testid="backend-environment">{backendBuild?.environment ?? unavailable}</TableCell></TableRow>
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
