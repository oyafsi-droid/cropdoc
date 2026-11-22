import { quickCheck, confirmCheck, offlineAIStatus, downloadOfflineAI, speech } from "./ai.js";
import { parseJson } from "./parse.js";
import { saveCheck, allChecks } from "./db.js";

const $ = (sel) => document.querySelector(sel);
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const list = (items) => `<ul>${(items || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
const when = (t) => new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

const icon = {
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="4"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4m0 0-5 5m5-5 5 5M4 20h16"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
  speak: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 9V3h10v6M7 17H4v-8h16v8h-3M7 14h10v7H7z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m5 12 5 5L20 7"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 2 20h20zM12 10v4M12 17v.5"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19l8-8"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v12m0 0-5-5m5 5 5-5M4 20h16"/></svg>',
};

// ---------- Settings ----------
const langSelect = $("#lang");
try { langSelect.value = localStorage.getItem("cropdoc-lang") || "English"; } catch {}
langSelect.addEventListener("change", () => {
  try { localStorage.setItem("cropdoc-lang", langSelect.value); } catch {}
  const label = document.getElementById("lang-name");
  if (label) label.textContent = langSelect.value;
});

// ---------- AI steps ----------
// Shrink phone photos (often 4-12 MB) to a JPEG the models accept and storage can hold.
async function toJpegBase64(file, max = 768) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

async function runQuick(check) {
  delete check.error;
  try {
    const { text, source } = await quickCheck(check.image);
    check.quick = parseJson(text);
    check.source = source;
  } catch (err) {
    check.error = navigator.onLine
      ? `Could not check this photo: ${err.message}`
      : "You're offline and the offline AI isn't downloaded on this device yet. The photo is saved — tap Try again when you have data.";
  }
  await saveCheck(check);
}

async function confirm(check) {
  if (!navigator.onLine || check.confirmed || !check.quick || check.quick.healthy) return;
  try {
    check.confirmed = parseJson(await confirmCheck(check.image, check.quick, check.lang));
    delete check.confirmError;
  } catch (e) {
    console.warn("Confirm failed, will retry when online", e); // stays pending; retried on next 'online' or reload
    check.confirmError = e.message;
  }
  await saveCheck(check);
}

// Refresh the screen after a background confirmation, without jumping to the top.
const rerenderIfShowing = (id) => {
  if (location.hash === `#/check/${id}` || location.hash.startsWith("#/history")) route(false);
};

async function confirmPending() {
  for (const c of await allChecks()) {
    const before = !!c.confirmed;
    await confirm(c);
    if (!before && c.confirmed) rerenderIfShowing(c.id);
  }
}

// ---------- Status of both AI engines ----------
let offlineStatus = "unavailable";
async function updateEngine() {
  offlineStatus = await offlineAIStatus().catch(() => "unavailable");
  const pill = $("#engine-pill");
  const onDevice = offlineStatus === "available";
  pill.textContent = `${navigator.onLine ? "Online" : "Offline"} · ${onDevice ? "Offline AI ready" : "Cloud AI"}`;
  pill.classList.toggle("off", !navigator.onLine && !onDevice);
  const banner = $("#engine");
  if (banner) banner.outerHTML = engineBanner();
  bindEngine();
}

function engineBanner() {
  const online = navigator.onLine;
  const onDevice = offlineStatus === "available";
  const canDownload = ["downloadable", "downloading"].includes(offlineStatus);
  const line = onDevice
    ? "On-device AI ready — checks work with zero data. Cloud AI confirms and translates when online."
    : canDownload
      ? "Cloud AI is answering. Download the offline AI once on Wi-Fi so checks work with no data."
      : "Cloud AI is answering. Offline AI isn't supported in this browser — it works in Chrome on a computer.";
  return `<div class="engine" id="engine">
    <span class="dot ${online || onDevice ? "" : "amber"}"></span>
    <div><strong>Hybrid AI: ${online ? "Cloud online" : "No internet"} · ${onDevice ? "Offline AI ready" : "Offline AI not ready"}</strong><span class="muted">${line}</span></div>
    ${canDownload ? `<button type="button" class="btn-outline" id="offline-ai">${icon.download} Download offline AI</button>` : ""}
  </div>`;
}

function bindEngine() {
  const btn = $("#offline-ai");
  if (!btn) return;
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      await downloadOfflineAI((p) => (btn.lastChild.textContent = ` Downloading… ${Math.round(p * 100)}%`));
    } catch (err) {
      console.warn(err);
      btn.disabled = false;
      btn.lastChild.textContent = " Download failed — try again";
      return;
    }
    updateEngine();
  };
}

// ---------- Listen: natural Gemini voice, saved with the check so it replays offline ----------
let player = null;
function stopVoice() {
  player?.close();
  player = null;
  document.querySelectorAll("#speak span").forEach((el) => (el.textContent = el.dataset.label));
}

async function speak(check, btn) {
  if (player) return stopVoice();
  const label = btn.querySelector("span");
  const f = check.confirmed, q = check.quick;
  const key = f ? "voice" : "voiceQuick";
  const lang = f ? check.lang : "English";
  // Create audio now, inside the tap, so the browser allows playback after the wait.
  const ctx = new AudioContext({ sampleRate: 24000 });
  if (!check[key]) {
    if (!navigator.onLine) { ctx.close(); return alert("Listening needs data the first time. After that, this answer plays even offline."); }
    const parts = f
      ? [f.problem, f.explanation, "Treatment.", ...(f.treatment || []), "Prevention.", ...(f.prevention || [])]
      : [q.healthy ? "Your plant looks healthy." : `Likely ${q.problem}.`, q.signs, "Do this now.", ...(q.first_steps || [])];
    btn.disabled = true;
    label.textContent = "Preparing voice…";
    try {
      check[key] = await speech(parts.filter(Boolean).join(" "), lang);
      await saveCheck(check);
    } catch (err) {
      ctx.close();
      btn.disabled = false;
      label.textContent = label.dataset.label;
      return alert(`Couldn't create the voice: ${err.message}`);
    }
    btn.disabled = false;
  }
  const bytes = Uint8Array.from(atob(check[key]), (c) => c.charCodeAt(0));
  const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  const buf = ctx.createBuffer(1, pcm.length, 24000);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.onended = stopVoice;
  src.start();
  player = ctx;
  label.textContent = "Stop";
}

// ---------- Shared pieces ----------
function kind(c) {
  if (c.error) return "error";
  if (c.confirmed?.see_expert) return "expert";
  if (c.quick && !c.quick.healthy) return "problem";
  return "healthy";
}
const title = (c) => c.error ? "Not checked yet" : c.quick?.healthy ? "Looks healthy" : (c.confirmed?.problem || c.quick?.problem || "Checking…");
const sourceChip = (c) => c.source === "on_device"
  ? `<span class="chip">${icon.leaf} On this device</span>`
  : c.source ? `<span class="chip blue">${icon.cloud} Cloud AI</span>` : "";
function statusChip(c) {
  if (c.error) return `<span class="chip red">Not checked</span>`;
  if (c.quick?.healthy) return `<span class="chip">Healthy</span>`;
  if (c.confirmed) return `<span class="chip">${icon.check} Confirmed</span>`;
  return `<span class="chip amber">Waiting for data</span>`;
}
const checkCard = (c) => `<a class="check-card ${kind(c)}" href="#/check/${c.id}">
  <img src="data:image/jpeg;base64,${c.image}" alt="Plant photo" />
  <div>
    <small class="muted">${when(c.date)}</small>
    <h3>${esc(title(c))}</h3>
    <p>${c.quick ? `${esc(c.quick.crop)} · ${esc(c.quick.confidence)} confidence` : ""}</p>
    <div class="meta">${statusChip(c)}${sourceChip(c)}${c.followedUp ? `<span class="chip dark">${icon.check} Followed up</span>` : ""}</div>
  </div></a>`;

const sorted = async () => (await allChecks()).sort((a, b) => b.date - a.date);

// ---------- Diagnose screen ----------
let photo = null; // { base64, name }

async function diagnoseView() {
  const recent = (await sorted()).slice(0, 3);
  app.innerHTML = `
  <section class="hero">
    <div>
      <span class="chip dark">Hybrid AI</span> <span class="chip">Works offline</span>
      <h1>Plant Diagnostic Center</h1>
      <p>Take or upload a photo of a sick leaf, stem or fruit. CropDoc gives a quick answer on your device — even with no data — then confirms it with cloud AI in your language.</p>
    </div>
  </section>
  <div class="grid">
    <div>
      <form class="card" id="diagnose">
        <div class="card-head"><h2>${icon.camera} Plant photo</h2>${photo ? '<span class="chip">Photo ready</span>' : ""}</div>
        <figure class="viewfinder" style="margin:0">
          ${photo ? `<img src="data:image/jpeg;base64,${photo.base64}" alt="Your plant photo" /><figcaption>${esc(photo.name)}</figcaption>`
                  : `<div class="empty">${icon.leaf}<p><strong>No photo yet</strong><br/>Fill the frame with the sick part of the plant.</p></div>`}
          <span class="corners"></span>
        </figure>
        <div class="row" style="margin-top:12px" id="photo-actions">
          <button type="button" class="btn-soft" id="take">${icon.camera} Take photo</button>
          <input id="cam" type="file" accept="image/*" capture="environment" hidden />
          <label class="btn btn-soft">${icon.upload} Upload photo<input id="file" type="file" accept="image/jpeg,image/png" hidden /></label>
        </div>
        <p class="muted small" style="margin:16px 0">Answers come in <strong id="lang-name">${esc(langSelect.value)}</strong>. Change the language at the top of the page.</p>
        <button class="btn-primary" id="go" type="submit" ${photo ? "" : "disabled"}>${icon.spark} Diagnose crop now</button>
        <p class="status" id="status" role="status" aria-live="polite"></p>
      </form>
      ${engineBanner()}
    </div>
    <aside class="card tips">
      <h2>${icon.leaf} Photo tips for the field</h2>
      <p class="muted small">For the most accurate answer in bright sunlight:</p>
      <ul>
        <li><span><strong>Shade the leaf</strong> with your body to stop glare.</span></li>
        <li><span><strong>Show sick and healthy parts</strong> together in the frame.</span></li>
        <li><span><strong>Hold 15–20 cm away</strong> and keep steady until the photo is sharp.</span></li>
        <li><span><strong>One plant problem per photo.</strong> Take another photo for a different plant.</span></li>
      </ul>
    </aside>
  </div>
  <div class="section-head">
    <div><h2>Recent checks</h2><p class="muted small" style="margin:4px 0 0">Saved on this device. Waiting checks are confirmed automatically when you're online.</p></div>
    ${recent.length ? `<a class="btn btn-soft" href="#/history">View all checks →</a>` : ""}
  </div>
  <div class="checks">${recent.map(checkCard).join("") || `<p class="empty-state">No checks yet. Your first diagnosis will appear here.</p>`}</div>`;

  bindEngine();
  $("#take").addEventListener("click", openCamera);
  for (const id of ["#cam", "#file"]) {
    $(id).addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      photo = { base64: await toJpegBase64(f), name: f.name };
      diagnoseView();
    });
  }
  $("#diagnose").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!photo) return;
    $("#go").disabled = true;
    $("#status").textContent = "Looking at your plant…";
    const check = { id: crypto.randomUUID(), date: Date.now(), lang: langSelect.value, image: photo.base64 };
    await runQuick(check);
    photo = null;
    location.hash = `#/check/${check.id}`;
    await confirm(check);
    rerenderIfShowing(check.id);
  });
}

// Live camera inside the photo frame. Works on laptops (webcam) and phones (back camera).
let camStream = null;
const stopCamera = () => { camStream?.getTracks().forEach((t) => t.stop()); camStream = null; };

async function openCamera() {
  // No camera API (old browser): use the phone's own camera app via the file picker.
  if (!navigator.mediaDevices?.getUserMedia) return $("#cam").click();
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
  } catch (err) {
    $("#status").textContent = err.name === "NotAllowedError"
      ? "Camera permission was blocked. Allow the camera in your browser settings, or use Upload photo."
      : "No camera found on this device. Use Upload photo instead.";
    $("#status").classList.add("err");
    return;
  }
  const vf = $(".viewfinder");
  vf.innerHTML = `<video autoplay playsinline muted aria-label="Camera preview"></video><span class="corners"></span>`;
  const video = vf.querySelector("video");
  video.srcObject = camStream;
  $("#photo-actions").innerHTML = `<button type="button" class="btn-green" id="snap">${icon.camera} Capture photo</button>
    <button type="button" class="btn-soft" id="cancel-cam">Cancel</button>`;
  $("#snap").onclick = async () => {
    if (!video.videoWidth) return; // camera still starting
    photo = { base64: await toJpegBase64(video), name: "Camera photo" };
    stopCamera();
    diagnoseView();
  };
  $("#cancel-cam").onclick = () => { stopCamera(); diagnoseView(); };
}

// ---------- Check detail screen ----------
async function detailView(id) {
  const c = (await allChecks()).find((x) => x.id === id);
  if (!c) { app.innerHTML = `<p class="empty-state">That check wasn't found. <a href="#/history">See all checks</a></p>`; return; }
  const q = c.quick, f = c.confirmed;
  const done = c.done || [];

  let body;
  if (c.error) {
    body = `<div class="banner red">${icon.alert}<div><strong>This photo wasn't checked.</strong><br/>${esc(c.error)}</div></div>
      <button class="btn-primary" id="retry" style="margin-top:16px">${icon.spark} Try again</button>`;
  } else {
    const steps = q.healthy ? "" : `<section class="card">
        <div class="card-head"><h2>${icon.alert} Do this now</h2><span class="chip amber">Safe first steps</span></div>
        <ul class="todo">${(q.first_steps || []).map((s, i) => `<li><label><input type="checkbox" data-step="${i}" ${done[i] ? "checked" : ""}/><span>${esc(s)}</span></label></li>`).join("")}</ul>
      </section>`;
    const confirmed = f ? `<section class="card confirmed">
        <span class="chip">${icon.check} Confirmed · ${esc(c.lang)}</span>
        <h3>${esc(f.problem)}</h3>
        ${f.agrees === false ? `<p class="small"><strong>Note:</strong> the cloud AI corrected the first quick answer.</p>` : ""}
        <p>${esc(f.explanation)}</p>
        <h4>Treatment</h4>${list(f.treatment)}
        <h4>Prevention</h4>${list(f.prevention)}
        ${f.see_expert ? `<div class="banner red">${icon.alert}<div><strong>Please show this plant to your nearest ADP extension officer.</strong> The AI isn't fully sure.</div></div>` : ""}
      </section>`
      : q.healthy ? ""
      : navigator.onLine && c.confirmError
        ? `<div class="banner red">${icon.alert}<div><strong>Couldn't confirm yet.</strong><br/>${esc(c.confirmError)}<br/><button class="btn-outline" id="reconfirm" style="margin-top:10px">${icon.cloud} Try again</button></div></div>`
        : `<div class="banner amber">${icon.cloud}<div><strong>${navigator.onLine ? "Confirming with cloud AI…" : "Saved on this device."}</strong><br/>${navigator.onLine ? "Treatment and prevention will appear here in a moment." : "Treatment and prevention will appear automatically when you have data."}</div></div>`;
    body = `<div class="grid">
      <div>${steps}${q.healthy ? `<div class="banner blue">${icon.check}<div><strong>No disease found.</strong> ${esc(q.signs)}</div></div>` : ""}
        <div class="banner blue">${icon.alert}<div><strong>Stay safe with any spray:</strong> follow the product label, wear gloves and a nose mask, and keep sprays away from wells and children.</div></div>
      </div>
      <div>${confirmed}</div>
    </div>`;
  }

  app.innerHTML = `
  <nav class="crumbs" aria-label="Breadcrumb"><a href="#/history">My Checks</a> › <span>${when(c.date)}</span> ${statusChip(c)} ${sourceChip(c)}</nav>
  <section class="card">
    <div class="diag-head">
      <img src="data:image/jpeg;base64,${c.image}" alt="Plant photo" />
      <div>
        ${q && !q.healthy ? `<span class="chip ${f?.see_expert ? "red" : "amber"}">${f?.see_expert ? "See an expert" : "Problem found"}</span>` : ""}
        <h1>${q ? (q.healthy ? "Looks healthy" : `Likely: ${esc(f?.problem || q.problem)}`) : "Not checked yet"}</h1>
        ${q ? `<div class="facts"><span>Crop: <strong>${esc(f?.crop || q.crop)}</strong></span><span>Confidence: <strong>${esc(f?.confidence || q.confidence)}</strong></span></div>
               <p class="muted" style="margin:8px 0 0">${esc(q.signs)}</p>` : ""}
        ${q ? `<div class="actions">
          <button class="btn-green" id="speak">${icon.speak} <span data-label="Listen${f ? ` (${esc(c.lang)})` : ""}">Listen${f ? ` (${esc(c.lang)})` : ""}</span></button>
          <button class="btn-soft" id="print">${icon.print} Save as PDF</button>
          ${q.healthy ? "" : `<button class="btn-outline" id="follow">${icon.check} ${c.followedUp ? "Followed up ✓" : "Mark as followed up"}</button>`}
        </div>` : ""}
      </div>
    </div>
  </section>
  <div style="margin-top:16px">${body}</div>`;

  $("#retry")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = "Looking at your plant…";
    await runQuick(c);
    await detailView(id);
    await confirm(c);
    rerenderIfShowing(id);
  });
  $("#reconfirm")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.lastChild.textContent = " Confirming…";
    await confirm(c);
    detailView(id);
  });
  $("#speak")?.addEventListener("click", (e) => speak(c, e.currentTarget));
  $("#print")?.addEventListener("click", () => print());
  $("#follow")?.addEventListener("click", async () => { c.followedUp = !c.followedUp; await saveCheck(c); detailView(id); });
  app.querySelectorAll("[data-step]").forEach((box) => box.addEventListener("change", async () => {
    c.done = c.done || [];
    c.done[box.dataset.step] = box.checked;
    await saveCheck(c);
  }));
}

// ---------- My Checks screen ----------
let filter = { text: "", status: "all" };
const matches = (c) => {
  const k = kind(c);
  const ok = filter.status === "all"
    || (filter.status === "problems" && (k === "problem" || k === "expert"))
    || (filter.status === "healthy" && k === "healthy")
    || (filter.status === "waiting" && k !== "healthy" && k !== "error" && !c.confirmed)
    || (filter.status === "followed" && c.followedUp);
  const hay = `${c.quick?.crop} ${c.quick?.problem} ${c.confirmed?.problem}`.toLowerCase();
  return ok && hay.includes(filter.text.toLowerCase());
};

function exportCsv(checks) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Date", "Crop", "Quick answer", "Confidence", "Confirmed answer", "Language", "Answered by", "Followed up"],
    ...checks.map((c) => [new Date(c.date).toISOString(), c.quick?.crop, c.quick?.healthy ? "healthy" : c.quick?.problem, c.quick?.confidence,
      c.confirmed?.problem, c.lang, c.source === "on_device" ? "on device" : "cloud", c.followedUp ? "yes" : "no"])];
  const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: "cropdoc-checks.csv" }).click();
  URL.revokeObjectURL(url);
}

async function historyView() {
  const checks = await sorted();
  const problems = checks.filter((c) => ["problem", "expert"].includes(kind(c)));
  const counts = {};
  for (const c of problems) { const p = (c.confirmed?.problem || c.quick.problem).toLowerCase(); counts[p] = (counts[p] || 0) + 1; }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const waiting = problems.filter((c) => !c.confirmed).length;

  app.innerHTML = `
  <section class="hero">
    <div><span class="chip">Saved on this device</span><h1>My Checks & Farm History</h1><p>Every photo you've checked, with the answer and what you've done about it.</p></div>
    <div class="row" style="align-self:end; flex:0 1 auto">
      <button class="btn-soft" id="csv" ${checks.length ? "" : "disabled"}>${icon.download} Export CSV</button>
      <a class="btn btn-green" href="#/">${icon.camera} New check</a>
    </div>
  </section>
  <div class="stats">
    <div class="stat"><small>Total checks</small><b>${checks.length}</b></div>
    <div class="stat"><small>Problems found</small><b>${problems.length}</b></div>
    <div class="stat"><small>Most common problem</small><b class="word">${top ? esc(top[0]) : "—"}</b></div>
    <div class="stat"><small>Waiting for data</small><b>${waiting}</b></div>
  </div>
  <div class="filters">
    <input type="search" id="q" placeholder="Search by crop or disease, e.g. cassava" value="${esc(filter.text)}" aria-label="Search checks" />
    <select id="st" aria-label="Filter checks">
      <option value="all">All checks</option><option value="problems">Problems found</option><option value="healthy">Healthy</option>
      <option value="waiting">Waiting for data</option><option value="followed">Followed up</option>
    </select>
  </div>
  <div class="checks list" id="hist"></div>`;

  const draw = () => {
    const shown = checks.filter(matches);
    $("#hist").innerHTML = shown.map(checkCard).join("") || `<p class="empty-state">${checks.length ? "No checks match your search." : "No checks yet. <a href='#/'>Check your first plant</a>."}</p>`;
  };
  $("#st").value = filter.status;
  $("#q").addEventListener("input", (e) => { filter.text = e.target.value; draw(); });
  $("#st").addEventListener("change", (e) => { filter.status = e.target.value; draw(); });
  $("#csv").addEventListener("click", () => exportCsv(checks));
  draw();
}

// ---------- Router ----------
async function route(scrollTop = true) {
  stopVoice();
  stopCamera();
  const h = location.hash;
  document.querySelectorAll("[data-nav]").forEach((a) =>
    a.classList.toggle("active", (a.dataset.nav === "history") === (h.startsWith("#/history") || h.startsWith("#/check/"))));
  if (h.startsWith("#/check/")) await detailView(h.slice(8));
  else if (h.startsWith("#/history")) await historyView();
  else await diagnoseView();
  if (scrollTop) window.scrollTo(0, 0);
}

addEventListener("hashchange", () => route());
addEventListener("online", () => { updateEngine(); confirmPending(); });
addEventListener("offline", () => { updateEngine(); route(false); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");

route().then(updateEngine);
confirmPending();