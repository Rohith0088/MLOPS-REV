import "dotenv/config";
import { createServer } from "http";
import net from "net";
import { serveStatic, setupVite } from "./vite";
import { createApp } from "./app";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = createApp();
  const server = createServer(app);
  const clientOrigin = process.env.CLIENT_ORIGIN;
  if (clientOrigin) {
    app.use((req, res, next) => {
      if (req.headers.origin === clientOrigin) {
        res.setHeader("Access-Control-Allow-Origin", clientOrigin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      }
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
    });
  }
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  const listen = (candidate: number) => {
    const handleError = (error: NodeJS.ErrnoException) => {
      server.removeListener("error", handleError);
      if (error.code === "EADDRINUSE") {
        listen(candidate + 1);
        return;
      }
      throw error;
    };
    server.once("error", handleError);
    server.listen(candidate, () => {
      server.removeListener("error", handleError);
      console.log(`Server running on http://localhost:${candidate}/`);
    });
  };
  listen(port);
}

startServer().catch(console.error);
