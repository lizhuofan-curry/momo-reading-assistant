import { copyFile, mkdir } from "node:fs/promises";

const vendor = new URL("./public/vendor/", import.meta.url);
await mkdir(vendor, { recursive: true });
await copyFile(new URL("./node_modules/pdfjs-dist/build/pdf.mjs", import.meta.url), new URL("pdf.mjs", vendor));
await copyFile(new URL("./node_modules/pdfjs-dist/build/pdf.worker.mjs", import.meta.url), new URL("pdf.worker.mjs", vendor));
await copyFile(new URL("./node_modules/mammoth/mammoth.browser.min.js", import.meta.url), new URL("mammoth.browser.min.js", vendor));

