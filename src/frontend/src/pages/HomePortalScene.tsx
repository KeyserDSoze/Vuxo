import { Box, Typography } from '@mui/material';

type HomePortalSceneProps = {
  awake: boolean;
  onToggle: () => void;
  toggleLabel: string;
  status: string;
};

/** Original vector landscape and CSS portal: tiny initial bundle, no Phaser/web requests. */
export function HomePortalScene({ awake, onToggle, toggleLabel, status }: HomePortalSceneProps) {
  return (
    <Box className="vuxo-landing__scene" data-testid="home-scene">
      <Box className="vuxo-landing__scene-parallax" aria-hidden="true">
        <svg className="vuxo-landing__landscape" viewBox="0 0 620 610" preserveAspectRatio="xMidYMid slice" focusable="false">
          <defs>
            <linearGradient id="vuxo-mountain-haze" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--landing-horizon)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="var(--landing-land-back)" />
            </linearGradient>
            <linearGradient id="vuxo-water" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--landing-accent)" stopOpacity="0.36" />
              <stop offset="75%" stopColor="var(--landing-land)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--landing-land)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <circle cx="317" cy="245" r="180" fill="var(--landing-accent)" opacity="0.07" />
          <path d="M0 359 75 274 113 311 179 201 254 303 339 234 413 304 479 215 565 316 620 265V610H0Z" fill="url(#vuxo-mountain-haze)" opacity=".66" />
          <path d="M0 438 64 355 128 388 198 315 256 374 317 348 387 415 453 330 525 384 594 335 620 364V610H0Z" fill="var(--landing-land-back)" />
          <path d="M276 419 350 419 431 610H172Z" fill="url(#vuxo-water)" opacity=".9" />
          <path d="M0 505 107 467 166 505 212 482 229 610H0Z M620 510 515 464 447 499 408 482 390 610H620Z" fill="var(--landing-land)" />
          <path d="M0 515 39 438 56 515 M34 532 72 413 96 532 M95 560 126 448 155 560 M480 548 515 419 552 548 M542 545 586 401 620 545" fill="var(--landing-land)" />
          <path d="M0 599Q120 566 205 585T414 585T620 602V610H0Z" fill="var(--landing-land)" />
          <path d="M132 546Q310 523 489 546" stroke="var(--landing-accent)" strokeOpacity=".32" strokeWidth="2" fill="none" />
          <path d="M182 562Q310 550 445 562" stroke="var(--landing-accent)" strokeOpacity=".15" strokeWidth="2" fill="none" />
        </svg>
      </Box>
      <Box className="vuxo-landing__stars" aria-hidden="true">
        {Array.from({ length: 21 }, (_, index) => <span className={`vuxo-landing__star vuxo-landing__star--${index + 1}`} key={index} />)}
      </Box>
      <Box className="vuxo-landing__portal-shadow" aria-hidden="true" />
      <Box
        component="button"
        type="button"
        className="vuxo-landing__portal"
        data-testid="home-portal"
        aria-label={toggleLabel}
        aria-pressed={awake}
        aria-describedby="home-portal-status"
        onClick={onToggle}
      >
        <span className="vuxo-landing__portal-aura" aria-hidden="true" />
        <span className="vuxo-landing__portal-ring vuxo-landing__portal-ring--outer" aria-hidden="true" />
        <span className="vuxo-landing__portal-ring vuxo-landing__portal-ring--inner" aria-hidden="true" />
        <span className="vuxo-landing__portal-void" aria-hidden="true">
          <span className="vuxo-landing__portal-swirl" />
          <span className="vuxo-landing__portal-silhouette" />
        </span>
        <span className="vuxo-landing__portal-glyph vuxo-landing__portal-glyph--north" aria-hidden="true">✧</span>
        <span className="vuxo-landing__portal-glyph vuxo-landing__portal-glyph--west" aria-hidden="true">◇</span>
        <span className="vuxo-landing__portal-glyph vuxo-landing__portal-glyph--east" aria-hidden="true">✦</span>
        <span className="vuxo-landing__portal-glyph vuxo-landing__portal-glyph--south" aria-hidden="true">✧</span>
      </Box>
      <Box className="vuxo-landing__portal-instruction" id="home-portal-status" aria-live="polite">
        <span className="vuxo-landing__portal-instruction-pulse" aria-hidden="true" />
        <Typography component="span" variant="caption">{status}</Typography>
      </Box>
    </Box>
  );
}
