import { describe, expect, it } from "vitest";
import { findMergeIndex } from "./cart";
import type { OrderLine } from "./types";

const line = (over: Partial<OrderLine>): OrderLine => ({ id: "p-latte", name: "Latte", qty: 1, kind: "item", mods: {}, ...over });

describe("findMergeIndex", () => {
  it("merges a twin: same product, same mods, same person", () => {
    const order = [line({ customer: "Juan" })];
    expect(findMergeIndex(order, { id: "p-latte", kind: "item", customer: "Juan" })).toBe(0);
  });
  it("keeps the same drink for two people on separate lines", () => {
    const order = [line({ customer: "Juan" })];
    expect(findMergeIndex(order, { id: "p-latte", kind: "item", customer: "María" })).toBe(-1);
  });
  it("treats no person and a person as different keys", () => {
    const order = [line({})];
    expect(findMergeIndex(order, { id: "p-latte", kind: "item", customer: "Juan" })).toBe(-1);
    expect(findMergeIndex(order, { id: "p-latte", kind: "item" })).toBe(0);
    expect(findMergeIndex(order, { id: "p-latte", kind: "item", customer: null })).toBe(0);
  });
  it("does not merge different mods for the same person", () => {
    const order = [line({ customer: "Juan", mods: { size: "Grande" } })];
    expect(findMergeIndex(order, { id: "p-latte", kind: "item", customer: "Juan", mods: { size: "Mediano" } })).toBe(-1);
    expect(findMergeIndex(order, { id: "p-latte", kind: "item", customer: "Juan", mods: { size: "Grande" } })).toBe(0);
  });
  it("never merges into a missing snapshot line", () => {
    const order = [line({ missing: true })];
    expect(findMergeIndex(order, { id: "p-latte", kind: "item" })).toBe(-1);
  });
  it("never merges combos", () => {
    const order = [line({ id: "cb-1", kind: "combo" })];
    expect(findMergeIndex(order, { id: "cb-1", kind: "combo" })).toBe(-1);
  });
  it("finds the right twin among several lines", () => {
    const order = [line({ customer: "Juan" }), line({ customer: "María" }), line({ id: "p-tinto", customer: "María" })];
    expect(findMergeIndex(order, { id: "p-tinto", kind: "item", customer: "María" })).toBe(2);
  });
});
