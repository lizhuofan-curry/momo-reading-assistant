import { copyFile, mkdir, readFile } from "node:fs/promises";

async function copyIfChanged(source, destination) {
  try {
    const [next, current] = await Promise.all([readFile(source), readFile(destination)]);
    if (next.equals(current)) return;
  } catch { /* destination does not exist yet */ }
  await copyFile(source, destination);
}

const vendor = new URL("./public/vendor/", import.meta.url);
await mkdir(vendor, { recursive: true });
await copyIfChanged(new URL("./node_modules/pdfjs-dist/build/pdf.mjs", import.meta.url), new URL("pdf.mjs", vendor));
await copyIfChanged(new URL("./node_modules/pdfjs-dist/build/pdf.worker.mjs", import.meta.url), new URL("pdf.worker.mjs", vendor));
await copyIfChanged(new URL("./node_modules/mammoth/mammoth.browser.min.js", import.meta.url), new URL("mammoth.browser.min.js", vendor));

const tesseract = new URL("tesseract/", vendor);
const tesseractCore = new URL("core/", tesseract);
const tesseractLang = new URL("lang/", tesseract);
await Promise.all([
  mkdir(tesseractCore, { recursive: true }),
  mkdir(tesseractLang, { recursive: true })
]);
await Promise.all([
  copyIfChanged(new URL("./node_modules/tesseract.js/dist/tesseract.min.js", import.meta.url), new URL("tesseract.min.js", tesseract)),
  copyIfChanged(new URL("./node_modules/tesseract.js/dist/worker.min.js", import.meta.url), new URL("worker.min.js", tesseract)),
  copyIfChanged(new URL("./node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz", import.meta.url), new URL("eng.traineddata.gz", tesseractLang)),
  ...[
    "tesseract-core.wasm.js",
    "tesseract-core-lstm.wasm.js",
    "tesseract-core-simd.wasm.js",
    "tesseract-core-simd-lstm.wasm.js",
    "tesseract-core-relaxedsimd.wasm.js",
    "tesseract-core-relaxedsimd-lstm.wasm.js"
  ].map(file => copyIfChanged(new URL(`./node_modules/tesseract.js-core/${file}`, import.meta.url), new URL(file, tesseractCore)))
]);
