import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const serverDir = path.join(root, "server");
const dbPath = path.join(serverDir, "db.json");
const port = Number(process.env.PORT || 4174);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function ensureDb() {
  await mkdir(serverDir, { recursive: true });
  if (!existsSync(dbPath)) {
    const data = await readJson(path.join(root, "api", "data.json"));
    const users = await readJson(path.join(root, "api", "users.json"));
    await writeFile(dbPath, JSON.stringify({
      product: "ReturnReady",
      database: "returnready_requests",
      records: data.records || [],
      users: users.users || []
    }, null, 2), "utf8");
  }
}

async function readDb() {
  await ensureDb();
  return readJson(dbPath);
}

async function writeDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
}

async function bodyJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function send(res, status, payload, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(Buffer.isBuffer(payload) || typeof payload === "string" ? payload : JSON.stringify(payload));
}

function safeFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(root, clean);
  return file.startsWith(root) ? file : path.join(root, "index.html");
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "OPTIONS") return send(res, 204, "");

    if (url.pathname === "/api/health") {
      return send(res, 200, { ok: true, product: "ReturnReady", database: "returnready_requests" });
    }

    if (url.pathname === "/api/data") {
      return send(res, 200, await readJson(path.join(root, "api", "data.json")));
    }

    if (url.pathname === "/api/login" && req.method === "POST") {
      const input = await bodyJson(req);
      const db = await readDb();
      const user = db.users.find((item) => item.email === input.email && item.password === input.password);
      if (!user) return send(res, 401, { ok: false, message: "Invalid demo credentials" });
      const { password, ...safeUser } = user;
      return send(res, 200, { ok: true, user: safeUser });
    }

    if (url.pathname === "/api/records") {
      const db = await readDb();
      if (req.method === "GET") return send(res, 200, { records: db.records });
      if (req.method === "POST") {
        const row = await bodyJson(req);
        const record = {
          id: row.id || `returnready-api-${Date.now()}`,
          title: row.title || "Return request",
          status: row.status || "Eligibility clarity",
          owner: row.owner || "Returns desk",
          score: Number(row.score || 82),
          trend: row.trend || "API saved",
          updated: "saved through Node API",
          demoSeed: false
        };
        db.records.unshift(record);
        await writeDb(db);
        return send(res, 201, { ok: true, record });
      }
    }

    if (url.pathname.startsWith("/api/records/") && req.method === "DELETE") {
      const db = await readDb();
      const id = decodeURIComponent(url.pathname.split("/").pop());
      db.records = db.records.filter((record) => record.id !== id);
      await writeDb(db);
      return send(res, 200, { ok: true });
    }

    const file = safeFile(url.pathname);
    const target = existsSync(file) ? file : path.join(root, "index.html");
    const type = mime[path.extname(target)] || "text/plain; charset=utf-8";
    return send(res, 200, await readFile(target), type);
  } catch (error) {
    return send(res, 500, { ok: false, error: error.message });
  }
});

server.listen(port, () => {
  console.log(`ReturnReady running at http://localhost:${port}`);
});
