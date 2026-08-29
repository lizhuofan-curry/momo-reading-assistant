import test from "node:test";
import assert from "node:assert/strict";
import { addCandidate, duplicateSummary, listCandidates, rememberSynced, removeCandidate } from "../public/candidate-store.js";

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test("candidate box merges the same lemma and keeps richer latest context", () => {
  const store = storage();
  assert.equal(addCandidate({ word: "Robust", meaning: "稳健的" }, store).added, true);
  assert.equal(addCandidate({ word: "robust", lemma: "robust", meaning: "鲁棒的", sentence: "The method is robust." }, store).added, false);
  assert.equal(listCandidates(store).length, 1);
  assert.equal(listCandidates(store)[0].meaning, "鲁棒的");
  removeCandidate("robust", store);
  assert.equal(listCandidates(store).length, 0);
});

test("sync preflight distinguishes repeated input and previously synced words", () => {
  const store = storage();
  rememberSynced(["robust", "temporal"], store);
  const result = duplicateSummary(["Robust", "robust", "representation"], store);
  assert.deepEqual(result.unique, ["robust", "representation"]);
  assert.deepEqual(result.duplicateInput, ["robust"]);
  assert.deepEqual(result.previouslySynced, ["robust"]);
});
