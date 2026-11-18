// Dev server: Bun bundles index.html (JSX + CSS) on the fly, with hot reload.
import homepage from './index.html';
import ttsPage from './tts.html';

/** The TTS worker is its own entry point: HTML bundling does not follow new Worker(). */
async function ttsWorker() {
  const out = await Bun.build({ entrypoints: ['./src/tts/worker.js'], target: 'browser', format: 'esm' });
  if (!out.success) return new Response(out.logs.join('\n'), { status: 500 });
  return new Response(await out.outputs[0].text(), { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 8080),
  routes: { '/': homepage, '/tts.html': ttsPage, '/tts-worker.js': ttsWorker },
  development: { hmr: true, console: true },
});

console.log(`STT bandymai: ${server.url}`);
console.log(`Kalbos sintezė: ${server.url}tts.html`);
