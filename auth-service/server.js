import crypto from "node:crypto";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4002);

// Requests now arrive via the Ingress, which can be reached at different
// hosts (minikube ip, NodePort, custom domain). Default to reflecting the
// request's own origin instead of a single hardcoded one; set CORS_ORIGIN
// to lock this down to a specific origin if needed.
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "hotel123";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// In-memory session store (sufficient for a single-instance service)
const activeSessions = new Map();

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "auth-service" });
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = crypto.randomUUID();
    activeSessions.set(token, { createdAt: Date.now() });
    return res.json({ token });
  }

  res.status(401).json({ message: "Invalid username or password." });
});

app.get("/api/admin/verify", (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const session = activeSessions.get(token);

  if (!session || Date.now() - session.createdAt > TOKEN_TTL_MS) {
    if (session) activeSessions.delete(token);
    return res.status(401).json({ valid: false });
  }

  res.json({ valid: true });
});

app.post("/api/admin/logout", (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  activeSessions.delete(token);
  res.json({ ok: true });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ message: error.message || "Something went wrong." });
});

app.listen(port, () => {
  console.log(`auth-service running on http://localhost:${port}`);
});
