import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { seed, firestore, auth, storage } from "./helpers/firebase-mock.js";
test("Gifts mobile planner: recipients, actions, joint costs, privacy, attachments and preserved Add", async () => {
  const files = [
    "index.html",
    "events.js",
    "calendar.js",
    "tasks.js",
    "sync.js",
    "ui.js",
    "updates.js",
    "organiser.css",
    "invitation.js",
    "gifts-model.js",
    "gifts-service.js",
    "gifts-ui.js",
    "sw.js",
    "manifest.webmanifest",
    "icon-192.png",
    "icon-512.png",
  ];
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname,
        file = pathname === "/" ? "index.html" : pathname.slice(1);
      if (!files.includes(file)) {
        res.writeHead(404).end();
        return;
      }
      res.setHeader(
        "Content-Type",
        file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".png")
              ? "image/png"
              : "text/html",
      );
      res.end(await readFile(file));
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
        acceptDownloads: true,
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("http://127.0.0.1:")) return route.continue();
      const body = {
        "firebase-app.js": "export const initializeApp=()=>({});",
        "firebase-auth.js": auth,
        "firebase-firestore.js": firestore,
        "firebase-storage.js": storage,
      }[url.split("/").pop()];
      return body
        ? route.fulfill({ contentType: "text/javascript", body })
        : route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator("#householdApp").waitFor({ state: "visible" });
    assert.deepEqual(
      await page.locator(".bottom-nav button").allTextContents(),
      ["⌂Today", "▦Calendar", "🎁Gifts", "☷Lists", "•••More"],
    );
    await page.locator("[data-view=gifts]").click();
    await page
      .getByRole("button", { name: "Start an occasion", exact: true })
      .click();
    const dialog = page.locator("#giftDialog");
    await dialog.getByLabel("Date", { exact: true }).fill("2026-12-25");
    await dialog.getByLabel("Total budget (£, optional)").fill("300");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    async function addRecipient(name) {
      await page
        .getByRole("button", { name: "+ Add recipient", exact: true })
        .click();
      await dialog.getByLabel("Name or group").fill(name);
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
    }
    await addRecipient("Mum");
    await addRecipient("Dad");
    assert.equal(await page.locator(".gift-recipient[open]").count(), 1);
    const mum = page
      .locator(".gift-recipient")
      .filter({
        has: page.locator(".gift-recipient-name", { hasText: "Mum" }),
      });
    await mum.locator("summary").first().click();
    assert.equal(await page.locator(".gift-recipient[open]").count(), 1);
    await mum.getByRole("button", { name: "+ Add gift", exact: true }).click();
    await dialog
      .getByLabel("Gift or idea", { exact: true })
      .fill("Concert & dinner");
    await dialog.getByLabel("Dad", { exact: true }).check();
    await dialog
      .getByLabel("Gift type", { exact: true })
      .selectOption("Experience");
    await dialog
      .getByLabel("Status", { exact: true })
      .selectOption("Ordered / booked");
    await dialog
      .getByRole("button", { name: "+ Add action", exact: true })
      .click();
    await dialog
      .getByLabel("Action", { exact: true })
      .fill("Print Christmas invitation");
    await dialog.getByText("Due date & reminder", { exact: true }).click();
    await dialog
      .getByLabel("Due date (optional)", { exact: true })
      .fill("2026-12-20");
    await dialog.getByText("Budget & cost", { exact: true }).click();
    await dialog.getByLabel("Actual total cost (£, optional)").fill("180");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.match(
      await page.locator(".gift-budget").textContent(),
      /£180.00.*£120.00/,
    );
    assert.equal(
      await page.locator(".gift-stats").textContent(),
      "2recipients0/1gifts organised1actions left",
    );
    await mum
      .getByRole("checkbox", {
        name: "Complete Print Christmas invitation",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () =>
        Object.values(mockGiftPlans.shared.gifts)[0].actions &&
        Object.values(Object.values(mockGiftPlans.shared.gifts)[0].actions)[0]
          .done,
    );
    assert.equal(
      await page.locator(".gift-stats").textContent(),
      "2recipients0/1gifts organised0actions left",
    );
    await mum
      .getByRole("checkbox", {
        name: "Reopen Print Christmas invitation",
        exact: true,
      })
      .click();
    assert.equal(
      await page.locator(".gift-stats").textContent(),
      "2recipients0/1gifts organised1actions left",
    );
    const gift = mum.locator(".gift-item");
    await gift.getByRole("button", { name: "Edit", exact: true }).click();
    await dialog
      .getByLabel("Status", { exact: true })
      .selectOption("Ready to give");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await mum
      .getByRole("checkbox", {
        name: "Complete Print Christmas invitation",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Organised", exact: true }).click();
    assert.equal(await mum.count(), 1);
    await gift.getByText("Files & vouchers", { exact: true }).click();
    await gift
      .getByLabel("Add PDF or photo (up to 10 MB)")
      .setInputFiles({
        name: "voucher.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 gift"),
      });
    await gift
      .getByRole("button", { name: "Upload file", exact: true })
      .click();
    await gift
      .getByRole("button", { name: "voucher.pdf", exact: true })
      .waitFor();
    const downloading = page.waitForEvent("download");
    await gift
      .getByRole("button", { name: "voucher.pdf", exact: true })
      .click();
    assert.equal((await downloading).suggestedFilename(), "voucher.pdf");
    await page.getByRole("button", { name: "Only me 🔒", exact: true }).click();
    assert.equal(await page.locator(".gift-recipient").count(), 0);
    assert.equal(
      await page.getByText("Concert & dinner", { exact: true }).count(),
      0,
    );
    await page
      .getByRole("button", { name: "Start an occasion", exact: true })
      .click();
    await dialog.getByLabel("Occasion name").fill("Secret Christmas");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await addRecipient("Ben surprise");
    assert.equal(
      await page
        .getByRole("button", {
          name: "View / add to household calendar",
          exact: true,
        })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "Household", exact: true }).click();
    await page.getByRole("button", { name: "All", exact: true }).click();
    assert.equal(
      await page.getByText("Ben surprise", { exact: true }).count(),
      0,
    );
    // Shared calendar import is explicitly requested and idempotent.
    await page
      .getByRole("button", {
        name: "View / add to household calendar",
        exact: true,
      })
      .click();
    await page.waitForFunction(() =>
      mockData.events.some((e) => e.title === "Christmas"),
    );
    await page
      .getByRole("button", {
        name: "View / add to household calendar",
        exact: true,
      })
      .click();
    await page.locator("#modal").waitFor({ state: "visible" });
    assert.equal(
      await page.evaluate(
        () => mockData.events.filter((e) => e.title === "Christmas").length,
      ),
      1,
    );
    await page.locator("#cancelEdit").click();
    await page
      .getByRole("button", { name: "Add task or event", exact: true })
      .click();
    await page.locator("#addTaskChoice").click();
    await page.locator("#modal").waitFor({ state: "visible" });
    await page.locator("#cancelEdit").click();
    assert.deepEqual(
      await page.evaluate(() => mockData.shopping),
      seed.shopping,
    );
    assert.deepEqual(await page.evaluate(() => mockData.custom), seed.custom);
    assert.deepEqual(
      await page.evaluate(() => mockData.events.slice(0, 2)),
      seed.events,
    );
    await page.setViewportSize({ width: 320, height: 740 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({
      path: "artifacts/gifts-mobile.png",
      fullPage: true,
    });

    // Birthday storage, annual records, duplication/moves and recipient edits.
    await page.setViewportSize({ width: 390, height: 844 });
    await mum.locator("summary").first().click();
    await mum
      .getByRole("button", { name: "Edit recipient", exact: true })
      .click();
    await dialog.getByText("Birthday & notes", { exact: true }).click();
    await dialog
      .getByLabel("Birthday (optional)", { exact: true })
      .fill("1960-05-12");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(
        () =>
          Object.values(mockGiftPlans.shared.people).find(
            (p) => p.name === "Mum",
          ).birthday,
      ),
      "1960-05-12",
    );
    await mum.getByRole("button", { name: "+ Add gift", exact: true }).click();
    await dialog.getByLabel("Gift or idea", { exact: true }).fill("Flowers");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await mum.locator(".gift-item").count(), 2);
    const flowers = mum
      .locator(".gift-item")
      .filter({
        has: page.getByRole("heading", { name: "Flowers", exact: true }),
      });
    await flowers
      .getByRole("button", { name: "Duplicate", exact: true })
      .click();
    await page.waitForFunction(() =>
      Object.values(mockGiftPlans.shared.gifts).some(
        (g) => g.title === "Flowers (copy)",
      ),
    );
    const copy = mum
      .locator(".gift-item")
      .filter({
        has: page.getByRole("heading", { name: "Flowers (copy)", exact: true }),
      });
    await copy.getByRole("button", { name: "Move", exact: true }).click();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.notEqual(
      await page.evaluate(
        () =>
          Object.values(mockGiftPlans.shared.gifts).find(
            (g) => g.title === "Flowers (copy)",
          ).occasionId,
      ),
      await page.evaluate(
        () =>
          Object.values(mockGiftPlans.shared.gifts).find(
            (g) => g.title === "Flowers",
          ).occasionId,
      ),
    );
    await page
      .getByRole("button", { name: "Plan next year", exact: true })
      .click();
    await page.waitForFunction(() =>
      Object.values(mockGiftPlans.shared.occasions).some(
        (o) => o.type === "Christmas" && o.date === "2027-12-25",
      ),
    );
    assert.equal(await page.locator(".gift-recipient").count(), 2);
    assert.equal(await page.locator(".gift-item").count(), 0);
    assert.ok(
      await page.evaluate(() =>
        Object.values(mockGiftPlans.shared.gifts).some(
          (g) => g.title === "Concert & dinner",
        ),
      ),
    );
    // Moving a shopping item is explicit; unrelated grocery data is retained.
    await page.evaluate(() => {
      state.shopping = {
        weekly: [
          { id: "scarf", text: "Gift scarf" },
          { id: "milk", text: "Milk" },
        ],
      };
      save();
    });
    await page
      .getByRole("button", { name: "From shopping", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await dialog
      .getByLabel("Shopping item", { exact: true })
      .selectOption("move");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(() => mockData.shopping.weekly.length === 1);
    assert.equal(
      await page.evaluate(() => mockData.shopping.weekly[0].text),
      "Milk",
    );
    assert.ok(
      await page.evaluate(() =>
        Object.values(mockGiftPlans.shared.gifts).some(
          (g) => g.shoppingSource === "weekly|scarf",
        ),
      ),
    );
    const first = page.locator(".gift-recipient").first();
    if (!(await first.evaluate((n) => n.open)))
      await first.locator("summary").first().click();
    page.once("dialog", (dialog) => dialog.accept());
    await first
      .getByRole("button", { name: "Delete recipient", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        Object.values(mockGiftPlans.shared.recipients).filter(
          (r) =>
            mockGiftPlans.shared.occasions[r.occasionId].date === "2027-12-25",
        ).length === 1,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
