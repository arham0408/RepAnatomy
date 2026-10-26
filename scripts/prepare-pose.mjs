import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const destination = new URL('../public/pose/', import.meta.url);
await mkdir(destination, {recursive:true});
await cp(new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url),new URL('wasm/',destination), {recursive:true});
const modelURL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const path = new URL('pose_landmarker_lite.task',destination);
let model;
try { model = await readFile(path); } catch {
  const response = await fetch(modelURL);
  if (!response.ok) throw new Error(`Pose model download failed: ${response.status}`);
  model = Buffer.from(await response.arrayBuffer());
}
if (model.length < 1_000_000) throw new Error('Pose model is incomplete.');
const digest = createHash('sha256').update(model).digest('hex');
const manifestPath = new URL('../data/fitness/pose-model.json',import.meta.url);
try {
  const pinned = JSON.parse(await readFile(manifestPath,'utf8'));
  if (pinned.sha256 !== digest) throw new Error('Pose model checksum differs from the pinned manifest.');
} catch (error) { if(error.code !== 'ENOENT') throw error; }
await writeFile(path,model);
await writeFile(manifestPath, JSON.stringify({url:modelURL,sha256:digest,bytes:model.length,package:'@mediapipe/tasks-vision',version:'1.1.0'},null,2)+'\n');
console.log(`Local pose model verified: ${digest}; WASM copied. No CDN needed at runtime.`);
