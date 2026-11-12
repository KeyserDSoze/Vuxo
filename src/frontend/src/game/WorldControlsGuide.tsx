import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'

// Decorative keycaps; assistive technology reads full translated guidance.
function Keycaps({ keys }: { keys: readonly string[] }) {
  return (
    <Box className="vuxo-controls-keycaps" aria-hidden="true">
      {keys.map((key, index) => (
        <Box component="kbd" key={key + index} className="vuxo-controls-keycap">{key}</Box>
      ))}
    </Box>
  )
}

function Command({ keys, description }: { keys: readonly string[], description: string }) {
  return (
    <Box className="vuxo-controls-command">
      <Keycaps keys={keys} />
      <Typography component="p" variant="caption" className="vuxo-controls-description">
        {description}
      </Typography>
    </Box>
  )
}

/** Read-only presentation: server game state, movement and grants live elsewhere. */
export function WorldControlsGuide() {
  const { t } = useTranslation()
  return (
    <Box className="vuxo-controls-console" data-testid="world-controls-console">
      <Typography variant="body2" className="vuxo-controls-intro">
        {t('game.help.intro')}
      </Typography>
      <Box className="vuxo-controls-grid">
        <Box component="section" className="vuxo-controls-panel"
          aria-label={t('game.help.movementTitle')} data-testid="world-controls-movement">
          <Typography component="h3" variant="subtitle2" className="vuxo-controls-heading">
            {t('game.help.movementTitle')}
          </Typography>
          <Command keys={['W', 'A', 'S', 'D', '↑', '←', '↓', '→']}
            description={t('game.help.move')} />
          <Command keys={['↑', '←', '↓', '→']} description={t('game.help.touch')} />
        </Box>
        <Box component="section" className="vuxo-controls-panel"
          aria-label={t('game.help.interfaceTitle')} data-testid="world-controls-interface">
          <Typography component="h3" variant="subtitle2" className="vuxo-controls-heading">
            {t('game.help.interfaceTitle')}
          </Typography>
          <Command keys={['F']} description={t('game.help.fullscreen')} />
          <Command keys={['H']} description={t('game.help.hud')} />
          <Command keys={['R']} description={t('game.help.radar')} />
          <Command keys={['?']} description={t('game.help.guideShortcut')} />
        </Box>
        <Box component="section" className="vuxo-controls-panel vuxo-controls-panel--portals"
          aria-label={t('game.help.portalsTitle')} data-testid="world-controls-portals">
          <Typography component="h3" variant="subtitle2" className="vuxo-controls-heading">
            {t('game.help.portalsTitle')}
          </Typography>
          <Command keys={['E', '✦']} description={t('game.help.portals')} />
          <Command keys={['P']} description={t('game.help.portalList')} />
        </Box>
      </Box>
    </Box>
  )
}
