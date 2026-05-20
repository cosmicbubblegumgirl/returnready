const RETURN_READY = {
  slug: "returnready",
  users: [
    { id: "u-1", name: "Simone Govender", email: "simone@returnready.demo", password: "demo123", role: "Product designer" },
    { id: "u-2", name: "Warehouse Lead", email: "warehouse@returnready.demo", password: "returns123", role: "Reverse logistics lead" }
  ],
  wizard: [
    { title: "Choose the item", body: "Show order items, return window, category rules, and whether the item can be exchanged." },
    { title: "Explain the reason", body: "Plain-language reason codes help support teams understand intent without a message thread." },
    { title: "Capture evidence", body: "Photo prompts make warehouse inspection faster and reduce avoidable support follow-up." },
    { title: "Pick a resolution", body: "ReturnReady recommends exchange, refund, repair, or support review from the return context." }
  ]
};

const keys = {
  theme: "returnready-theme",
  session: "returnready-session",
  saved: "returnready-saved-runs",
  db: "returnready-local-db"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  }[char]));
}

function routeFor(score, status = "") {
  const text = status.toLowerCase();
  if (text.includes("photo") || Number(score) < 58) return "support";
  if (text.includes("label") || text.includes("intake") || Number(score) > 84) return "warehouse";
  return "exchange";
}

function routeLabel(score, status = "") {
  return { support: "Support review", exchange: "Exchange ready", warehouse: "Warehouse intake" }[routeFor(score, status)];
}

function getTheme() {
  return localStorage.getItem(keys.theme) || "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const button = $("[data-theme-toggle]");
  if (button) button.textContent = theme === "dark" ? "Light" : "Dark";
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(keys.session) || "null");
  } catch {
    return null;
  }
}

function setSession(user) {
  if (user) {
    localStorage.setItem(keys.session, JSON.stringify({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      signedInAt: new Date().toISOString()
    }));
  } else {
    localStorage.removeItem(keys.session);
  }
  renderSession();
}

function renderSession() {
  const session = getSession();
  $$("[data-session-pill]").forEach((item) => {
    item.textContent = session ? session.name : "Guest";
  });
  $$("[data-session-detail]").forEach((item) => {
    item.innerHTML = session
      ? `<p><strong>${escapeHtml(session.name)}</strong><br>${escapeHtml(session.role)}<br>${escapeHtml(session.email)}</p>`
      : "<p>No active session.</p>";
  });
  $$("[data-auth-required]").forEach((item) => item.classList.toggle("is-locked", !session));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function getData() {
  try {
    return await fetchJson("/api/data", { cache: "no-store" });
  } catch {
    return fetchJson("api/data.json", { cache: "no-store" });
  }
}

function normalizeRecord(record, index = 0) {
  const score = Number(record.score || 72);
  return {
    id: record.id || `returnready-local-${Date.now()}-${index}`,
    title: record.title || "Return request",
    status: record.status || routeLabel(score),
    owner: record.owner || "Returns desk",
    score,
    trend: record.trend || routeLabel(score, record.status),
    updated: record.updated || "just now",
    demoSeed: record.demoSeed === true
  };
}

function savedRuns() {
  try {
    return JSON.parse(localStorage.getItem(keys.saved) || "[]");
  } catch {
    return [];
  }
}

function setSavedRuns(records) {
  localStorage.setItem(keys.saved, JSON.stringify(records.slice(0, 12)));
}

function localDb() {
  try {
    return JSON.parse(localStorage.getItem(keys.db) || "[]");
  } catch {
    return [];
  }
}

function setLocalDb(records) {
  localStorage.setItem(keys.db, JSON.stringify(records));
}

function ensureDb(records) {
  if (!localStorage.getItem(keys.db)) {
    setLocalDb(records.map(normalizeRecord));
  }
}

function returnCard(record) {
  const item = normalizeRecord(record);
  const route = routeFor(item.score, item.status);
  return `<article class="return-card ${route}">
    <header><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.updated)}</small></header>
    <p>${escapeHtml(item.status)} assigned to ${escapeHtml(item.owner)}.</p>
    <progress max="100" value="${item.score}"></progress>
    <div class="tags"><span>${routeLabel(item.score, item.status)}</span><span>${item.score}% confidence</span><span>${escapeHtml(item.trend)}</span></div>
  </article>`;
}

function renderMetrics(records) {
  const total = records.length;
  const exchange = records.filter((record) => routeFor(record.score, record.status) === "exchange").length;
  const warehouse = records.filter((record) => routeFor(record.score, record.status) === "warehouse").length;
  const support = records.filter((record) => routeFor(record.score, record.status) === "support").length;
  const metrics = [
    { label: "Return records", value: String(total), delta: "100 seeded" },
    { label: "Exchange ready", value: String(exchange), delta: "revenue saved" },
    { label: "Warehouse intake", value: String(warehouse), delta: "labels ready" },
    { label: "Support review", value: String(support), delta: "needs context" }
  ];
  $$("[data-kpis]").forEach((target) => {
    target.innerHTML = metrics.map((metric) => `<article class="metric-card"><span>${metric.label}</span><strong>${metric.value}</strong><p>${metric.delta}</p></article>`).join("");
  });
}

function renderLanes(records) {
  const normalized = records.map(normalizeRecord).sort((a, b) => b.score - a.score);
  const lanes = {
    support: normalized.filter((item) => routeFor(item.score, item.status) === "support"),
    exchange: normalized.filter((item) => routeFor(item.score, item.status) === "exchange"),
    warehouse: normalized.filter((item) => routeFor(item.score, item.status) === "warehouse")
  };
  Object.entries(lanes).forEach(([lane, items]) => {
    $$(`[data-lane="${lane}"]`).forEach((target) => {
      target.innerHTML = items.slice(0, 8).map(returnCard).join("");
    });
  });
}

function renderRecords(records) {
  const normalized = records.map(normalizeRecord).sort((a, b) => b.score - a.score);
  $$("[data-records]").forEach((target) => {
    target.dataset.records = JSON.stringify(normalized);
    target.innerHTML = normalized.slice(0, 18).map(returnCard).join("");
  });
  const top = normalized[0];
  if ($("[data-scan-code]")) $("[data-scan-code]").textContent = top ? top.id.toUpperCase() : "RR-000000";
  if ($("[data-route-result]")) $("[data-route-result]").textContent = top ? routeLabel(top.score, top.status) : "Exchange ready";
}

function renderCapacity(records) {
  const exchange = records.filter((record) => routeFor(record.score, record.status) === "exchange").length;
  const warehouse = records.filter((record) => routeFor(record.score, record.status) === "warehouse").length;
  const support = records.filter((record) => routeFor(record.score, record.status) === "support").length;
  const meters = [
    { label: "Dock capacity", value: Math.min(98, 42 + warehouse) },
    { label: "Exchange stock", value: Math.min(96, 50 + exchange) },
    { label: "Support queue", value: Math.min(100, 28 + support) }
  ];
  $$("[data-capacity]").forEach((target) => {
    target.innerHTML = meters.map((meter) => `<article class="capacity-meter"><strong>${meter.label}</strong><progress max="100" value="${meter.value}"></progress><small>${meter.value}%</small></article>`).join("");
  });
}

function renderActivity(data) {
  const activity = data.activity || [];
  $$("[data-live-panel]").forEach((target) => {
    target.innerHTML = activity.map((item) => `<article class="activity-card"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.kind)}</p><small>${escapeHtml(item.time)} ago</small></article>`).join("");
  });
}

function renderChart(records) {
  const top = records.map(normalizeRecord).sort((a, b) => b.score - a.score).slice(0, 14);
  $$("[data-chart]").forEach((target) => {
    target.innerHTML = top.map((item) => `<div class="chart-bar" style="width:${Math.max(28, item.score)}%">${item.score}% ${escapeHtml(item.title)}</div>`).join("");
  });
}

function renderApiPreview(data) {
  const preview = {
    product: "ReturnReady",
    backend: {
      githubPages: "api/data.json and api/users.json",
      localNode: "server/server.js exposes /api/health, /api/login, and /api/records"
    },
    database: "returnready_requests",
    records: (data.records || []).slice(0, 3)
  };
  $$("[data-api-preview]").forEach((target) => {
    target.textContent = JSON.stringify(preview, null, 2);
  });
}

function renderWizard(index = 0) {
  const step = RETURN_READY.wizard[index] || RETURN_READY.wizard[0];
  const stage = $("[data-wizard-stage]");
  if (!stage) return;
  stage.innerHTML = `<p class="eyebrow">Step ${index + 1}</p><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.body)}</p><div class="barcode">RR-FLOW-0${index + 1}</div>`;
  $$("[data-step]").forEach((button) => button.classList.toggle("active", Number(button.dataset.step) === index));
}

function setupWizard() {
  $$("[data-step]").forEach((button) => {
    button.addEventListener("click", () => renderWizard(Number(button.dataset.step)));
  });
  renderWizard(0);
}

function renderSavedRuns() {
  $$("[data-saved-records]").forEach((target) => {
    const rows = savedRuns();
    target.innerHTML = rows.length ? rows.map(returnCard).join("") : "<p>No saved resolution runs yet.</p>";
  });
}

function demoAverage() {
  const inputs = $$("[data-demo-input]");
  if (!inputs.length) return 0;
  return Math.round(inputs.reduce((sum, input) => sum + Number(input.value), 0) / inputs.length);
}

function calculateDemo() {
  const score = demoAverage();
  if (!score) return;
  const status = routeLabel(score);
  if ($("[data-demo-result]")) $("[data-demo-result]").textContent = `${score}%`;
  if ($("[data-outcome]")) $("[data-outcome]").textContent = status;
}

function renderDb() {
  const body = $("[data-db-rows]");
  if (!body) return;
  let rows = localDb().map(normalizeRecord);
  const query = ($("[data-db-search]")?.value || "").toLowerCase();
  const sort = $("[data-db-sort]")?.value || "score";
  if (query) {
    rows = rows.filter((item) => `${item.id} ${item.title} ${item.status} ${item.owner}`.toLowerCase().includes(query));
  }
  rows.sort((a, b) => {
    if (sort === "score") return b.score - a.score;
    if (sort === "title") return a.title.localeCompare(b.title);
    return a.status.localeCompare(b.status);
  });
  body.innerHTML = rows.slice(0, 100).map((item) => `<tr>
    <td>${escapeHtml(item.id)}</td>
    <td><strong>${escapeHtml(item.title)}</strong><br><small>${escapeHtml(item.updated)}</small></td>
    <td>${escapeHtml(item.status)}</td>
    <td>${escapeHtml(item.owner)}</td>
    <td>${item.score}%</td>
    <td><button type="button" data-delete-record="${escapeHtml(item.id)}">Delete</button></td>
  </tr>`).join("");
  $$("[data-delete-record]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!getSession()) {
        const status = $("[data-db-form-status]");
        if (status) status.textContent = "Sign in before deleting records.";
        return;
      }
      setLocalDb(localDb().filter((item) => item.id !== button.dataset.deleteRecord));
      renderDb();
    });
  });
}

function setupForms(data) {
  $$("[data-demo-input]").forEach((input) => input.addEventListener("input", calculateDemo));
  calculateDemo();

  $("[data-resolution-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const score = demoAverage();
    const row = normalizeRecord({
      id: `returnready-run-${Date.now()}`,
      title: "Resolution lab run",
      status: routeLabel(score),
      owner: getSession()?.name || "Guest resolver",
      score,
      trend: routeLabel(score),
      updated: "saved locally"
    });
    setSavedRuns([row, ...savedRuns()]);
    renderSavedRuns();
    const status = $("[data-form-status]");
    if (status) status.textContent = "Resolution run saved to browser storage.";
  });

  $("[data-db-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!getSession()) {
      const status = $("[data-db-form-status]");
      if (status) status.textContent = "Sign in before saving database records.";
      return;
    }
    const form = new FormData(event.currentTarget);
    const score = Number(form.get("score") || 86);
    const row = normalizeRecord({
      id: `returnready-custom-${String(Date.now()).slice(-6)}`,
      title: form.get("title"),
      status: form.get("status"),
      owner: form.get("owner"),
      score,
      trend: routeLabel(score, form.get("status")),
      updated: "just now",
      demoSeed: false
    });
    setLocalDb([row, ...localDb()]);
    event.currentTarget.reset();
    event.currentTarget.score.value = 86;
    const status = $("[data-db-form-status]");
    if (status) status.textContent = "Return saved to local database.";
    renderDb();
  });

  $$("[data-db-search], [data-db-sort]").forEach((item) => item.addEventListener("input", renderDb));
  $("[data-db-reset]")?.addEventListener("click", () => {
    localStorage.removeItem(keys.db);
    ensureDb(data.records || []);
    renderDb();
  });
  $("[data-db-export]")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(localDb(), null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "returnready-database-export.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

function setupSearch() {
  $$("[data-record-search]").forEach((input) => {
    input.addEventListener("input", () => {
      const target = $("[data-records]");
      if (!target) return;
      const rows = JSON.parse(target.dataset.records || "[]");
      const query = input.value.toLowerCase();
      const filtered = rows.filter((item) => `${item.title} ${item.status} ${item.owner} ${item.trend}`.toLowerCase().includes(query));
      target.innerHTML = filtered.slice(0, 18).map(returnCard).join("") || "<p>No returns match that search.</p>";
    });
  });
}

function setupLogin() {
  $$("[data-demo-user]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = $("[data-login-form]");
      if (!form) return;
      form.email.value = button.dataset.demoUser;
      form.password.value = button.dataset.demoPassword;
    });
  });
  $("[data-login-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const user = RETURN_READY.users.find((item) => item.email.toLowerCase() === form.email.value.trim().toLowerCase() && item.password === form.password.value);
    const status = $("[data-login-status]");
    if (!user) {
      if (status) status.textContent = "No matching demo account. Use one of the listed credentials.";
      return;
    }
    setSession(user);
    if (status) status.textContent = `Signed in as ${user.name}.`;
  });
  $$("[data-logout]").forEach((button) => button.addEventListener("click", () => {
    setSession(null);
    const status = $("[data-login-status]");
    if (status) status.textContent = "Session cleared.";
  }));
}

function setupClock() {
  const tick = () => {
    const now = new Date();
    $$("[data-clock]").forEach((target) => {
      target.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    });
  };
  tick();
  setInterval(tick, 1000);
}

async function init() {
  applyTheme(getTheme());
  $("[data-theme-toggle]")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(keys.theme, next);
    applyTheme(next);
  });
  renderSession();
  setupLogin();
  setupWizard();
  setupClock();

  try {
    const data = await getData();
    const records = (data.records || []).map(normalizeRecord);
    ensureDb(records);
    renderMetrics(records);
    renderLanes(records);
    renderRecords(records);
    renderCapacity(records);
    renderActivity(data);
    renderChart(records);
    renderApiPreview(data);
    renderDb();
    renderSavedRuns();
    setupForms(data);
    setupSearch();
  } catch (error) {
    console.error(error);
  }
}

init();
