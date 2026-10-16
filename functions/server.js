const http = require("node:http");
const path = require("node:path");
const fsp = require("node:fs/promises");
const { promisify } = require("node:util");
const { randomBytes, scrypt } = require("node:crypto");
const mysql = require("mysql2/promise");

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  return fsp
    .readFile(envPath, "utf8")
    .then((content) => {
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match || process.env[match[1]] !== undefined) continue;
        let value = match[2];
        if (
          value.length >= 2 &&
          ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'")))
        ) {
          value = value.slice(1, -1);
        }
        process.env[match[1]] = value;
      }
    })
    .catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
}

const scryptAsync = promisify(scrypt);
const STATIC_ROOT = path.join(__dirname, "..", "public");
const SCRYPT_OPTIONS = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};
const MIME_TYPES = {
  ".asp": "text/html; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

let pool;

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendError(response, status, message) {
  sendJson(response, status, { ok: false, error: message });
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, 64, SCRYPT_OPTIONS);
  return [
    "scrypt",
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt.toString("base64url"),
    Buffer.from(derivedKey).toString("base64url"),
  ].join("$");
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > 16 * 1024) {
        reject(Object.assign(new Error("Solicitud demasiado grande"), { status: 413 }));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error("JSON inválido"), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

async function receiveCredentials(request, response) {
  if (request.method !== "POST") {
    return sendError(response, 405, "Método no permitido");
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return sendError(response, error.status || 400, error.message);
  }

  const email = normalizeEmail(body.email);
  const password = body.password;
  

  const passwordHash = await hashPassword(password);
  await pool.execute(
    `INSERT INTO credenciales_recibidas (email, password_hash)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       updated_at = CURRENT_TIMESTAMP`,
    [email, passwordHash]
  );

  return sendJson(response, 201, { ok: true, email });
}

async function serveStatic(request, response) {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = path.resolve(STATIC_ROOT, relativePath);
  if (filePath !== STATIC_ROOT && !filePath.startsWith(`${STATIC_ROOT}${path.sep}`)) {
    return sendError(response, 403, "Acceso denegado");
  }

  try {
    const content = await fsp.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Content-Length": content.length,
    });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") return sendError(response, 404, "Recurso no encontrado");
    return sendError(response, 500, "No se pudo leer el recurso");
  }
}

async function main() {
  await loadEnvFile();

  const requiredKeys = ["DB_HOST", "DB_USER", "DB_NAME"];
  const missingKeys = requiredKeys.filter((key) => !process.env[key]);
  if (missingKeys.length) {
    throw new Error(`Faltan variables en .env: ${missingKeys.join(", ")}`);
  }

  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  await pool.query("SELECT 1 FROM credenciales_recibidas LIMIT 1");

  const port = Number(process.env.PORT || 4173);

  const server = http.createServer(async (request, response) => {
    try {
      if (request.url === "/api/credentials") {
        await receiveCredentials(request, response);
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        sendError(response, 405, "Método no permitido");
        return;
      }
      await serveStatic(request, response);
    } catch (error) {
      console.error("Error interno:", error.message);
      sendError(response, 500, "Error interno del servidor");
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`TrabajoEscolar backend en http://127.0.0.1:${port}/`);
    console.log("Almacenamiento: MySQL");
  });
}

main().catch((error) => {
  console.error("No se pudo iniciar el backend:", error.message);
  process.exitCode = 1;
});
