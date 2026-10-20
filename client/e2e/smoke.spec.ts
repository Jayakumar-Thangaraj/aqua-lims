// Spec §17 smoke test: tank with species + override -> out-of-range sample (red row, Critical health)
// -> water preparation with a reading -> water change that needs an override note -> audit entries.
// Needs an account that has already set its password: E2E_USER / E2E_PASSWORD.
import { expect, test, type Locator, type Page } from '@playwright/test';

const USER = process.env.E2E_USER ?? 'Admin';
const PASSWORD = process.env.E2E_PASSWORD ?? '';
const stamp = Date.now().toString().slice(-6);
const TANK = `CLAUDE-E2E Tank ${stamp}`;
const TANK_CODE = `E2E${stamp}`;
const SAMPLE = `CLAUDE-E2E-${stamp}`;
const created: { path: string; id: string }[] = [];

async function pick(page: Page, combobox: Locator, search: string, option: string) {
  await combobox.click();
  await combobox.fill(search);
  await page.getByRole('option', { name: option, exact: false }).first().click();
}

async function saveForm(page: Page) {
  const response = page.waitForResponse((r) => ['POST', 'PUT'].includes(r.request().method()) && /\/api\/[a-z-]+(\/[0-9a-f]{24})?$/.test(r.url()));
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  return response;
}

test.describe.serial('Aqua LIMS smoke', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!PASSWORD, 'Set E2E_PASSWORD to the password of E2E_USER.');
    await page.goto('/login');
    await page.getByLabel('User Name').fill(USER);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  });

  test.afterAll(async ({ browser }) => {
    if (!PASSWORD || created.length === 0) return;
    const page = await browser.newPage();
    await page.goto('/login');
    await page.getByLabel('User Name').fill(USER);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    for (const item of [...created].reverse()) await page.request.delete(`/api/${item.path}/${item.id}`);
    await page.close();
  });

  test('tank -> sample -> water preparation -> water change with override', async ({ page }) => {
    // 1. Tank with two species and a pH override.
    await page.goto('/tanks/new');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Tank Name', exact: true }).fill(TANK);
    await dialog.getByRole('textbox', { name: 'Tank Code', exact: true }).fill(TANK_CODE);
    const speciesTab = dialog.getByRole('tabpanel');
    await speciesTab.getByRole('button', { name: 'New', exact: true }).click();
    await pick(page, speciesTab.getByRole('combobox', { name: 'Species' }).first(), 'Cherry', 'Cherry Shrimp');
    await speciesTab.getByRole('button', { name: 'New', exact: true }).click();
    await pick(page, speciesTab.getByRole('combobox', { name: 'Species' }).first(), 'Scarlet', 'Scarlet Badis');
    await dialog.getByRole('tab', { name: 'Parameter Overrides' }).click();
    const overrides = dialog.getByRole('tabpanel');
    await overrides.getByRole('button', { name: 'New', exact: true }).click();
    await pick(page, overrides.getByRole('combobox', { name: 'Parameter' }).first(), 'pH', 'pH');
    await overrides.getByRole('textbox', { name: 'LCL' }).first().fill('6.5');
    await overrides.getByRole('textbox', { name: 'UCL' }).first().fill('7.5');
    const tankRes = await saveForm(page);
    expect(tankRes.status()).toBe(201);
    const tank = await tankRes.json();
    created.push({ path: 'tanks', id: tank._id });
    expect(tank.children.tankSpecies).toHaveLength(2);

    // 2. Sample with an out-of-range Nitrate result: red row, High, tank goes Critical.
    await page.goto('/samples/new');
    await dialog.getByRole('textbox', { name: 'Sample Code', exact: true }).fill(SAMPLE);
    await pick(page, dialog.getByRole('combobox', { name: 'Tank' }).first(), TANK, TANK);
    await dialog.getByRole('button', { name: 'New', exact: true }).click();
    await pick(page, dialog.getByRole('combobox', { name: 'Parameter' }).first(), 'Nitrate', 'Nitrate');
    await dialog.getByRole('textbox', { name: 'Measured Value' }).first().fill('25');
    const resultRow = dialog.locator('tr.out-of-range');
    await expect(resultRow).toContainText('0.00 – 20.00');
    await expect(resultRow).toContainText('High');
    const sampleRes = await saveForm(page);
    expect(sampleRes.status()).toBe(201);
    created.push({ path: 'samples', id: (await sampleRes.json())._id });

    await page.goto('/tanks');
    await page.getByRole('searchbox', { name: 'Text to search' }).fill(TANK_CODE);
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('row', { name: new RegExp(TANK_CODE) })).toContainText('Critical');

    // 3. Water preparation with a TDS reading of 57 ppm.
    await page.goto('/water-preparations/new');
    await dialog.getByRole('textbox', { name: 'Prepared Volume' }).fill('1');
    await dialog.getByRole('tab', { name: 'Readings' }).click();
    const readings = dialog.getByRole('tabpanel');
    await readings.getByRole('button', { name: 'New', exact: true }).click();
    await pick(page, readings.getByRole('combobox', { name: 'Parameter' }).first(), 'Total Dissolved', 'Total Dissolved Solids');
    await readings.getByRole('textbox', { name: 'Measured Value' }).first().fill('57');
    const prepRes = await saveForm(page);
    expect(prepRes.status()).toBe(201);
    const prep = await prepRes.json();
    created.push({ path: 'water-preparations', id: prep._id });
    expect(prep.prepCode).toMatch(/^WP-\d{6}-\d{3,}$/);

    // 4. Water change: critical TDS -> blocked without a note, saved with one.
    await page.goto('/water-changes/new');
    await pick(page, dialog.getByRole('combobox', { name: 'Tank' }).first(), TANK, TANK);
    await pick(page, dialog.getByRole('combobox', { name: 'Prepared Water' }).first(), prep.prepCode, prep.prepCode);
    await expect(dialog.getByText('critical issue(s) detected', { exact: false }).first()).toBeVisible();
    const blocked = await saveForm(page);
    expect(blocked.status()).toBe(422);
    await expect(dialog.getByRole('alert').filter({ hasText: 'Critical out-of-range parameters detected' })).toBeVisible();
    await dialog.getByLabel('Override Note').fill('CLAUDE-E2E override');
    const wcRes = await saveForm(page);
    expect(wcRes.status()).toBe(201);
    const wc = await wcRes.json();
    created.push({ path: 'water-changes', id: wc._id });
    expect(wc.alertsSnapshot[0]).toMatchObject({ parameterCode: 'TDS', severity: 'OutOfRange' });

    // 5. Audit trail records who did it.
    const audit = await (await page.request.get(`/api/admin/audit-logs?entity=waterChange&entityId=${wc._id}`)).json();
    expect(audit.items.some((a: any) => a.operation === 'ObjectCreated' && a.userName.toLowerCase() === USER.toLowerCase())).toBe(true);
  });
});
