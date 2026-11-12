import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
});

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 720], [1920, 1080]] as const) {
  test(`the world fills the visible viewport at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('./#/game');
    const canvas = page.getByTestId('game-canvas').locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByTestId('game-fullscreen-toggle')).toBeVisible();

    await expect.poll(async () => page.evaluate(() => {
      const surface = document.querySelector('[data-testid="game-canvas"]');
      const canvas = surface?.querySelector('canvas');
      if (!surface || !canvas) return false;
      const surfaceRect = surface.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const pageHeight = document.documentElement.scrollHeight;
      return surfaceRect.width > 0 && surfaceRect.height > 0 &&
        Math.abs(surfaceRect.width - canvasRect.width) <= 2 &&
        Math.abs(surfaceRect.height - canvasRect.height) <= 2 &&
        pageHeight <= window.innerHeight + 1 &&
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
    })).toBe(true);

    if (width < 900) await expect(page.getByTestId('touch-controls')).toBeVisible();
  });
}

// The visible Phaser canvas is not natively focusable. After navigating HUD
// controls with a keyboard, a click back into the world must explicitly
// restore keyboard ownership without producing document scroll.
for (const [width, height] of [[390, 844], [1280, 720]] as const) {
  test('world restores focus from HUD to canvas at ' + width + 'x' + height,
    async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.goto('./#/game');
      const world = page.getByTestId('game-canvas');
      await expect(world.locator('canvas')).toBeVisible();
      await expect(world).toHaveAttribute('tabindex', '0');
      await expect(world).toHaveAttribute('role', 'region');
      await expect(world).toHaveAttribute('aria-label', /.+/);

      const fullscreen = page.getByTestId('game-fullscreen-toggle');
      await fullscreen.focus();
      await expect(fullscreen).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(fullscreen).toBeFocused();

      const refuge = page.getByTestId('game-refuge-link');
      await refuge.focus();
      await expect(refuge).toBeFocused();
      await page.keyboard.press('d');
      await expect(refuge).toBeFocused();

      await world.locator('canvas').click();
      await expect(world).toBeFocused();
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
        && document.documentElement.scrollHeight <= innerHeight + 1
        && document.scrollingElement!.scrollTop === 0,
      )).toBe(true);
      await info.attach('world-hud-to-canvas-focus-' + width, {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      });
    });
}


for (const [width, height] of [[320, 568], [390, 844], [1280, 720]] as const) {
  test('world HUD folds while preserving connection and world at ' + width + 'x' + height,
    async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.goto('./#/game');
      const hud = page.getByTestId('world-hud');
      const details = page.getByTestId('world-hud-details');
      const toggle = page.getByTestId('world-hud-toggle');
      const canvas = page.getByTestId('game-canvas').locator('canvas');
      await expect(canvas).toBeVisible();
      await expect(hud).toHaveAttribute('data-expanded', 'true');
      await expect(toggle).toHaveAttribute('aria-controls', 'world-hud-details');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(toggle).toHaveAttribute('aria-label', 'Comprimi informazioni del mondo');
      await expect(details).toBeVisible();
      await expect(page.getByTestId('world-connection-status')).toBeVisible();
      await expect(hud).toContainText(/Giocatori online: \d+/);
      const expandedHeight = await hud.evaluate(element => element.getBoundingClientRect().height);
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toHaveAttribute('aria-label', 'Espandi informazioni del mondo');
      await expect(details).toBeHidden();
      await expect(page.getByTestId('world-connection-status')).toBeVisible();
      await expect(hud).toContainText(/Giocatori online: \d+/);
      await expect(canvas).toBeVisible();
      await expect(page.getByTestId('game-fullscreen-toggle')).toBeVisible();
      const collapsedHeight = await hud.evaluate(element => element.getBoundingClientRect().height);
      expect(collapsedHeight).toBeLessThan(expandedHeight);
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.scrollHeight <= innerHeight + 1
        && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      )).toBe(true);
      if (width === 390 || width === 1280) {
        await info.attach('world-hud-collapsed-' + width, {
          body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
        });
      }
      await toggle.focus();
      await expect(toggle).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(details).toBeVisible();
      await expect(page.getByTestId('world-connection-status')).toBeVisible();
      if (width === 390) {
        await toggle.click();
        await page.getByTestId('language-toggle').click();
        await expect(toggle).toHaveAttribute('aria-label', 'Expand world HUD');
        await expect(hud).toContainText(/Players online: \d+/);
        await page.getByTestId('theme-toggle').click();
        await page.getByTestId('theme-toggle').click();
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-label', 'Collapse world HUD');
        await expect(details).toBeVisible();
      }
      if (width === 390 || width === 1280) {
        await info.attach('world-hud-expanded-' + width, {
          body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
        });
      }
    });
}


for (const [width, height] of [[390, 844], [1280, 720]] as const) {
  test('H folds world HUD only from non-interactive world focus at ' + width + 'x' + height,
    async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.goto('./#/game');
      const world = page.getByTestId('game-canvas');
      const hud = page.getByTestId('world-hud');
      const details = page.getByTestId('world-hud-details');
      const toggle = page.getByTestId('world-hud-toggle');
      await expect(world.locator('canvas')).toBeVisible();
      await expect(hud).toHaveAttribute('data-expanded', 'true');
      await expect(toggle).toHaveAttribute('title', 'Tasto H: comprimi o espandi HUD');

      await world.locator('canvas').click();
      await expect(world).toBeFocused();
      await page.keyboard.press('h');
      await expect(hud).toHaveAttribute('data-expanded', 'false');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(details).toBeHidden();
      await expect(page.getByTestId('world-connection-status')).toBeVisible();
      await expect(hud).toContainText(/Giocatori online: \d+/);
      await expect(page.getByTestId('game-fullscreen-toggle')).toBeVisible();
      if (width === 390) {
        await info.attach('world-hud-keyboard-H-folded-390', {
          body: await page.screenshot({ animations: 'disabled' }),
          contentType: 'image/png',
        });
      }
      await page.keyboard.press('Shift+h');
      await expect(hud).toHaveAttribute('data-expanded', 'false');

      // Modified/repeated/composing shortcuts preserve the existing state
      // without stealing native browser events.
      const ignored = await world.evaluate(element =>
        [
          { ctrlKey: true }, { metaKey: true }, { altKey: true },
          { repeat: true }, { isComposing: true },
        ].map(modifiers => {
          const event = new KeyboardEvent('keydown', {
            key: 'h', code: 'KeyH', ...modifiers,
            bubbles: true, cancelable: true,
          });
          element.dispatchEvent(event);
          return event.defaultPrevented;
        }),
      );
      expect(ignored).toEqual([false, false, false, false, false]);
      await expect(hud).toHaveAttribute('data-expanded', 'false');

      await toggle.focus();
      await expect(toggle).toBeFocused();
      await page.keyboard.press('h');
      await expect(hud).toHaveAttribute('data-expanded', 'false');
      const refuge = page.getByTestId('game-refuge-link');
      await refuge.focus();
      await page.keyboard.press('h');
      await expect(hud).toHaveAttribute('data-expanded', 'false');

      await world.locator('canvas').click();
      await expect(world).toBeFocused();
      await page.keyboard.press('h');
      await expect(hud).toHaveAttribute('data-expanded', 'true');
      await expect(details).toBeVisible();

      await page.getByTestId('language-toggle').click();
      await expect(toggle).toHaveAttribute('title', 'Press H to collapse or expand the HUD');
      await expect(toggle).toHaveAttribute('aria-label', 'Collapse world HUD');
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 &&
        document.documentElement.scrollHeight <= innerHeight + 1 &&
        document.scrollingElement!.scrollTop === 0,
      )).toBe(true);
    });
}

test('resizing the browser reveals a different amount of world without a 16:9 letterbox', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./#/game');
  const host = page.getByTestId('game-canvas');
  const canvas = host.locator('canvas');
  await expect(canvas).toBeVisible();

  await page.setViewportSize({ width: 900, height: 1000 });
  await expect.poll(async () => page.evaluate(() => {
    const host = document.querySelector('[data-testid="game-canvas"]')!;
    const canvas = host.querySelector('canvas')!;
    return Math.abs(canvas.getBoundingClientRect().height - host.getBoundingClientRect().height) <= 2 &&
      Math.abs(canvas.getBoundingClientRect().width - host.getBoundingClientRect().width) <= 2 &&
      canvas.height > canvas.width;
  })).toBe(true);
});

test('fullscreen button and F shortcut request browser fullscreen without hiding the HUD', async ({ page }) => {
  await page.goto('./#/game');
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();

  await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="game-shell"]') as HTMLElement;
    Object.defineProperty(shell, 'requestFullscreen', {
      configurable: true,
      value: () => {
        document.body.dataset.fullscreenRequestCount = String(Number(document.body.dataset.fullscreenRequestCount ?? 0) + 1);
        return Promise.resolve();
      },
    });
  });

  await page.getByTestId('game-fullscreen-toggle').click();
  await expect.poll(() => page.evaluate(() => Number(document.body.dataset.fullscreenRequestCount ?? 0))).toBe(1);
  // F belongs to the world, not to the button that just received click focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => Number(document.body.dataset.fullscreenRequestCount ?? 0))).toBe(2);
  await expect(page.getByTestId('world-connection-status')).toBeVisible();
});

test('fullscreen denial reports an actionable localized warning', async ({ page }) => {
  await page.goto('./#/game');
  await expect(page.getByTestId('game-fullscreen-toggle')).toBeVisible();

  await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="game-shell"]') as HTMLElement;
    Object.defineProperty(shell, 'requestFullscreen', {
      configurable: true,
      value: () => Promise.reject(new Error('Browser denied fullscreen')),
    });
  });

  await page.getByTestId('game-fullscreen-toggle').click();
  await expect(page.getByTestId('game-fullscreen-error')).toContainText('Schermo intero non disponibile');
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('game-fullscreen-error')).toContainText('Fullscreen is unavailable');
});

test('world fullscreen F ignores interactive HUD focus, text entry and modified shortcuts', async ({ page }) => {
  await page.goto('./#/game');
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();

  await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="game-shell"]') as HTMLElement;
    Object.defineProperty(shell, 'requestFullscreen', {
      configurable: true,
      value: () => {
        document.body.dataset.fullscreenRequestCount = String(Number(document.body.dataset.fullscreenRequestCount ?? 0) + 1);
        return Promise.resolve();
      },
    });
  });

  const fullscreenButton = page.getByTestId('game-fullscreen-toggle');
  await fullscreenButton.focus();
  await expect(fullscreenButton).toBeFocused();
  await page.keyboard.press('f');

  const refugeLink = page.getByTestId('game-refuge-link');
  await refugeLink.focus();
  await expect(refugeLink).toBeFocused();
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/game');

  const editorValue = await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'fullscreen-keyboard-focus-probe';
    input.setAttribute('aria-label', 'Keyboard focus probe');
    document.body.appendChild(input);
    input.focus();
    return input.value;
  });
  expect(editorValue).toBe('');
  await page.keyboard.press('f');
  await expect(page.locator('#fullscreen-keyboard-focus-probe')).toHaveValue('f');

  await page.evaluate(() => {
    document.getElementById('fullscreen-keyboard-focus-probe')?.remove();
    (document.activeElement as HTMLElement | null)?.blur();
  });
  // Exercise Shift+F with a genuine key press. Dispatch the browser-reserved
  // Ctrl/Alt/Meta+F combinations to the document to avoid opening Chrome's
  // Find UI/menu and stealing keyboard focus from the world test.
  await page.keyboard.press('Shift+f');
  await page.evaluate(() => {
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'KeyF', key: 'f', bubbles: true, [modifier]: true,
      }));
    }
    document.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyF', key: 'f', bubbles: true, repeat: true,
    }));
  });
  await expect.poll(() => page.evaluate(() => Number(document.body.dataset.fullscreenRequestCount ?? 0))).toBe(0);
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => Number(document.body.dataset.fullscreenRequestCount ?? 0))).toBe(1);
  await expect(page.getByTestId('world-connection-status')).toBeVisible();
});
