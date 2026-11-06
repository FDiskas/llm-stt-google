// Dev server: Bun bundles index.html (JSX + CSS) on the fly, with hot reload.
import homepage from './index.html';

const server = Bun.serve({
  port: Number(process.env.PORT ?? 8080),
  routes: { '/': homepage },
  development: { hmr: true, console: true },
});

console.log(`STT bandymai: ${server.url}`);
