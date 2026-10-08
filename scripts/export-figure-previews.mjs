// Open http://127.0.0.1:3198, inspect both frames, then click Export previews.
// Rive uses image meshes, which require a real browser WebGL renderer.
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ids = ['fig1', 'fig2', 'bonk', 'jup'];
const html = `<!doctype html><html><meta charset="utf-8"><title>RIPSY figure previews</title>
<style>body{background:#172129;color:white;font:16px system-ui}canvas{width:400px;height:400px}button{padding:16px}</style>
<h1>Rive idle frame previews</h1><p id="status">Rendering…</p><div id="figures"></div><button id="export" disabled>Export previews</button>
<script src="/rive.js"></script><script>
async function render(){
rive.RuntimeLoader.setWasmUrl('/rive.wasm');
const runtime=await rive.RuntimeLoader.awaitInstance();
for(const id of ${JSON.stringify(ids)}){
const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;canvas.setAttribute('aria-label',id);document.querySelector('#figures').append(canvas);
const file=await runtime.load(new Uint8Array(await (await fetch('/'+id+'.riv')).arrayBuffer()));
const artboard=file.defaultArtboard();
for(const name of ['Idle','No Weapon']){const anim=new runtime.LinearAnimationInstance(artboard.animationByName(name),artboard);anim.advance(0);anim.apply(1);anim.delete();}
artboard.advance(0);const renderer=runtime.makeRenderer(canvas);renderer.clear();renderer.save();
renderer.align(runtime.Fit.contain,runtime.Alignment.center,{minX:0,minY:0,maxX:512,maxY:512},artboard.bounds);
artboard.draw(renderer);renderer.restore();runtime.resolveAnimationFrame();canvas.dataset.figure=id;
}
document.querySelector('#status').textContent='Ready: first Idle frame, no weapon.';document.querySelector('#export').disabled=false;
}
document.querySelector('#export').onclick=async()=>{for(const canvas of document.querySelectorAll('canvas')){const response=await fetch('/export/'+canvas.dataset.figure,{method:'POST',headers:{'Content-Type':'image/png'},body:await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))});if(!response.ok)throw Error('Export failed');}document.querySelector('#status').textContent='Exported both PNGs to web and mobile.';};
render().then(()=>{if(location.search==='?export=1')document.querySelector('#export').click();}).catch(error=>document.querySelector('#status').textContent=error.message);
</script></html>`;
const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && ['/', '/?export=1'].includes(request.url)) { response.setHeader('content-type', 'text/html'); response.end(html); return; }
    if (request.method === 'GET' && ['/rive.js', '/rive.wasm'].includes(request.url)) {
      response.setHeader('content-type', request.url.endsWith('wasm') ? 'application/wasm' : 'application/javascript');
      response.end(await fs.readFile(require.resolve(`@rive-app/canvas${request.url}`))); return;
    }
    const id = ids.find(candidate => request.url === `/${candidate}.riv`);
    if (id && request.method === 'GET') { response.end(await fs.readFile(`frontend/apps/mobile/src/assets/figures/${id}.riv`)); return; }
    const exportId = ids.find(candidate => request.url === `/export/${candidate}`);
    if (exportId && request.method === 'POST' && request.headers.origin === 'http://127.0.0.1:3198') {
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 2_000_000) throw Error('Image too large'); chunks.push(chunk); }
      const png = Buffer.concat(chunks);
      if (!png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('PNG required');
      for (const directory of ['frontend/apps/web/public/figures', 'frontend/apps/mobile/src/assets/shop']) {
        await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, `${exportId}.png`), png);
      }
      response.writeHead(204).end(); return;
    }
    response.writeHead(404).end();
  } catch { response.writeHead(400).end('Export failed'); }
});
server.listen(3198, '127.0.0.1', () => console.log('Open http://127.0.0.1:3198 to export figure previews.'));
