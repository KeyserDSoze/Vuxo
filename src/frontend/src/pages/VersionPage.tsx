import { Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type BuildInfo = { version: string; commit: string; buildDateUtc: string };

export function VersionPage() {
  const { t } = useTranslation();
  const [build, setBuild] = useState<BuildInfo | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}version.json`).then(r => r.json()).then(setBuild).catch(() => setBuild(null));
  }, []);

  const unknown = t('version.unknown');

  return (
    <Stack spacing={3}>
      <Typography variant="h2" component="h1">{t('version.title')}</Typography>
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Table>
          <TableBody>
            <TableRow><TableCell component="th">{t('version.frontend')}</TableCell><TableCell>{build?.version ?? unknown}</TableCell></TableRow>
            <TableRow><TableCell component="th">{t('version.commit')}</TableCell><TableCell sx={{ fontFamily: 'monospace' }}>{build?.commit ?? unknown}</TableCell></TableRow>
            <TableRow><TableCell component="th">{t('version.buildUtc')}</TableCell><TableCell>{build?.buildDateUtc ?? unknown}</TableCell></TableRow>
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
