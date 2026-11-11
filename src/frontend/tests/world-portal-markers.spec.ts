import { expect, test } from '@playwright/test'
import { isRenderableWorldPortalMarker, normalizeWorldPortalMarkers } from '../src/features/portals/worldPortalMarkers'

const valid = { id: 'grant-one', contentKey: 'portal.grove', x: 4.5, y: 6.5 }

test('portal validator accepts only finite server-owned numeric world coordinates', () => {
  expect(isRenderableWorldPortalMarker(valid)).toBe(true)
  for (const candidate of [
    null, undefined, 'bad', [], {},
    { ...valid, id: '' },
    { ...valid, contentKey: ' ' },
    { ...valid, x: null },
    { ...valid, y: null },
    { ...valid, x: '4.5' },
    { ...valid, y: '6.5' },
    { ...valid, x: NaN },
    { ...valid, y: Infinity },
    { ...valid, x: -Infinity },
    { ...valid, x: 1e308 }, // finite tile coordinate but pixel scale overflows
  ]) expect(isRenderableWorldPortalMarker(candidate)).toBe(false)
  expect(isRenderableWorldPortalMarker({ ...valid, x: 0, y: 0 })).toBe(true)
  expect(isRenderableWorldPortalMarker({ ...valid, x: -4.5, y: 2 })).toBe(true)
})

test('normalization preserves source order and identity, drops duplicates and invalids', () => {
  const other = { id: 'grant-two', contentKey: 'portal.moon', x: 8.5, y: 4.5 }
  const original = [null, valid, { ...valid, x: 99 }, other, { ...other, y: null }, 'bad']
  const actual = normalizeWorldPortalMarkers(original)
  expect(actual).toEqual([valid, other])
  expect(actual[0]).toBe(valid)
  expect(actual[1]).toBe(other)
  expect(normalizeWorldPortalMarkers([])).toEqual([])
})
