import { Box, Typography, type SvgIconProps } from '@mui/material';
import type { ComponentType, ReactNode } from 'react';

type DeckPageHeaderProps = {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  icon?: ComponentType<SvgIconProps>;
  /** Buttons/links aligned with the title; wrap below it on narrow screens. */
  actions?: ReactNode;
  /** Full-width content under the title, e.g. a sign-in notice. */
  children?: ReactNode;
  testId?: string;
};

/** Shared runic header for deck screens; the title is always the page h1. */
export function DeckPageHeader({ title, eyebrow, description, icon: Icon, actions, children, testId }: DeckPageHeaderProps) {
  return (
    <Box component="header" className="vuxo-page-header" data-testid={testId}>
      {Icon ? <Box className="vuxo-page-header__sigil" aria-hidden="true"><Icon /></Box> : null}
      <Box className="vuxo-page-header__copy">
        {eyebrow ? (
          <Typography component="p" className="vuxo-page-header__eyebrow">
            <Box component="span" className="vuxo-page-header__eyebrow-rune" aria-hidden="true">✦</Box>
            {eyebrow}
          </Typography>
        ) : null}
        <Typography component="h1" className="vuxo-page-header__title">
          {title}
        </Typography>
        {description ? (
          <Typography component="p" className="vuxo-page-header__description" color="text.secondary">{description}</Typography>
        ) : null}
      </Box>
      {actions ? <Box className="vuxo-page-header__actions">{actions}</Box> : null}
      {children ? <Box className="vuxo-page-header__extra">{children}</Box> : null}
    </Box>
  );
}
