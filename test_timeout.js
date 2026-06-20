const TIMEOUT_MS = 6000;

async function run() {
  const start = Date.now();
  try {
    await Promise.race([
      new Promise(r => setTimeout(r, 10000)), // Simulate hanging fetch
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), TIMEOUT_MS))
    ]);
  } catch (err) {
    console.log("Caught:", err.message);
  }
  console.log("Finished in", Date.now() - start, "ms");
}

run();
