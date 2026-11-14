import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { registerRoutes } from './routes';
import { startNotificationServer } from './notification-server';

let server: http.Server | null = null;
let app: Express;

const PORT = parseInt(process.env.PORT || '3001', 10);

export function isServerRunning(): boolean {
  return server !== null;
}

function getFrontendDir(): string | null {
  const candidates = [
    path.join(__dirname, '../frontend/out'),
    path.join(process.resourcesPath || '', 'frontend-out'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  return null;
}

export function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    app = express();

    app.use(cors());
    app.use(express.json());

    app.get('/api/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        service: 'FloSalon Local API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      });
    });

    registerRoutes(app);

    const frontendDir = getFrontendDir();
    if (frontendDir) {
      console.log(`[Server] Serving frontend from: ${frontendDir}`);
      app.use(express.static(frontendDir));
      app.get(/^(?!\/api).*$/, (_req: Request, res: Response) => {
        res.sendFile(path.join(frontendDir, 'index.html'));
      });
    } else {
      console.warn('[Server] Frontend build not found. Run `npm run build:frontend` first.');
      app.get('/', (_req: Request, res: Response) => {
        res.send(`
          <html><body style="font-family:sans-serif;padding:2rem">
            <h2>FloSalon – Frontend not built</h2>
            <p>Run <code>npm run build:frontend</code> then restart the app.</p>
          </body></html>
        `);
      });
    }

    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('[Server] Error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    });

    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] HTTP server running on http://localhost:${PORT}`);
      const httpServer = server!;
      startNotificationServer(httpServer);
      resolve();
    });

    server?.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Server] Port ${PORT} in use, trying ${PORT + 1}`);
        server?.listen(PORT + 1, '0.0.0.0');
      } else {
        reject(err);
      }
    });
  });
}

export function stopServer(): void {
  if (server) server.close();
  console.log('[Server] HTTP server stopped');
}

export function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '127.0.0.1';
}
