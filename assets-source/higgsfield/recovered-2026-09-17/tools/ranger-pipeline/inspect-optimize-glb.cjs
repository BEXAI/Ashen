#!/usr/bin/env node
'use strict';

// Read-only input; output is confined to the explicitly supplied directory.
// Binary repacking intentionally preserves the original glTF JSON object indices.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');

const HELP = `Usage: node inspect-optimize-glb.cjs INPUT.glb OUTPUT_DIR [options]
  --inspect-only       Write inspection and validation reports, no optimized GLBs
  --no-meshopt         Disable new Meshopt compression
  --no-webp            Keep source image formats when resizing
  --deps-root PATH     Existing Node project containing dependencies
  --force              Replace this utility's named output files
  --help               Show this help

Default variants: mobile1024 and hd2048. Texture dimensions are maximums;
smaller images are never upscaled. Mesh, skin, morph, and animation bytes are
preserved exactly. Meshopt and WebP outputs require compatible runtime loaders.
No dependencies are installed, no network requests are made, no meshes remeshed.
`;
const MESHOPT = 'EXT_meshopt_compression';
const WEBP = 'EXT_texture_webp';
const DEFAULT_DEPS = require('../resolve-deps.cjs')(__dirname);
const sha = (data) => createHash('sha256').update(data).digest('hex');
const clone = (data) => JSON.parse(JSON.stringify(data));
const align4 = (n) => (n + 3) & ~3;
const jsonText = (x) => JSON.stringify(x, null, 2) + '\n';
const modeNames = ['POINTS', 'LINES', 'LINE_LOOP', 'LINE_STRIP', 'TRIANGLES', 'TRIANGLE_STRIP', 'TRIANGLE_FAN'];

function options(argv) {
  const o = { meshopt: true, webp: true, depsRoot: DEFAULT_DEPS, inspectOnly: false, force: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') return { help: true };
    if (a === '--inspect-only') o.inspectOnly = true;
    else if (a === '--no-meshopt') o.meshopt = false;
    else if (a === '--no-webp') o.webp = false;
    else if (a === '--force') o.force = true;
    else if (a === '--deps-root') { if (!argv[i + 1]) throw Error('--deps-root requires a path'); o.depsRoot = path.resolve(argv[++i]); }
    else if (a.startsWith('-')) throw Error(`Unknown option: ${a}`);
    else positional.push(a);
  }
  if (positional.length !== 2) throw Error(HELP);
  o.input = path.resolve(positional[0]); o.output = path.resolve(positional[1]);
  if (!/\.glb$/i.test(o.input)) throw Error('Input must be a GLB file.');
  return o;
}

function parseGLB(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid GLB 2.0 header or length.');
  const chunks = []; let at = 12;
  while (at < bytes.length) {
    if (at + 8 > bytes.length) throw Error('Truncated GLB chunk.');
    const length = bytes.readUInt32LE(at), type = bytes.readUInt32LE(at + 4);
    if (length % 4 || at + 8 + length > bytes.length) throw Error('Invalid GLB chunk alignment or length.');
    chunks.push({ type, data: bytes.subarray(at + 8, at + 8 + length) }); at += 8 + length;
  }
  if (chunks[0]?.type !== 0x4e4f534a) throw Error('First GLB chunk must be JSON.');
  if (chunks.filter(c => c.type === 0x004e4942).length > 1) throw Error('Multiple BIN chunks are unsupported.');
  return { json: JSON.parse(chunks[0].data.toString('utf8').trim()), bin: chunks.find(c => c.type === 0x004e4942)?.data || Buffer.alloc(0), extraChunks: chunks.slice(1).filter(c => c.type !== 0x004e4942) };
}

function serializeGLB(json, bin, extraChunks = []) {
  const j = Buffer.from(JSON.stringify(json));
  const chunks = [{ type: 0x4e4f534a, data: Buffer.concat([j, Buffer.alloc(align4(j.length) - j.length, 0x20)]) }];
  if (bin.length) chunks.push({ type: 0x004e4942, data: Buffer.concat([bin, Buffer.alloc(align4(bin.length) - bin.length)]) });
  chunks.push(...extraChunks);
  const out = Buffer.alloc(12 + chunks.reduce((n, c) => n + 8 + c.data.length, 0));
  out.writeUInt32LE(0x46546c67); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  let at = 12;
  for (const c of chunks) { out.writeUInt32LE(c.data.length, at); out.writeUInt32LE(c.type, at + 4); c.data.copy(out, at + 8); at += 8 + c.data.length; }
  return out;
}

function removeExtension(obj, name) {
  if (obj.extensions) { delete obj.extensions[name]; if (!Object.keys(obj.extensions).length) delete obj.extensions; }
}
function addUsed(json, name, required = true) {
  json.extensionsUsed = [...new Set([...(json.extensionsUsed || []), name])];
  if (required) json.extensionsRequired = [...new Set([...(json.extensionsRequired || []), name])];
}

function supportedInput(raw) {
  const j = raw.json;
  if (j.buffers?.[0]?.uri) throw Error('External/data-URI buffers are unsupported; supply a self-contained GLB.');
  for (const [i, b] of (j.buffers || []).entries()) {
    if (i > 0 && (b.uri || !b.extensions?.[MESHOPT]?.fallback)) throw Error(`Buffer ${i} is not a Meshopt fallback; a self-contained GLB is required.`);
  }
  for (const [i, im] of (j.images || []).entries()) if (im.uri) throw Error(`Image ${i} is external/data-URI; embed images in the GLB before using this utility.`);
}

async function decodeViews(raw, decoder) {
  return (raw.json.bufferViews || []).map((view, i) => {
    const ext = view.extensions?.[MESHOPT];
    if (ext) {
      if (!decoder?.supported) throw Error('Input requires an available Meshopt decoder.');
      if (ext.buffer !== 0) throw Error(`Compressed view ${i} uses an external buffer.`);
      const start = ext.byteOffset || 0, end = start + ext.byteLength;
      if (end > raw.bin.length) throw Error(`Compressed view ${i} exceeds BIN chunk.`);
      const out = new Uint8Array(ext.count * ext.byteStride);
      decoder.decodeGltfBuffer(out, ext.count, ext.byteStride, raw.bin.subarray(start, end), ext.mode, ext.filter || 'NONE');
      if (out.length !== view.byteLength) throw Error(`Decoded view ${i} length mismatch.`);
      return Buffer.from(out);
    }
    if (view.buffer !== 0) throw Error(`View ${i} references an unavailable buffer.`);
    const start = view.byteOffset || 0, end = start + view.byteLength;
    if (end > raw.bin.length) throw Error(`View ${i} exceeds BIN chunk.`);
    return Buffer.from(raw.bin.subarray(start, end));
  });
}

function compressionLayout(json, i, length) {
  if (json.images?.some(im => im.bufferView === i)) return null;
  if (json.meshes?.some(m => m.primitives.some(p => p.extensions?.KHR_draco_mesh_compression?.bufferView === i))) return null;
  const accessors = (json.accessors || []).filter(a => a.bufferView === i);
  if (!accessors.length) return null; // Preserve opaque/sparse data without guessing its layout.
  const indexIDs = new Set((json.meshes || []).flatMap(m => m.primitives.map(p => p.indices).filter(x => x != null)));
  const indexAccessors = (json.accessors || []).filter((a, id) => a.bufferView === i && indexIDs.has(id));
  if (indexAccessors.length) {
    if (indexAccessors.length !== accessors.length) return null;
    const types = new Set(accessors.map(a => a.componentType));
    if (types.size !== 1) return null;
    const stride = accessors[0].componentType === 5123 ? 2 : accessors[0].componentType === 5125 ? 4 : 0;
    return stride && length % stride === 0 ? { mode: 'INDICES', stride, count: length / stride } : null;
  }
  const typeSizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const componentSizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const sizes = new Set(accessors.map(a => typeSizes[a.type] * componentSizes[a.componentType]));
  const stride = json.bufferViews[i].byteStride || (sizes.size === 1 ? [...sizes][0] : 4);
  return stride >= 4 && stride <= 256 && stride % 4 === 0 && length % stride === 0 ? { mode: 'ATTRIBUTES', stride, count: length / stride } : null;
}

function packViews(sourceJSON, views, encoder, decoder, compress) {
  const json = clone(sourceJSON); const chunks = []; let offset = 0, fallbackOffset = 0, compressedCount = 0;
  const buffers = json.buffers || [{ byteLength: 0 }];
  const fallbackID = buffers.findIndex((b, i) => i > 0 && b.extensions?.[MESHOPT]?.fallback);
  const targetFallbackID = fallbackID < 0 ? buffers.length : fallbackID;
  const details = [];
  for (let i = 0; i < views.length; i++) {
    const view = json.bufferViews[i], original = views[i];
    removeExtension(view, MESHOPT);
    const layout = compress && original.length ? compressionLayout(json, i, original.length) : null;
    let data = original, compressed = false;
    if (layout) {
      const encoded = Buffer.from(encoder.encodeGltfBuffer(original, layout.count, layout.stride, layout.mode));
      if (encoded.length < original.length) {
        const check = new Uint8Array(original.length);
        decoder.decodeGltfBuffer(check, layout.count, layout.stride, encoded, layout.mode, 'NONE');
        assert(Buffer.from(check).equals(original), `Lossless compression check failed for view ${i}`);
        data = encoded; compressed = true; compressedCount++;
      }
    }
    view.byteLength = original.length;
    if (compressed) {
      view.buffer = targetFallbackID; view.byteOffset = fallbackOffset; fallbackOffset += align4(original.length);
      view.extensions = { ...(view.extensions || {}), [MESHOPT]: { buffer: 0, byteOffset: offset, byteLength: data.length, byteStride: layout.stride, count: layout.count, mode: layout.mode } };
    } else { view.buffer = 0; view.byteOffset = offset; }
    chunks.push(data, Buffer.alloc(align4(data.length) - data.length));
    details.push({ bufferView: i, decodedBytes: original.length, storedBytes: data.length, compressed, mode: compressed ? layout.mode : null });
    offset += align4(data.length);
  }
  buffers[0] = { ...(buffers[0] || {}), byteLength: offset }; delete buffers[0].uri;
  if (compressedCount) {
    buffers[targetFallbackID] = { ...(buffers[targetFallbackID] || {}), byteLength: Math.max(1, fallbackOffset), extensions: { ...(buffers[targetFallbackID]?.extensions || {}), [MESHOPT]: { fallback: true } } };
    addUsed(json, MESHOPT);
  } else if (buffers.length === 1) {
    for (const k of ['extensionsUsed', 'extensionsRequired']) { if (json[k]) { json[k] = json[k].filter(x => x !== MESHOPT); if (!json[k].length) delete json[k]; } }
  }
  json.buffers = buffers;
  return { json, bin: Buffer.concat(chunks), details, compressedCount };
}

async function resizeTextures(json, views, maxSize, sharp, allowWebp) {
  const actions = [];
  // Shared image views must receive identical replacements.
  const processedViews = new Map();
  for (const [i, image] of (json.images || []).entries()) {
    const mime = image.mimeType, viewID = image.bufferView;
    if (viewID == null || !['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
      actions.push({ image: i, action: 'preserved', reason: `Unsupported embedded raster encoding: ${mime || 'unknown'}` }); continue;
    }
    if ((json.accessors || []).some(a => a.bufferView === viewID || a.sparse?.indices?.bufferView === viewID || a.sparse?.values?.bufferView === viewID)) throw Error(`Image ${i} shares its buffer view with accessor data; refusing to alter geometry.`);
    const coreRefs = (json.textures || []).filter(t => t.source === i);
    const hasAlternative = coreRefs.some(t => Object.keys(t.extensions || {}).some(k => k === WEBP || k === 'KHR_texture_basisu' || k === 'EXT_texture_avif'));
    const convertWebp = allowWebp && mime !== 'image/jpeg' && coreRefs.length > 0 && !hasAlternative;
    const dstMime = convertWebp ? 'image/webp' : mime;
    if (processedViews.has(viewID)) {
      const prior = processedViews.get(viewID);
      if (prior.mime !== dstMime) throw Error(`Shared image view ${viewID} needs conflicting formats; refusing to change references.`);
      image.mimeType = prior.mime;
      if (convertWebp) for (const t of coreRefs) { delete t.source; t.extensions = { ...(t.extensions || {}), [WEBP]: { source: i } }; addUsed(json, WEBP); }
      actions.push({ image: i, action: 'shared_image_view', bufferView: viewID }); continue;
    }
    const input = views[viewID], metadata = await sharp(input).metadata();
    if (metadata.pages > 1) throw Error(`Animated image ${i} cannot be resized without losing frames.`);
    const scale = Math.min(1, maxSize / metadata.width, maxSize / metadata.height);
    const width = Math.max(1, Math.round(metadata.width * scale)), height = Math.max(1, Math.round(metadata.height * scale));
    let pipeline = sharp(input).keepMetadata().resize(width, height, { fit: 'fill', withoutEnlargement: true, kernel: 'lanczos3' });
    if (dstMime === 'image/webp') pipeline = pipeline.webp({ lossless: true, effort: 4 });
    else if (dstMime === 'image/png') pipeline = pipeline.png({ compressionLevel: 9 });
    else pipeline = pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4' });
    let output = await pipeline.toBuffer();
    // Keep an already fitting source when re-encoding offers no size benefit.
    if (dstMime === mime && scale === 1 && output.length >= input.length) output = input;
    views[viewID] = output; image.mimeType = dstMime;
    processedViews.set(viewID, { mime: dstMime });
    if (convertWebp) for (const t of coreRefs) { delete t.source; t.extensions = { ...(t.extensions || {}), [WEBP]: { source: i } }; addUsed(json, WEBP); }
    actions.push({ image: i, bufferView: viewID, sourceMime: mime, outputMime: dstMime, sourceDimensions: [metadata.width, metadata.height], outputDimensions: [width, height], sourceBytes: input.length, outputBytes: output.length, resized: scale < 1, webpLossless: dstMime === 'image/webp' });
  }
  return actions;
}

function namedMetadata(value, ptr = '', result = {}) {
  if (!value || typeof value !== 'object') return result;
  if (Array.isArray(value)) value.forEach((v, i) => namedMetadata(v, `${ptr}/${i}`, result));
  else for (const [k, v] of Object.entries(value)) {
    const p = `${ptr}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`;
    if (k === 'name' || k === 'extras' || (ptr === '' && k === 'asset')) result[p] = v;
    else namedMetadata(v, p, result);
  }
  return result;
}

function preservationChecks(source, target, sourceViews, targetViews, changedImageViews) {
  for (const key of ['nodes', 'skins', 'animations', 'meshes', 'accessors', 'scenes', 'scene', 'materials', 'samplers', 'cameras', 'asset', 'extras']) assert.deepStrictEqual(target[key], source[key], `Changed protected glTF section: ${key}`);
  const before = namedMetadata(source), after = namedMetadata(target);
  for (const [ptr, value] of Object.entries(before)) assert.deepStrictEqual(after[ptr], value, `Metadata changed: ${ptr}`);
  assert.equal(targetViews.length, sourceViews.length, 'Buffer view count changed');
  for (let i = 0; i < sourceViews.length; i++) if (!changedImageViews.has(i)) assert(sourceViews[i].equals(targetViews[i]), `Non-image binary data changed in view ${i}`);
  return { protectedJSONSectionsIdentical: true, originalNamesAndExtrasIdentical: true, nonImageBufferViewsByteIdentical: true, unchangedBufferViewCount: true, geometryQuantized: false, verticesOrTrianglesReordered: false, remeshed: false };
}

function accessorSummary(a) {
  if (!a) return null;
  const array = a.getArray();
  return { name: a.getName(), count: a.getCount(), type: a.getType(), componentType: a.getComponentType(), normalized: a.getNormalized(), min: a.getMin([]), max: a.getMax([]), decodedSHA256: array ? sha(Buffer.from(array.buffer, array.byteOffset, array.byteLength)) : null };
}

function weightSummary(p) {
  const sets = p.listSemantics().filter(s => /^WEIGHTS_\d+$/.test(s)).sort().map(s => ({ semantic: s, weights: p.getAttribute(s), joints: p.getAttribute(s.replace('WEIGHTS_', 'JOINTS_')) }));
  if (!sets.length) return null;
  const count = sets[0].weights.getCount(); const result = { vertexCount: count, sets: sets.map(s => ({ semantic: s.semantic, weights: accessorSummary(s.weights), joints: accessorSummary(s.joints) })), minWeightSum: Infinity, maxWeightSum: -Infinity, maxInfluences: 0, zeroWeightVertices: 0, nonNormalizedVertices: 0, negativeWeightValues: 0, nonFiniteWeightValues: 0, jointUsage: {} };
  const w = [], j = [];
  for (let v = 0; v < count; v++) {
    let sum = 0, influences = 0;
    for (const set of sets) {
      set.weights.getElement(v, w); if (set.joints) set.joints.getElement(v, j);
      for (let c = 0; c < set.weights.getElementSize(); c++) {
        if (!Number.isFinite(w[c])) result.nonFiniteWeightValues++;
        if (w[c] < 0) result.negativeWeightValues++;
        sum += w[c];
        if (w[c] > 0) { influences++; if (set.joints) result.jointUsage[j[c]] = (result.jointUsage[j[c]] || 0) + 1; }
      }
    }
    result.minWeightSum = Math.min(result.minWeightSum, sum); result.maxWeightSum = Math.max(result.maxWeightSum, sum);
    result.maxInfluences = Math.max(result.maxInfluences, influences);
    if (sum === 0) result.zeroWeightVertices++;
    if (Math.abs(sum - 1) > 0.001) result.nonNormalizedVertices++;
  }
  return result;
}

function cleanBounds(bounds) { return [...bounds.min, ...bounds.max].every(Number.isFinite) ? bounds : null; }

async function inspect(raw, bytes, io, core, sharp) {
  const doc = await io.readBinary(new Uint8Array(bytes)); const root = doc.getRoot();
  const nodes = root.listNodes(), skins = root.listSkins(), meshes = root.listMeshes();
  const boneSet = new Set(skins.flatMap(s => s.listJoints()));
  const meshReports = meshes.map((m, id) => ({ id, name: m.getName(), extras: m.getExtras(), weights: m.getWeights(), primitives: m.listPrimitives().map((p, i) => {
    const count = (p.getIndices() || p.getAttribute('POSITION'))?.getCount() || 0;
    const mode = p.getMode();
    return { id: i, mode: modeNames[mode] || mode, vertices: p.getAttribute('POSITION')?.getCount() || 0, indices: p.getIndices()?.getCount() || 0, triangles: mode === 4 ? Math.floor(count / 3) : mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0, positionBounds: p.getAttribute('POSITION') ? { min: p.getAttribute('POSITION').getMin([]), max: p.getAttribute('POSITION').getMax([]) } : null, attributes: Object.fromEntries(p.listSemantics().map(s => [s, accessorSummary(p.getAttribute(s))])), skinWeights: weightSummary(p), morphTargets: p.listTargets().map(t => Object.fromEntries(t.listSemantics().map(s => [s, accessorSummary(t.getAttribute(s))]))) };
  }) }));
  const textures = await Promise.all(root.listTextures().map(async (t, id) => {
    const image = t.getImage(); let dimensions = t.getSize(); let decodeError = null;
    try { if (image) { const m = await sharp(image).metadata(); dimensions = [m.width, m.height]; } } catch (e) { decodeError = e.message; }
    return { id, name: t.getName(), uri: t.getURI(), mimeType: t.getMimeType(), dimensions, bytes: image?.length || 0, sha256: image ? sha(image) : null, extras: t.getExtras(), rasterMetadataError: decodeError };
  }));
  const animations = root.listAnimations().map((a, id) => ({ id, name: a.getName(), extras: a.getExtras(), channels: a.listChannels().map((c, track) => { const s = c.getSampler(); return { track, targetNode: nodes.indexOf(c.getTargetNode()), targetName: c.getTargetNode()?.getName(), targetPath: c.getTargetPath(), interpolation: s?.getInterpolation(), times: accessorSummary(s?.getInput()), values: accessorSummary(s?.getOutput()) }; }) }));
  for (const a of animations) a.durationSeconds = Math.max(0, ...a.channels.map(c => c.times?.max?.[0] || 0));
  return {
    counts: { nodes: nodes.length, bones: boneSet.size, skins: skins.length, meshes: meshes.length, animations: animations.length, animationTracks: animations.reduce((n, a) => n + a.channels.length, 0), textures: textures.length, uniqueMeshTriangles: meshReports.reduce((n, m) => n + m.primitives.reduce((t, p) => t + p.triangles, 0), 0), instancedTriangles: nodes.reduce((n, node) => n + (meshReports[meshes.indexOf(node.getMesh())]?.primitives.reduce((t, p) => t + p.triangles, 0) || 0), 0) },
    nodes: nodes.map((n, id) => ({ id, name: n.getName(), bone: boneSet.has(n), parent: n.getParentNode() ? nodes.indexOf(n.getParentNode()) : null, children: n.listChildren().map(c => nodes.indexOf(c)), mesh: n.getMesh() ? meshes.indexOf(n.getMesh()) : null, skin: n.getSkin() ? skins.indexOf(n.getSkin()) : null, translation: n.getTranslation(), rotation: n.getRotation(), scale: n.getScale(), worldMatrix: n.getWorldMatrix(), extras: n.getExtras() })),
    skins: skins.map((s, id) => ({ id, name: s.getName(), skeleton: s.getSkeleton() ? nodes.indexOf(s.getSkeleton()) : null, joints: s.listJoints().map((n, jointIndex) => ({ jointIndex, node: nodes.indexOf(n), name: n.getName() })), inverseBindMatrices: accessorSummary(s.getInverseBindMatrices()), extras: s.getExtras() })),
    meshes: meshReports, animations, textures,
    sceneBounds: root.listScenes().map((s, id) => ({ id, name: s.getName(), bounds: cleanBounds(core.getBounds(s)), basis: 'Static node transforms; excludes animated/skinned deformation and animated morph bounds' })),
    extensionsUsed: raw.json.extensionsUsed || [], extensionsRequired: raw.json.extensionsRequired || [],
    metadata: namedMetadata(raw.json), asset: raw.json.asset,
  };
}

async function validate(bytes, filename, validator) {
  return validator.validateBytes(new Uint8Array(bytes), { uri: filename, format: 'glb', maxIssues: 0, writeTimestamp: false });
}

async function main() {
  const o = options(process.argv.slice(2)); if (o.help) { console.log(HELP); return; }
  const req = createRequire(path.join(o.depsRoot, 'package.json'));
  const core = req('@gltf-transform/core'), ext = req('@gltf-transform/extensions'), sharp = req('sharp'), meshopt = req('meshoptimizer'), validator = req('gltf-validator');
  await Promise.all([meshopt.MeshoptEncoder.ready, meshopt.MeshoptDecoder.ready]);
  const io = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': meshopt.MeshoptDecoder });
  try { const draco = req('draco3dgltf'); io.registerDependencies({ 'draco3d.decoder': await draco.createDecoderModule() }); } catch { /* Non-Draco inputs do not need this optional dependency. */ }
  const inputBytes = await fs.readFile(o.input), sourceHash = sha(inputBytes), raw = parseGLB(inputBytes);
  supportedInput(raw);
  const supportedExtensions = new Set(ext.ALL_EXTENSIONS.map(e => e.EXTENSION_NAME));
  const unsupported = (raw.json.extensionsUsed || []).filter(e => !supportedExtensions.has(e));
  if (unsupported.length) throw Error(`Cannot safely inspect these unsupported extensions: ${unsupported.join(', ')}. Input remains unchanged.`);
  const caps = { meshoptEncoder: !!meshopt.MeshoptEncoder.supported, meshoptDecoder: !!meshopt.MeshoptDecoder.supported, webpEncoder: !!sharp.format.webp?.output?.buffer };
  const sourceValidation = await validate(inputBytes, path.basename(o.input), validator);
  const sourceViews = await decodeViews(raw, meshopt.MeshoptDecoder);
  const report = { schemaVersion: 1, createdAtUTC: new Date().toISOString(), input: { path: o.input, bytes: inputBytes.length, sha256: sourceHash }, dependencyRoot: o.depsRoot, versions: { gltfTransform: core.VERSION, sharp: sharp.versions.sharp, gltfValidator: validator.version() }, capabilities: caps, policy: { meshoptMode: 'lossless, no filters; INDICES mode preserves index order', webp: 'lossless after resizing for PNG/WebP; already compressed JPEG retained exactly at HD cap, quality95 4:4:4 at mobile cap', imageMetadata: 'Sharp keepMetadata', textureCaps: [1024, 2048], runtimeRequirements: 'EXT_meshopt_compression decoder and EXT_texture_webp support when listed as required', unsupportedRasterEncodings: 'preserved unchanged and reported; may exceed size cap', sourceUntouched: true }, sourceValidation: sourceValidation.issues, source: await inspect(raw, inputBytes, io, core, sharp), variants: [] };
  const stem = path.basename(o.input, path.extname(o.input));
  await fs.mkdir(o.output, { recursive: true });
  const artifacts = [{ filename: `${stem}.source.validation.json`, bytes: Buffer.from(jsonText(sourceValidation)) }];
  if (!o.inspectOnly) {
    if (sourceValidation.issues.numErrors) throw Error(`Input has ${sourceValidation.issues.numErrors} validation error(s); use --inspect-only to export the detailed report.`);
    for (const [name, cap] of [['mobile1024', 1024], ['hd2048', 2048]]) {
      const json = clone(raw.json), views = sourceViews.map(b => Buffer.from(b));
      const textureActions = await resizeTextures(json, views, cap, sharp, o.webp && caps.webpEncoder);
      const packed = packViews(json, views, meshopt.MeshoptEncoder, meshopt.MeshoptDecoder, o.meshopt && caps.meshoptEncoder && caps.meshoptDecoder);
      const bytes = serializeGLB(packed.json, packed.bin, raw.extraChunks), filename = `${stem}.${name}.glb`;
      const generatedRaw = parseGLB(bytes), generatedViews = await decodeViews(generatedRaw, meshopt.MeshoptDecoder);
      const changedImageViews = new Set((raw.json.images || []).map(im => im.bufferView));
      const preserved = preservationChecks(raw.json, generatedRaw.json, sourceViews, generatedViews, changedImageViews);
      // Validate an uncompressed mirror too: glTF Validator does not decode every extension.
      const mirror = packViews(json, generatedViews, null, null, false);
      const directValidation = await validate(bytes, filename, validator);
      const decodedValidation = await validate(serializeGLB(mirror.json, mirror.bin, raw.extraChunks), `${filename}.decoded-mirror`, validator);
      if (directValidation.issues.numErrors || decodedValidation.issues.numErrors) {
        const failure = path.join(o.output, `${stem}.${name}.failed-validation.json`);
        await fs.writeFile(failure, jsonText({ direct: directValidation, decoded: decodedValidation }));
        throw Error(`Generated ${name} failed validation; no variant GLBs published. Details: ${failure}`);
      }
      const model = await inspect(generatedRaw, bytes, io, core, sharp);
      assert.deepStrictEqual(model.counts, report.source.counts, 'Model counts changed after encoding.');
      report.variants.push({ name, filename, bytes: bytes.length, sha256: sha(bytes), sourceSizeRatio: bytes.length / inputBytes.length, textureCap: cap, meshoptCompressedViews: packed.compressedCount, preservation: preserved, compression: packed.details, textures: textureActions, validation: { direct: directValidation.issues, decoded: decodedValidation.issues }, model });
      artifacts.push({ filename, bytes }, { filename: `${stem}.${name}.validation.json`, bytes: Buffer.from(jsonText({ direct: directValidation, decoded: decodedValidation })) });
    }
  }
  assert.equal(sha(await fs.readFile(o.input)), sourceHash, 'Source changed during processing.');
  artifacts.push({ filename: `${stem}.report.json`, bytes: Buffer.from(jsonText(report)) });
  const checksums = artifacts.map(a => `${sha(a.bytes)}  ${a.filename}`).join('\n') + '\n';
  artifacts.push({ filename: `${stem}.SHA256SUMS`, bytes: Buffer.from(checksums) });
  for (const a of artifacts) {
    const outputPath = path.join(o.output, a.filename);
    if (outputPath === o.input) throw Error('Output would overwrite input. Choose another directory.');
    if (!o.force) { try { await fs.access(outputPath); throw Error(`Output exists: ${outputPath}; use --force to replace generated files.`); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  }
  for (const a of artifacts) await fs.writeFile(path.join(o.output, a.filename), a.bytes, { flag: o.force ? 'w' : 'wx' });
  console.log(jsonText({ report: path.join(o.output, `${stem}.report.json`), sourceSHA256: sourceHash, counts: report.source.counts, variants: report.variants.map(v => ({ path: path.join(o.output, v.filename), bytes: v.bytes, sha256: v.sha256, validationErrors: v.validation.direct.numErrors + v.validation.decoded.numErrors })), sourceUnchanged: true }));
}

module.exports = { parseGLB, serializeGLB, decodeViews, packViews, namedMetadata, sha, validate };
if (require.main === module) main().catch(e => { console.error(`ERROR: ${e.message}`); process.exitCode = 1; });
