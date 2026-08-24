import { expect, test, type Page } from '@playwright/test';

const email = process.env.TEHKARTA_E2E_EMAIL ?? 'teacher@example.test';
const password = process.env.TEHKARTA_E2E_PASSWORD ?? 'change-this-local-password';

async function signIn(page: Page) {
  await page.goto('/');
  const login = page.getByRole('heading', { name: 'Вход в платформу' });
  if (await login.isVisible().catch(() => false)) {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Пароль').fill(password);
    await page.getByRole('button', { name: 'Войти' }).click();
  }
  await expect(page.getByText('План курса и источники')).toBeVisible();
}

test('restores course and lesson selection after reload', async ({ page }) => {
  await signIn(page);
  await page.locator('.lesson-nav-item').first().click();
  await expect(page.locator('.lesson-heading h1')).toBeVisible();
  const selectedUrl = page.url();
  expect(selectedUrl).toContain('course=');
  expect(selectedUrl).toContain('lesson=');
  await page.reload();
  await expect(page.locator('.lesson-heading h1')).toBeVisible();
  expect(page.url()).toBe(selectedUrl);
});

test('critical teacher-authoritative lesson flow', async ({ page }) => {
  test.skip(process.env.TEHKARTA_E2E_MUTATIONS !== '1', 'Requires an isolated mutable database and configured AI worker.');
  await signIn(page);
  await page.locator('.lesson-nav-item').first().click();
  await page.getByRole('button', { name: /02.*Цель и результаты/ }).click();

  const decision = page.locator('.decision-card').first();
  if (await decision.getByRole('button', { name: 'Изменить' }).isVisible().catch(() => false)) {
    const currentValue = (await decision.locator('.decision-value__text p').textContent())?.trim() ?? 'Цель урока';
    await decision.getByRole('button', { name: 'Изменить' }).click();
    await decision.getByRole('textbox').fill(`${currentValue} · проверено e2e`);
  }
  await decision.getByRole('button', { name: /Применить$/ }).click();
  await expect(decision.getByText(/Утверждено педагогом/)).toBeVisible();

  await decision.getByRole('button', { name: /Предложить варианты/ }).click();
  await expect(decision.getByText('Варианты готовы')).toBeVisible({ timeout: 150_000 });
  await decision.getByRole('button', { name: 'Выбрать этот вариант' }).first().click();
  await decision.getByRole('button', { name: /Применить выбранный вариант/ }).click();
  await expect(decision.getByText(/Утверждено педагогом/)).toBeVisible();

  await page.getByRole('button', { name: /03.*Методический конструктор/ }).click();
  for (const profileDecision of await page.locator('.pedagogy-decision').all()) {
    if (!(await profileDecision.getByText('Утверждено').isVisible().catch(() => false))) {
      await profileDecision.locator('.pedagogy-option').first().click();
      await profileDecision.getByRole('button', { name: 'Сохранить' }).click();
      await profileDecision.getByRole('button', { name: 'Утвердить' }).click();
      await expect(profileDecision.getByText('Утверждено')).toBeVisible();
    }
  }
  const selectedTechnology = page.locator('.technology-card.is-selected');
  if (!(await selectedTechnology.isVisible().catch(() => false))) {
    await page.locator('.technology-card').first().getByRole('button', { name: 'Выбрать и утвердить' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Методы под утверждённый результат' })).toBeVisible();
  const methodUse = page.getByRole('button', { name: '✓ Использовать' }).first();
  if (await methodUse.isVisible().catch(() => false)) await methodUse.click();
  await page.getByRole('button', { name: /Перейти к содержанию/ }).click();

  const contentUse = page.getByRole('button', { name: '✓ Использовать' });
  while (await contentUse.count()) await contentUse.first().click();
  await page.getByRole('button', { name: /Перейти к сценарию/ }).click();
  await page.getByRole('button', { name: /Сохранить и перейти к материалам/ }).click();

  const readiness = page.getByRole('checkbox', { name: /Готов к уроку/ });
  for (let index = 0; index < await readiness.count(); index += 1) {
    if (!(await readiness.nth(index).isChecked())) await readiness.nth(index).check();
  }
  await page.getByRole('button', { name: /Сохранить и перейти к экспертизе/ }).click();
  await page.getByRole('button', { name: /Открыть карту|Перейти к карте/ }).click();
  await expect(page.getByRole('heading', { name: /Карта урока|Экономика|Проверочный урок/ })).toBeVisible();
});
