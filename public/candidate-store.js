export const CANDIDATE_KEY = "momo_candidate_words";
export const SYNCED_KEY = "momo_synced_words";
const MAX_CANDIDATES = 200;
const VALID_WORD = /^[A-Za-z][A-Za-z'-]{1,49}$/;

function read(key, storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function normalizeCandidate(value) {
  const lemma = String(value?.lemma || value?.word || "").trim().toLowerCase();
  if (!VALID_WORD.test(lemma)) return null;
  return {
    lemma,
    word: String(value?.word || lemma).trim().slice(0, 50),
    meaning: String(value?.meaning || "").trim().slice(0, 160),
    sentence: String(value?.sentence || "").replace(/\s+/g, " ").trim().slice(0, 500),
    source: String(value?.source || "手动收藏").trim().slice(0, 40),
    addedAt: Number(value?.addedAt) || Date.now()
  };
}

export function listCandidates(storage = localStorage) {
  const seen = new Set();
  return read(CANDIDATE_KEY, storage).flatMap(item => {
    const normalized = normalizeCandidate(item);
    if (!normalized || seen.has(normalized.lemma)) return [];
    seen.add(normalized.lemma);
    return [normalized];
  }).slice(0, MAX_CANDIDATES);
}

export function addCandidate(value, storage = localStorage) {
  const item = normalizeCandidate(value);
  if (!item) throw new Error("只能收藏有效的英文单词。");
  const current = listCandidates(storage);
  const existing = current.find(candidate => candidate.lemma === item.lemma);
  const next = existing
    ? current.map(candidate => candidate.lemma === item.lemma ? { ...candidate, ...item, addedAt: candidate.addedAt } : candidate)
    : [item, ...current].slice(0, MAX_CANDIDATES);
  storage.setItem(CANDIDATE_KEY, JSON.stringify(next));
  return { item, added: !existing, count: next.length };
}

export function removeCandidate(lemma, storage = localStorage) {
  const normalized = String(lemma || "").toLowerCase();
  const next = listCandidates(storage).filter(item => item.lemma !== normalized);
  storage.setItem(CANDIDATE_KEY, JSON.stringify(next));
  return next;
}

export function clearCandidates(storage = localStorage) {
  storage.removeItem(CANDIDATE_KEY);
}

export function listSynced(storage = localStorage) {
  return [...new Set(read(SYNCED_KEY, storage).map(value => String(value).trim().toLowerCase()).filter(value => VALID_WORD.test(value)))].slice(0, 2000);
}

export function rememberSynced(words, storage = localStorage) {
  const incoming = (Array.isArray(words) ? words : []).map(value => String(value).trim().toLowerCase()).filter(value => VALID_WORD.test(value));
  const next = [...new Set([...listSynced(storage), ...incoming])].slice(-2000);
  storage.setItem(SYNCED_KEY, JSON.stringify(next));
  return next;
}

export function duplicateSummary(words, storage = localStorage) {
  const seen = new Set();
  const synced = new Set(listSynced(storage));
  const duplicateInput = [];
  const previouslySynced = [];
  const unique = [];
  for (const value of Array.isArray(words) ? words : []) {
    const word = String(value || "").trim().toLowerCase();
    if (!VALID_WORD.test(word)) continue;
    if (seen.has(word)) { duplicateInput.push(word); continue; }
    seen.add(word);
    unique.push(word);
    if (synced.has(word)) previouslySynced.push(word);
  }
  return { unique, duplicateInput, previouslySynced };
}
