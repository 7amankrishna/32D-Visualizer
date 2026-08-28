import { chromium } from 'playwright-core';

const errors = [];
const browser = await chromium.launch({
  executablePath: '/tmp/chromium',
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/awslibs/lib:/tmp' },
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300));
});
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 400)));

const shot = async (name) => {
  try {
    await page.screenshot({ path: `/tmp/shots/${name}.png`, timeout: 12000, animations: 'disabled' });
    console.log('shot:', name);
  } catch (e) {
    console.log('shot FAILED:', name, String(e).slice(0, 80));
  }
};

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(4000);
await shot('01-3d-4d');

// HUD text check
const hud = await page.evaluate(() => {
  const el = document.querySelector('.pointer-events-none.absolute.left-3.top-3');
  return el ? el.innerText.slice(0, 200) : 'NO HUD';
});
console.log('HUD:', JSON.stringify(hud));

// canvas pixel check (is WebGL actually drawing?)
const px = await page.evaluate(() => {
  const canvases = Array.from(document.querySelectorAll('canvas'));
  for (const c of canvases) {
    if (c.width > 100 && c.height > 100) {
      try {
        const t = document.createElement('canvas');
        t.width = c.width;
        t.height = c.height;
        const ctx = t.getContext('2d');
        // WebGL canvases can't be read directly; use the 2D fallback check via toDataURL size
        const url = c.toDataURL();
        return { w: c.width, h: c.height, dataLen: url.length };
      } catch (e) {
        return { err: String(e) };
      }
    }
  }
  return { err: 'no canvas' };
});
console.log('webgl canvas:', JSON.stringify(px));

// switch views
for (const [label, file] of [
  ['2D VIEW', '02-2d'],
  ['PARALLEL VIEW', '03-parallel'],
  ['SLICE VIEW', '04-slice'],
  ['MATRIX VIEW', '05-matrix'],
  ['YOU', '06-you'],
]) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(1500);
  await shot(file);
}

// back to 3D, set dimension 32
await page.getByRole('button', { name: '3D VIEW', exact: true }).click();
await page.waitForTimeout(800);
const dimInput = page.locator('input[type="number"][aria-label="dimension"]');
await dimInput.fill('32');
await dimInput.dispatchEvent('input');
await dimInput.blur();
await page.waitForTimeout(3500); // worker builds 32D sampled cube
await shot('07-32d-3d');

// dimension slider to 8
await page.locator('input[type="range"][aria-label="dimension slider"]').fill('8');
await page.waitForTimeout(2500);
await shot('08-8d-3d');

// first-person mode
await page.getByRole('button', { name: 'First-person', exact: true }).click();
await page.waitForTimeout(1200);
await shot('09-firstperson');

// enter dimension mode
await page.getByRole('button', { name: /ENTER DIMENSION|IN THE DIMENSION/ }).click();
await page.waitForTimeout(1500);
await shot('10-enter-dimension-you-view');

// morph animation (pause first — a perpetually redrawing canvas never
// reaches frame stability and Playwright's screenshot would time out)
await page.getByRole('button', { name: /2D→32D MORPH/ }).click();
await page.waitForTimeout(5000);
await page.getByRole('button', { name: /pause/ }).click();
await page.waitForTimeout(800);
await shot('11-morph');
await page.getByRole('button', { name: /close/ }).click();
await page.waitForTimeout(500);

// presets: tesseract (expand collapsed section first)
await page.getByRole('button', { name: /Presets/ }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Tesseract (4D)', exact: true }).click();
await page.waitForTimeout(2500);
await shot('12-tesseract');

// experiments (expand collapsed section first)
await page.getByRole('button', { name: /Experiments/ }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Slice a 5D sphere/ }).click();
await page.waitForTimeout(2500);
await shot('13-5d-sphere-slice');

// parallel view at 32D for the "I am here" feel
await page.getByRole('button', { name: 'PARALLEL VIEW', exact: true }).click();
await page.waitForTimeout(2000);
await shot('14-parallel-32d-or-current');

// sample CSV import (expand collapsed section)
await page.getByRole('button', { name: /Data import/ }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Load sample \(5D\)/ }).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: '3D VIEW', exact: true }).click();
await page.waitForTimeout(2000);
await shot('15-imported-5d');

// explain button
await page.getByRole('button', { name: /Explain what I'm seeing/ }).click();
await page.waitForTimeout(800);
await shot('16-explained');

console.log('\n=== ERRORS (' + errors.length + ') ===');
for (const e of errors.slice(0, 25)) console.log(e);

await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
