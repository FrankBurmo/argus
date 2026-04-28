"use strict";

/**
 * Kjører `fn` over `items` med begrenset antall samtidige workers.
 * Returnerer resultatene i samme rekkefølge som `items`.
 */
async function pooledMap(items, fn, concurrency) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

module.exports = pooledMap;
