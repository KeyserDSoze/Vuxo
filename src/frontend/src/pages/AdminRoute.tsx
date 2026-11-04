import { Alert, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import '../features/admin/adminI18n'
import { useAdminAccessState } from '../features/admin/useAdminAccessState'
import { AdminPage } from './AdminPage'

export function AdminRoute() {
  const { t } = useTranslation()
  const accessState = useAdminAccessState()

  if (accessState === 'administrator') return <AdminPage />

  const errorCode = accessState === 'unauthenticated'
    ? 'admin_authentication_required'
    : 'admin_forbidden'

  return (
    <Stack spacing={3} data-testid="admin-access-denied">
      <Typography variant="h2" component="h1">{t('admin.title')}</Typography>
      <Alert severity={accessState === 'forbidden' ? 'warning' : 'error'}>
        {t(`admin.errors.${errorCode}`)}
      </Alert>
    </Stack>
  )
}
