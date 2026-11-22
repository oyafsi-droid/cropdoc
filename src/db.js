// Saved checks live on the phone/laptop so they work with no data.
function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("cropdoc", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("checks", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("checks", mode);
    const req = fn(tx.objectStore("checks"));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const saveCheck = (check) => run("readwrite", (s) => s.put(check));
export const allChecks = () => run("readonly", (s) => s.getAll());
