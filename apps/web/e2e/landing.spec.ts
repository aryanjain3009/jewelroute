/* Landing page (`/`): every link and button resolves, in-page anchors land under the sticky nav,
 * and nothing overflows horizontally at phone and desktop widths. Needs only the web app (no API,
 * no reseed): `E2E_WEB=http://localhost:3301 pnpm --filter @jewelroute/web e2e --project landing`. */
import { test, expect, type Page } from "@playwright/test";

const NAV_HEIGHT = 64;

async function noHorizontalOverflow(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, "page must not scroll sideways").toBeLessThanOrEqual(iw);
}

for (const width of [390, 1440]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("/");
    await noHorizontalOverflow(page);
    // reveal-on-scroll content must not widen the page either
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 700) await page.evaluate((v) => window.scrollTo(0, v), y);
    await noHorizontalOverflow(page);
  });
}

test("every link on / resolves: routes return 200, anchors exist", async ({ page, request }) => {
  await page.goto("/");
  const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!))]);
  expect(hrefs.length).toBeGreaterThan(10);
  for (const href of hrefs) {
    const url = new URL(href, page.url());
    if (url.pathname === "/" && url.hash) {
      await expect(page.locator(url.hash), `anchor ${href}`).toHaveCount(1);
    } else {
      expect(href.startsWith("http") && !href.startsWith(new URL(page.url()).origin), `${href} stays on site`).toBe(false);
      const res = await request.get(url.pathname, { maxRedirects: 0 });
      expect(res.status(), `GET ${url.pathname}`).toBe(200);
      if (url.hash) {
        await page.goto(url.pathname);
        await expect(page.locator(url.hash), `anchor ${href}`).toHaveCount(1);
        await page.goto("/");
      }
    }
  }
  // No dead buttons: outside the inert sample-data frames (where the app's own buttons are drawn but
  // cannot be focused or clicked), the only <button>s are the mobile menu trigger and real tabs
  // (the hero's product switch and the verified-visit outcomes), which change what the frame shows.
  const buttons = await page.locator("button").evaluateAll((els) => els.filter((b) => !b.closest("[inert]")).map((b) => (b.getAttribute("role") === "tab" ? `tab:${b.textContent?.trim()}` : b.getAttribute("aria-label") ?? b.textContent?.trim())));
  for (const b of buttons) expect(b === "Open menu" || b === "Close menu" || b?.startsWith("tab:"), `button ${b}`).toBeTruthy();
});

test("header links and CTAs go where they say", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "JewelRoute home" })).toHaveAttribute("href", "/");
  await expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  await expect(header.getByRole("link", { name: "Explore live demo" })).toHaveAttribute("href", "/login");
  await expect(header.getByRole("link", { name: "Developers" })).toHaveAttribute("href", "/developers");
  await expect(page.getByRole("link", { name: "See how it works" })).toHaveAttribute("href", "/#workflow");

  for (const [name, id] of [["Product", "product"], ["Visits", "visit"], ["Custody", "custody"], ["Workflow", "workflow"]] as const) {
    await header.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect.poll(async () => page.evaluate((i) => Math.round(document.getElementById(i)!.getBoundingClientRect().top), id)).toBeGreaterThanOrEqual(NAV_HEIGHT - 1);
    const top = await page.evaluate((i) => Math.round(document.getElementById(i)!.getBoundingClientRect().top), id);
    expect(top, `#${id} sits just under the sticky nav`).toBeLessThanOrEqual(NAV_HEIGHT + 24);
  }

  await header.getByRole("link", { name: "Developers" }).click();
  await expect(page).toHaveURL(/\/developers$/);
});

test("mobile menu opens, lists the sections and closes on navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog");
  for (const name of ["Product", "Visits", "Custody", "Workflow", "Developers", "Sign in", "Explore live demo"]) await expect(menu.getByRole("link", { name, exact: true })).toBeVisible();
  await menu.getByRole("link", { name: "Workflow", exact: true }).click();
  await expect(page).toHaveURL(/#workflow$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("sample data is labelled and the hero reaches its final state with reduced motion", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByText("Sample data").first()).toBeVisible();
  await expect(page.getByText("Complete visit").first()).toBeAttached();
  await expect(page.locator("#custody").getByText("Holds now").first()).toBeVisible();
  await ctx.close();
});

test("sections follow the brief's order: hero, product, verified visit, custody, field day, manager, integrations, trust", async ({ page }) => {
  await page.goto("/");
  const ids = await page.evaluate(() => [...document.querySelectorAll("main > section")].map((s) => s.id || s.getAttribute("aria-labelledby")));
  expect(ids).toEqual(["hero-title", "product", "visit", "custody", "workflow", "manager", "integrations", "trust"]);
});

test("hero product switch: Manager | Field agent | Sample custody show real UI, by click and by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const tabs = page.getByRole("tablist").first().getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveText("Manager");
  await expect(tabs.nth(1)).toHaveText("Field agent");
  await expect(tabs.nth(2)).toHaveText("Sample custody");
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");

  // Each tab shows its own panel; the others are inert (not focusable, hidden from assistive tech).
  const expectations = [["Manager", /Manager Home/], ["Field agent", /Field agent app/], ["Sample custody", /Sample custody record/]] as const;
  for (const [name, summary] of expectations) {
    await page.getByRole("tab", { name: new RegExp(name, "i") }).click();
    await expect(page.getByRole("tab", { name: new RegExp(name, "i") })).toHaveAttribute("aria-selected", "true");
    const panel = page.getByRole("tabpanel").filter({ hasText: summary });
    await expect(panel).toHaveCount(1);
    await expect(panel).not.toHaveAttribute("inert", "");
  }
  // A click hands control to the visitor: no auto-advance afterwards.
  await page.waitForTimeout(7_000);
  await expect(page.getByRole("tab", { name: /Sample custody/ })).toHaveAttribute("aria-selected", "true");

  // Keyboard: arrows move between tabs (Radix roving focus), no animation needed to read the result.
  await page.getByRole("tab", { name: /Sample custody/ }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: /Field agent/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Field agent/ })).toBeFocused();
});

test("hero switch auto-advances on its own, and never with reduced motion", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Manager" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Field agent/ })).toHaveAttribute("aria-selected", "true", { timeout: 12_000 });
  await ctx.close();

  const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const rp = await rctx.newPage();
  await rp.goto("/");
  await rp.waitForTimeout(8_000);
  await expect(rp.getByRole("tab", { name: "Manager" })).toHaveAttribute("aria-selected", "true");
  await rctx.close();
});
