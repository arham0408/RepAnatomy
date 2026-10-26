import { test, expect } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';

async function ready(page) {
  await expect(page.locator('.loading[role="alert"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share current view', exact: true })).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('.loading')).toHaveCount(0);
}

async function camera(page) {
  await ready(page);
  await page.getByRole('button', { name: 'Share current view', exact: true }).click();
  const link = await page.getByLabel('View link', { exact: true }).inputValue();
  const view = JSON.parse(Buffer.from(new URL(link).hash.slice(6), 'base64url').toString('utf8'));
  await page.keyboard.press('Escape');
  return view.camera;
}
const distance = (camera) => Math.hypot(...camera.position.map((n, i) => n - camera.target[i]));

test.describe('expanding anatomy dock', () => {
  test.use({ hasTouch: true });
  test('expands from its center and supports drag, keyboard and touch', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.mouse.move(800, 300);
    await page.goto('./?atlas=1');
    await ready(page);
    const dock = page.locator('.bottom-dock');
    const trigger = page.getByRole('button', { name: 'Explode anatomy controls', exact: true });
    const slider = page.getByRole('slider', { name: 'Explode anatomy', exact: true });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(slider).toBeHidden();
    const collapsed = await dock.boundingBox();
    expect(collapsed.width).toBe(196);
    await page.screenshot({ path: 'outputs/dock-collapsed.png' });
    await dock.hover();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const open = await dock.boundingBox();
    expect(open.width).toBe(560);
    expect(open.x + open.width / 2).toBeCloseTo(collapsed.x + collapsed.width / 2, 1);
    await expect(slider).toBeVisible();
    await page.screenshot({ path: 'outputs/dock-expanded.png' });
    await page.mouse.move(800, 300);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('button', { name: 'Turn clockwise', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(slider).toBeVisible();
    await slider.focus();
    await slider.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '1');
    await slider.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
    await trigger.press('Tab');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await dock.hover();
    const thumb = await slider.boundingBox();
    await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
    await page.mouse.down();
    await page.mouse.move(open.x + open.width + 30, open.y + open.height / 2, { steps: 5 });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.mouse.up();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await dock.hover();
    await expect(slider).toHaveAttribute('aria-valuenow', '100');
    await page.getByRole('button', { name: 'Assemble and reset', exact: true }).click();
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await page.mouse.move(800, 300);

    await page.setViewportSize({ width: 375, height: 812 });
    await trigger.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(slider).toBeVisible();
    const mobile = await dock.boundingBox();
    expect(mobile.x).toBeGreaterThanOrEqual(0);
    expect(mobile.x + mobile.width).toBeLessThanOrEqual(375);
    await trigger.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

async function bodyFits(page, manifest) {
  const atlas = await (await page.request.get(`models/${manifest}`)).json();
  const min = [0, 1, 2].map(axis => Math.min(...atlas.parts.map(part => part.bounds[0][axis])));
  const max = [0, 1, 2].map(axis => Math.max(...atlas.parts.map(part => part.bounds[1][axis])));
  await expect(async () => {
    const pose = await camera(page);
    const [width, height] = await page.locator('.scene').evaluate(el => [el.clientWidth, el.clientHeight]);
    expect(pose.viewport).toEqual([width, height]);
    const lens = new PerspectiveCamera(34, width / height, .005, 100);
    lens.position.fromArray(pose.position);
    lens.setViewOffset(width, height, pose.offset[0] * width, pose.offset[1] * height, width, height);
    lens.lookAt(new Vector3().fromArray(pose.target));
    lens.updateMatrixWorld();
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
      const point = new Vector3(x, y, z).project(lens);
      expect(Math.abs(point.x), 'Full body width must remain inside the canvas').toBeLessThan(.995);
      expect(Math.abs(point.y), 'The head and feet must remain inside the canvas').toBeLessThan(.995);
    }
  }).toPass({ timeout: 30000 });
}

test('sidebar opens on hover and body systems uses a working dropdown', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.mouse.move(900, 450);
  await page.goto('./?atlas=1');
  await ready(page);
  const sidebar = page.getByRole('complementary', { name: 'Workspace sidebar', exact: true });
  await expect(sidebar).toHaveAttribute('data-expanded', 'false');
  expect((await sidebar.boundingBox()).width).toBe(68);
  await sidebar.hover();
  await expect(sidebar).toHaveAttribute('data-expanded', 'true');
  expect((await sidebar.boundingBox()).width).toBe(250);
  const toggle = page.getByRole('button', { name: 'Body systems', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#systems-panel')).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const picker = page.getByRole('combobox', { name: 'Choose a body system', exact: true });
  await picker.selectOption('skeletal');
  await expect(page.locator('.system-group')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Browse skeleton structures', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('switch', { name: 'Show skeleton', exact: true })).toBeChecked();
  await picker.selectOption('all');
  await expect(page.locator('.system-group')).toHaveCount(15);
  await expect(page.getByRole('switch', { name: 'Show muscles', exact: true })).toBeChecked();
  await page.mouse.move(900, 450);
  await expect(sidebar).toHaveAttribute('data-expanded', 'false');
  await expect(picker).toBeHidden();

  await page.getByRole('button', { name: 'Expand navigation', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(sidebar).toHaveAttribute('data-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(sidebar).toHaveAttribute('data-expanded', 'false');

  for (const height of [1000, 900, 768, 650, 621, 601]) {
    await page.setViewportSize({ width: 1366, height });
    await sidebar.hover();
    const panel = await page.locator('#systems-panel').boundingBox();
    const footer = await page.locator('.sidebar-bottom').boundingBox();
    expect(panel.y + panel.height).toBeLessThanOrEqual(footer.y);
    expect((await page.locator('.system-list').boundingBox()).height).toBeGreaterThan(80);
    const lastToggle = page.locator('.system-row').last().getByRole('switch');
    await lastToggle.scrollIntoViewIfNeeded();
    expect(await lastToggle.evaluate(el => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    })).toBe(true);
    await lastToggle.click();
    await expect(lastToggle).not.toBeChecked();
    await lastToggle.click();
    await page.mouse.move(900, 450);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: 'outputs/sidebar-collapsed.png' });
  await sidebar.hover();
  await page.screenshot({ path: 'outputs/sidebar-expanded.png' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('.bottom-dock').hover();
  await page.getByRole('button', { name: 'Open system layers', exact: true }).click();
  await picker.selectOption('respiratory');
  await expect(page.locator('.system-group')).toHaveCount(1);
  await expect(page.getByRole('switch', { name: 'Show respiratory', exact: true })).toBeChecked();
});

test('atlas shell controls change the real camera and retain both models', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('./?atlas=1');
  await ready(page);
  await expect(page.locator('.canvas-caption')).toHaveCount(0);
  await expect(page.locator('.model-tabs')).toHaveCount(0);
  const modelIcon = await page.locator('.model-tools .model-option-label').first().boundingBox();
  const focusIcon = await page.getByRole('button', { name: 'Expand viewer', exact: true }).boundingBox();
  expect(modelIcon.width).toBe(38);
  expect(modelIcon.height).toBe(38);
  expect(modelIcon.x).toBe(focusIcon.x);
  expect((await page.locator('canvas').boundingBox()).y).toBeLessThan(60);
  await bodyFits(page, 'atlas.json');
  const initial = await camera(page);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoomed = await camera(page);
  expect(distance(zoomed)).toBeCloseTo(distance(initial) / 1.35, 3);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  expect(distance(await camera(page))).toBeCloseTo(distance(initial), 3);
  await page.getByRole('button', { name: 'Turn clockwise', exact: true }).click();
  const turned = await camera(page);
  expect(turned.position).not.toEqual(initial.position);
  expect(distance(turned)).toBeCloseTo(distance(initial), 3);
  await page.locator('canvas').focus();
  await page.keyboard.press('0');
  expect(distance(await camera(page))).toBeCloseTo(distance(initial), 3);
  await page.screenshot({ path: 'outputs/atlas-desktop.png' });

  await page.getByRole('button', { name: 'Switch to dusk lighting' }).click();
  await expect(page.locator('main')).toHaveAttribute('data-light', 'dusk');
  expect(await page.locator('main').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(20, 23, 15)');
  await page.screenshot({ path: 'outputs/atlas-dusk.png' });
  await page.getByRole('button', { name: 'Switch to day lighting' }).click();
  const beforeFocus = await page.locator('canvas').boundingBox();
  await page.getByRole('button', { name: 'Expand viewer' }).click();
  await expect(page.locator('main')).toHaveClass(/focus-mode/);
  await expect.poll(async () => (await page.locator('canvas').boundingBox()).width).toBeGreaterThan(beforeFocus.width);
  await page.keyboard.press('Escape');
  await expect(page.locator('main')).not.toHaveClass(/focus-mode/);

  await page.locator('.model-option[title^="Female model"]').click();
  await expect(page.getByRole('radio', { name: 'Female anatomy (experimental)', exact: true })).toBeChecked();
  await ready(page);
  await expect(page.locator('canvas')).toHaveCount(1);
  await bodyFits(page, 'atlas-female.json');
  await page.locator('.model-tools input:checked').press('ArrowUp');
  await expect(page.getByRole('radio', { name: 'Male anatomy', exact: true })).toBeChecked();
  await ready(page);
  for (const [width, height] of [[1366, 768], [1366, 650], [375, 812], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await bodyFits(page, 'atlas.json');
  }
  expect(errors).toEqual([]);
});

test('atlas shell remains usable on phone, tablet and short viewports', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?atlas=1');
  await ready(page);
  for (const [width, height] of [[375, 812], [320, 568], [844, 390], [900, 900], [1280, 600]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const canvas = await page.locator('canvas').boundingBox();
    expect(canvas.width).toBeGreaterThan(100);
    expect(canvas.height).toBeGreaterThan(80);
    await page.getByRole('button', { name: 'Search anatomy', exact: true }).click();
    await page.getByRole('combobox').fill('heart');
    await page.getByRole('option', { name: /^heart \d+ pieces?$/i }).click();
    await expect(page.locator('.detail-sheet')).toBeVisible();
    const sheet = await page.locator('.detail-sheet').boundingBox();
    expect(sheet.x).toBeGreaterThanOrEqual(0);
    expect(sheet.x + sheet.width).toBeLessThanOrEqual(width);
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(height);
    await page.getByRole('button', { name: 'Locate structure', exact: true }).click();
    await page.getByRole('button', { name: 'Isolate structure', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Show surrounding anatomy', exact: true })).toBeVisible();
    await page.locator('.detail-sheet').getByRole('button', { name: 'Close', exact: true }).click();
    const browse = page.getByRole('button', { name: 'Browse body surface structures', exact: true });
    if (!await browse.isVisible()) {
      const expand = page.getByRole('button', { name: 'Explode anatomy controls', exact: true });
      if (await expand.getAttribute('aria-expanded') !== 'true') { await expand.focus(); await page.keyboard.press('Enter'); }
      await page.getByRole('button', { name: /Open system layers|Pin systems panel/ }).click();
      if (width > 1100 && height > 600) await page.locator('.workspace-sidebar').hover();
    }
    await expect(browse).toBeVisible();
    await page.getByRole('button', { name: 'Close systems', exact: true }).click();
    const expand = page.getByRole('button', { name: 'Explode anatomy controls', exact: true });
    if (await expand.getAttribute('aria-expanded') !== 'true') { await expand.focus(); await page.keyboard.press('Enter'); }
    await page.getByRole('button', { name: 'Assemble and reset', exact: true }).click();
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await ready(page);
  await page.screenshot({ path: 'outputs/atlas-phone.png' });
  await page.getByRole('button', { name: 'Medical Report Explorer', exact: true }).click();
  await expect(page.locator('.repanatomy-panel')).toBeVisible();
  await expect(page.locator('.repanatomy-sample-chip').first()).toBeVisible();
  expect(await page.locator('.repanatomy-lang-select option').count()).toBe(8);
});
