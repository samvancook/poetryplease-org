// Optional ordered set: absent means the established single-image contract.
export function normalizeGraphicAssetSet(value) {
  if (value === undefined || value === null) return null;
  const fail = () => { const error = new Error('invalid_asset_set'); error.status = 400; throw error; };
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) fail();
  const url = (input, required = false) => {
    if (!input && !required) return '';
    try { const parsed = new URL(String(input)); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.href; } catch {}
    return fail();
  };
  return value.map((card, i) => {
    if (!card || card.index !== i + 1) fail();
    return { index: i + 1, role: String(card.role || 'content').trim().slice(0, 100),
      assetUrl: url(card.assetUrl, true), assetPreviewUrl: url(card.assetPreviewUrl),
      assetFileId: String(card.assetFileId || '').trim().slice(0, 300),
      fileName: String(card.fileName || '').trim().slice(0, 500) };
  });
}
export function validateAffectedCardIndex(value, assetSet) {
  if (value === undefined || value === null || value === '') return null;
  if (!assetSet || !Number.isInteger(value) || value < 1 || value > assetSet.length) {
    const error = new Error('invalid_affected_card_index'); error.status = 400; throw error;
  }
  return value;
}
export function repairAssetSetUpdate(original, returned, affectedCardIndex = null) {
  const before = normalizeGraphicAssetSet(original);
  const after = normalizeGraphicAssetSet(returned);
  const index = validateAffectedCardIndex(affectedCardIndex, before);
  const fail = message => { const error = new Error(message); error.status = 409; throw error; };
  if (before?.length > 1 && !after) fail('replacement_asset_set_required');
  if (!after) return null;
  if (index && (before.length !== after.length || before.some((card, i) =>
    i !== index - 1 && JSON.stringify(card) !== JSON.stringify(after[i])))) fail('unaffected_cards_changed');
  return after;
}

export function repairReplacementCard(assetSet, affectedCardIndex = null) {
  const index = validateAffectedCardIndex(affectedCardIndex, assetSet);
  return assetSet[(index || 1) - 1];
}
