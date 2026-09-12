// test-search.js
import { ddgSearch } from "./search.js";

const hits = await ddgSearch("SharedOS npm package", 5);
console.log(`Got ${hits.length} results`);
for (const h of hits) {
  console.log("\n-", h.title);
  console.log(" ", h.url);
  console.log(" ", h.snippet.slice(0, 150));
}