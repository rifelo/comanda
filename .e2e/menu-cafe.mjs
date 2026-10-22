// e2e: the menu's «Con café» / «Sin café» groups. Read-only (public GET); safe in opening hours.
import { chromium } from "playwright";
import { mkdirSync } from "fs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = ".e2e/tmp/menu-cafe"; mkdirSync(OUT, { recursive: true });
const bag = []; const ok = (c, k, t) => (c ? console.log("✓", k) : bag.push({ k, t: String(t).slice(0, 300) }));
const b = await chromium.launch();
try {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  p.on("pageerror", (e) => bag.push({ k: "pageerror", t: e.message }));
  await p.goto(`${BASE}/menu`, { waitUntil: "networkidle" });
  const grupo = (sec, g) => p.locator(`#cat-${sec}`).getByRole("group", { name: `${sec === "caliente" ? "Caliente" : "Frío"} · ${g}` });
  for (const sec of ["caliente", "frio"]) {
    const con = await grupo(sec, "Con café").locator(".pym-row__name").allInnerTexts();
    const sin = await grupo(sec, "Sin café").locator(".pym-row__name").allInnerTexts();
    ok(con.length > 0 && sin.length > 0, `${sec}: dos grupos`, `${con.length}/${sin.length}`);
    ok(!sin.some((n) => /latte|espresso|americano|cappuccino|tinto|mocca|cold brew|dalgona|granizado/i.test(n)), `${sec}: nada de café en «Sin café»`, sin.join("|"));
    ok(con.every((n) => !/milo|aromática|chai|matcha/i.test(n)), `${sec}: nada sin café en «Con café»`, con.join("|"));
    console.log(`  ${sec} con:`, con.join(", "), "\n  sin:", sin.join(", "));
    await p.locator(`#cat-${sec}`).screenshot({ path: `${OUT}/${sec}.png` });
  }
  ok((await p.locator("#cat-jugos .pym-grupo").count()) === 0, "jugos: sin subtítulos (todo es sin café)");
} finally { await b.close(); }
if (bag.length) { console.log("✗ fallos:", bag); process.exit(1); }
console.log("todo ok");
