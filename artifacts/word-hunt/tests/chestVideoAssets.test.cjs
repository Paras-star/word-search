const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'assets/chest-animation');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'source-manifest.json')));

function png(file) {
  const bytes = fs.readFileSync(file), chunks = [];
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8);
  assert.equal(bytes[25], 6, 'native atlas keeps RGBA transparency');
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const filtered = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * 4, pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const a = x >= 4 ? pixels[at - 4] : 0;
      const b = y ? pixels[at - stride] : 0;
      const c = y && x >= 4 ? pixels[at - stride - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      if (filter === 2) predictor = b;
      if (filter === 3) predictor = Math.floor((a + b) / 2);
      if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[at] = (filtered[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  return { width, height, pixels };
}

test('all 73 source frames are present with a transparent watermark-exclusion band', () => {
  assert.equal(manifest.frameCount, 73);
  assert.equal(manifest.fps, 24);
  assert.equal(manifest.durationMs, 3042);
  const atlases = Array.from({ length: 5 }, (_, i) => png(path.join(dir, `chest-atlas-${i}.png`)));
  for (let frame = 0; frame < 73; frame++) {
    const atlas = atlases[Math.floor(frame / 16)];
    assert.equal(atlas.width, 1536);
    assert.equal(atlas.height, 1536);
    const col = frame % 4, row = Math.floor((frame % 16) / 4);
    let solidChest = 0;
    for (let y = 0; y < 384; y++) {
      for (let x = 0; x < 384; x++) {
        const alpha = atlas.pixels[((row * 384 + y) * atlas.width + col * 384 + x) * 4 + 3];
        if (y >= 360) assert.equal(alpha, 0, 'watermark area must be absent in every frame');
        else if (alpha === 255) solidChest++;
      }
    }
    assert.ok(solidChest > 35000, `frame ${frame} retains its solid chest`);
  }
});

test('front rim is a separate exact-art occlusion layer, with no lid or watermark', () => {
  const front = png(path.join(dir, 'chest-front.png'));
  assert.equal(front.width, 384);
  for (let y = 0; y < 384; y++) {
    if (y >= 203 && y < 360) continue;
    for (let x = 0; x < 384; x++) assert.equal(front.pixels[(y * 384 + x) * 4 + 3], 0);
  }
  const component = fs.readFileSync(path.join(root, 'components/ChestReveal.tsx'), 'utf8');
  assert.ok(component.indexOf('<ChestFrameRenderer') < component.indexOf('testID="chest-revealed-artwork"'));
  assert.ok(component.indexOf('testID="chest-revealed-artwork"') < component.indexOf('testID="chest-front-rim"'));
  assert.match(component, /top: '18%'/);
  assert.doesNotMatch(component, /<Video|\.mp4['"]/);
});

test('the source and extracted chest audio have identical decoded samples', { skip: !fs.existsSync(path.resolve(root, '../../attached_assets', manifest.source)) }, () => {
  const source = path.resolve(root, '../../attached_assets', manifest.source);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'), manifest.sourceSha256);
  for (const file of [source, path.join(dir, 'chest-opening.m4a'), path.join(dir, 'chest-opening.wav')]) {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-f', 'f32le', '-acodec', 'pcm_f32le', '-'], { maxBuffer: 3000000 });
    assert.equal(crypto.createHash('sha256').update(pcm).digest('hex'), manifest.decodedAudioSha256);
  }
  assert.equal(manifest.audioReencoded, false);
});