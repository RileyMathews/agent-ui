import { expect, test } from '@playwright/test';

test('applies the global baseline on direct route loads', async ({ page }) => {
	for (const path of ['/', '/new']) {
		await page.goto(path);

		const styles = await page.evaluate(() => {
			const body = getComputedStyle(document.body);
			const main = getComputedStyle(document.querySelector('main')!);

			return {
				background: body.backgroundColor,
				boxSizing: main.boxSizing,
				margin: body.margin,
				text: body.color
			};
		});

		expect(styles).toEqual({
			background: 'rgb(17, 19, 21)',
			boxSizing: 'border-box',
			margin: '0px',
			text: 'rgb(241, 243, 243)'
		});
	}
});

test('does not force horizontal overflow on a narrow viewport', async ({ page }) => {
	await page.setViewportSize({ width: 280, height: 700 });
	await page.goto('/new');

	const dimensions = await page.evaluate(() => ({
		viewport: window.innerWidth,
		page: document.documentElement.scrollWidth
	}));

	expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
});

test('disables terminal spinner animation for reduced motion', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.route('https://scottyopencode.rileymathews.com/**', () => new Promise(() => {}));
	await page.goto('/terminal?directory=%2Ftmp&server=scottyopencode.rileymathews.com&returnTo=%2F');

	await expect(page.locator('.spinner')).toHaveCSS('animation-name', 'none');
});
