import config from '../vite.config';
import { defineConfig, type Plugin } from 'vite';

const readOnly: Plugin = {
  name: 'read-only-ux-preview',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method ?? '')) {
        response.writeHead(403, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'This UX preview accepts read requests only.' }));
        return;
      }
      next();
    });
  }
};

export default defineConfig({ ...config, plugins: [...(config.plugins ?? []), readOnly] });
