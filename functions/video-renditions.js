import { createHash } from 'node:crypto';

const text = v => String(v || '').trim();
const fail = code => { throw Object.assign(new Error(code), { status: 400 }); };
const fileId = v => /^[A-Za-z0-9_-]{10,200}$/.test(text(v)) ? text(v) : fail('invalid_rendition_file_id');
export function prepareVideoRendition(videoId, video, input = {}) {
  if (!videoId || videoId.includes('/') || !video) fail('video_not_found');
  const reviewedSourceFileId = fileId(input.reviewedSourceFileId);
  const sourceRecordId = text(video.sourceRecordId);
  if (sourceRecordId !== `weaver:video:${reviewedSourceFileId}` && reviewedSourceFileId !== text(video.sourceReviewFileId)) fail('rendition_reviewed_source_mismatch');
  const sourceVersionFileId = fileId(input.sourceVersionFileId);
  const outputFileId = fileId(input.outputFileId);
  const role = text(input.role);
  if (!['master', 'platform'].includes(role)) fail('invalid_rendition_role');
  if (role === 'master' && sourceVersionFileId !== outputFileId) fail('rendition_master_identity_mismatch');
  const profileId = text(input.profileId), profileVersion = text(input.profileVersion);
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(profileId) || !/^[a-zA-Z0-9._-]{1,40}$/.test(profileVersion)) fail('invalid_rendition_profile');
  const sha256 = text(input.sha256).toLowerCase();
  const sourceChecksum = text(input.sourceChecksum).toLowerCase();
  if ((sha256 && !/^[a-f0-9]{64}$/.test(sha256)) || (sourceChecksum && !/^[a-f0-9]{64}$/.test(sourceChecksum)) || (role === 'platform' && !sha256)) fail('invalid_rendition_checksum');
  const numbers = {};
  for (const name of ['width', 'height', 'durationSeconds', 'frameRate', 'byteCount']) {
    const n = Number(input[name]);
    if (!Number.isFinite(n) || n <= 0 || (['width','height','byteCount'].includes(name) && !Number.isSafeInteger(n))) fail('invalid_rendition_' + name);
    numbers[name] = n;
  }
  if (role === 'platform' && numbers.byteCount > 600 * 1024 * 1024) fail('rendition_exceeds_synchronous_limit');
  const evidenceUrl = text(input.evidenceUrl);
  if (!/^https:\/\/(docs|drive)\.google\.com\//.test(evidenceUrl)) fail('invalid_rendition_evidence');
  const record = {
    assetType: 'video_rendition', contentCollection: 'videos', contentDocId: videoId,
    sourceRecordId, reviewedSourceFileId, sourceVersionFileId, sourceChecksum: sourceChecksum || null,
    outputFileId, outputUrl: `https://drive.google.com/file/d/${outputFileId}/view`,
    sha256: sha256 || null, sourceRevisionId: text(input.sourceRevisionId) || null, outputRevisionId: text(input.outputRevisionId) || null, role, profileId, profileVersion, ...numbers,
    videoCodec: text(input.videoCodec), audioCodec: text(input.audioCodec), audioSampleRate: Number(input.audioSampleRate) || null,
    evidenceUrl, storageMode: 'drive_reference',
  };
  const id = 'video-rendition-' + createHash('sha256').update(JSON.stringify([videoId, sourceVersionFileId, record.sourceRevisionId, profileId, profileVersion])).digest('hex').slice(0,32);
  return { id, record };
}

export function renditionMatches(existing, proposed) {
  return Object.entries(proposed).every(([key,value]) => JSON.stringify(existing[key]) === JSON.stringify(value));
}

// Verify the exact bounded derivative bytes; never stream the multi-GB master here.
export async function verifyRenditionBytes(body, expected) {
  let count = 0, prefix = Buffer.alloc(0);
  const hash = createHash('sha256');
  for await (const chunk of body) {
    count += chunk.length;
    if (count > expected.byteCount || count > 600 * 1024 * 1024) fail('rendition_byte_count_mismatch');
    if (prefix.length < 32) prefix = Buffer.concat([prefix, Buffer.from(chunk)]).subarray(0,32);
    hash.update(chunk);
  }
  if (count !== expected.byteCount) fail('rendition_byte_count_mismatch');
  if (prefix.toString('ascii',4,8) !== 'ftyp') fail('rendition_not_mp4');
  const sha256 = hash.digest('hex');
  if (sha256 !== expected.sha256) fail('rendition_checksum_mismatch');
  return { validationState: 'verified_bytes', verifiedByteCount: count, verifiedSha256: sha256 };
}

export async function registerVideoRendition({ db, videoId, input, verify, timestamp }) {
  if (!videoId || videoId.includes('/')) fail('invalid_video_id');
  const videoRef = db.collection('videos').doc(videoId);
  const snap = await videoRef.get();
  if (!snap.exists) throw Object.assign(new Error('video_not_found'), { status: 404 });
  const prepared = prepareVideoRendition(videoId, snap.data(), input);
  const ref = db.collection('contentAssets').doc(prepared.id);
  const existing = await ref.get();
  if (existing.exists) {
    if (prepared.record.role === 'platform' && existing.data().validationState !== 'verified_bytes') throw Object.assign(new Error('rendition_not_verified'), { status: 409 });
    if (!renditionMatches(existing.data(), prepared.record)) throw Object.assign(new Error('rendition_profile_conflict'), { status: 409 });
    return { id: ref.id, created: false, ...existing.data() };
  }
  const validation = prepared.record.role === 'platform'
    ? await verify(prepared.record) : { validationState: 'source_reported' };
  return db.runTransaction(async tx => {
    const [currentVideo,currentAsset] = await Promise.all([tx.get(videoRef),tx.get(ref)]);
    if (!currentVideo.exists || currentVideo.data().sourceRecordId !== prepared.record.sourceRecordId) throw Object.assign(new Error('rendition_target_changed'), { status: 409 });
    if (currentAsset.exists) {
      if (!renditionMatches(currentAsset.data(),prepared.record)) throw Object.assign(new Error('rendition_profile_conflict'), { status: 409 });
      return { id:ref.id,created:false,...currentAsset.data() };
    }
    const saved = { ...prepared.record, ...validation, status:'active', createdAt:timestamp(), updatedAt:timestamp() };
    tx.set(ref,saved);
    return { id:ref.id,created:true,...saved };
  });
}
