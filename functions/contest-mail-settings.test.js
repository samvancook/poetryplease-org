import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the registered handlers without booting Firebase or contacting Mandrill.
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const identitySource = source.slice(source.indexOf('const CONTEST_MAIL_IDENTITY ='), source.indexOf('const AUTHOR_INVITE_TEST_EMAIL ='))
  .replace('export function', 'function');
const mailSource = source.slice(source.indexOf('const CONTEST_OUTCOME_EMAIL_TYPES ='), source.indexOf('app.post(getBoth("/admin/contestFinalistBatch")'));
const programId = 'button-poetry-s-fall-2026-short-form-contest-da82891d';
const custom = { fromName: 'Sam — Contest Team', fromEmail: 'sam@buttonpoetry.com', replyTo: 'support@buttonpoetry.com' };
const plain = (value) => JSON.parse(JSON.stringify(value));

function harness(identity) {
  const rows = new Map();
  const routes = new Map();
  const sent = [];
  let serial = 0;
  let beforeTransaction = null;
  const put = (collection, id, data) => rows.set(`${collection}/${id}`, plain(data));
  const ref = (collection, id) => ({
    id,
    async get() { return snapshot(collection, id); },
    async set(data, options = {}) { put(collection, id, options.merge ? { ...rows.get(`${collection}/${id}`), ...data } : data); },
  });
  const snapshot = (collection, id) => ({ id, exists: rows.has(`${collection}/${id}`), data: () => rows.get(`${collection}/${id}`), ref: ref(collection, id) });
  const query = (collection, filters = []) => ({
    doc: (id = `auto-${++serial}`) => ref(collection, id),
    where: (field, op, value) => query(collection, [...filters, [field, value]]),
    async get() { return { docs: [...rows].filter(([key, value]) => key.startsWith(collection + '/') && filters.every(([f, v]) => value[f] === v))
      .map(([key]) => snapshot(collection, key.slice(collection.length + 1))) }; },
  });
  const db = {
    collection: query,
    async runTransaction(callback) {
      beforeTransaction?.();
      const writes = [];
      const result = await callback({ get: (reference) => reference.get(),
        set: (reference, data) => writes.push(() => reference.set(data)),
        update: (reference, data) => writes.push(() => reference.set(data, { merge: true })),
      });
      for (const write of writes) await write();
      return result;
    },
  };
  put('submissionPrograms', programId, { name: 'Fall Contest', unrelated: 'keep', ...(identity ? { mailIdentity: identity } : {}) });
  for (const [id, outcome, email] of [['winner', 'winner', 'one@example.com'], ['circle', 'circle', 'two@example.com']]) {
    put('contentSubmissions', id, { contestSubmission: true, submissionProgramId: programId, title: id, contestOutcomeStatus: outcome, submitterEmail: email });
  }
  put('contestReviewAssignments', 'batch', { programId, reviewerEmail: 'sam@buttonpoetry.com', submissionIds: ['winner', 'circle'] });
  const context = vm.createContext({ createHash, db,
    app: { get: (route, fn) => routes.set('GET ' + route, fn), post: (route, fn) => routes.set('POST ' + route, fn) },
    getBoth: (v) => v,
    requireRole: async (req, res, allowed) => {
      if (!allowed.includes(req.role)) { res.status(req.role ? 403 : 401).json({ error: 'forbidden' }); return null; }
      return { decoded: { uid: 'admin-test' } };
    },
    normalizeText: (v) => String(v ?? '').trim(), normalizeKey: (v) => String(v ?? '').trim().toLowerCase(),
    mapSubmissionDoc: (doc) => ({ id: doc.id, ...doc.data() }),
    COLLECTIONS: Object.fromEntries(['submissionPrograms', 'contentSubmissions', 'submissionEntrants', 'contestOutcomeNotices', 'contestAssignmentNotices', 'contestReviewAssignments', 'contestSpotChecks', 'contestFinalistReads'].map((v) => [v, v])),
    FieldValue: { serverTimestamp: () => 'timestamp' },
    CONTEST_OUTCOME_EMAILS_ENABLED_PROGRAM_ID: programId, CONTEST_ASSIGNMENT_EMAILS_ENABLED: true,
    MANDRILL_AUTHOR_INVITE_API_KEY_SECRET: { value: () => 'fake-test-key' },
    buildContestAssignmentMessage: () => ({ subject: 'Assigned', text: 'Review your queue' }),
    sendAuthorInviteWithMandrill: async (args) => { sent.push(plain(args)); return { messageId: 'fake-delivery' }; },
  });
  vm.runInContext(identitySource + '\n' + mailSource, context);
  return { sent, rows, context, put, setBeforeTransaction(fn) { beforeTransaction = fn; },
    async call(method, route, body = {}, role = 'admin') {
      let code = 200; let data;
      const res = { status(value) { code = value; return this; }, json(value) { data = plain(value); return this; } };
      await routes.get(`${method} /admin/${route}`)({ body, query: body, role }, res);
      return { code, data };
    },
  };
}

const preview = (h) => h.call('GET', 'contestOutcomeEmailPreview', { programId });
const save = (h, mailIdentity = custom, role = 'admin') => h.call('POST', 'contestMailSettings', { programId, mailIdentity }, role);

test('settings default to the existing identity; saving only changes this program and sends nothing', async () => {
  const h = harness();
  const old = await h.call('GET', 'contestMailSettings', { programId });
  assert.equal(old.data.mailIdentity.fromEmail, 'no-reply@buttonpoetry.com');
  assert.equal(old.data.mailIdentity.replyTo, 'support@buttonpoetry.com');
  h.put('submissionPrograms', 'other', { name: 'Other' });
  assert.equal((await save(h, custom, 'contest_admin')).data.emailSent, false);
  assert.deepEqual((await preview(h)).data.mailIdentity, custom);
  assert.equal(h.rows.get('submissionPrograms/' + programId).unrelated, 'keep');
  assert.deepEqual(h.rows.get('submissionPrograms/other'), { name: 'Other' });
  assert.equal(h.sent.length, 0);
});

test('only admins and contest admins can read or save mail settings', async () => {
  const h = harness();
  for (const role of [undefined, 'team', 'author', 'contest_builder']) {
    assert.ok((await save(h, custom, role || null)).code >= 401);
    assert.ok((await h.call('GET', 'contestMailSettings', { programId }, role || null)).code >= 401);
  }
  assert.equal(h.sent.length, 0);
});

test('rejects external From domains, malformed addresses and header injection before writes', async () => {
  const h = harness();
  for (const change of [{ fromEmail: 'sam@other.org' }, { fromEmail: 'sam@buttonpoetry.com.attacker.org' },
    { replyTo: 'two@example.com,three@example.com' }, { replyTo: 'bad' },
    { replyTo: 'support@buttonpoetry.com\r\nBcc:evil@example.com' }, { fromName: 'Name\nBcc:evil@example.com' },
    { fromName: '' }, { fromName: 'x'.repeat(101) }]) {
    assert.equal((await save(h, { ...custom, ...change })).code, 400);
  }
  assert.equal(h.rows.get('submissionPrograms/' + programId).mailIdentity, undefined);
});

test('all identity fields invalidate an existing outcome preview', async () => {
  const h = harness();
  let before = (await preview(h)).data.recipients[0].previewToken;
  for (const identity of [custom, { ...custom, fromName: 'New name' }, { ...custom, replyTo: 'sam@buttonpoetry.com' }]) {
    await save(h, identity);
    const after = (await preview(h)).data.recipients[0].previewToken;
    assert.notEqual(after, before);
    before = after;
  }
});

test('outcomes reject stale identity, freeze actual headers, and never resend after settings change', async () => {
  const h = harness();
  const stale = (await preview(h)).data.recipients[0];
  await save(h);
  assert.equal((await h.call('POST', 'contestOutcomeEmails/send', { programId, email: stale.email, previewToken: stale.previewToken })).code, 409);
  const recipient = (await preview(h)).data.recipients[0];
  assert.equal((await h.call('POST', 'contestOutcomeEmails/send', { programId, email: recipient.email, previewToken: recipient.previewToken })).code, 200);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].fromEmail, custom.fromEmail);
  assert.equal(h.sent[0].replyTo, custom.replyTo);
  const receipt = [...h.rows].find(([key]) => key.startsWith('contestOutcomeNotices/'))[1];
  assert.deepEqual(receipt.mailIdentity, custom);
  await save(h, { ...custom, replyTo: 'sam@buttonpoetry.com' });
  const latest = (await preview(h)).data.recipients.find((r) => r.email === recipient.email);
  assert.equal((await h.call('POST', 'contestOutcomeEmails/send', { programId, email: latest.email, previewToken: latest.previewToken })).code, 409);
  assert.deepEqual(receipt.mailIdentity, custom);
  assert.equal(h.sent.length, 1);
});

test('a concurrent identity edit blocks reservation before transport', async () => {
  const h = harness(custom);
  const recipient = (await preview(h)).data.recipients[0];
  h.setBeforeTransaction(() => h.put('submissionPrograms', programId, { mailIdentity: { ...custom, fromName: 'Changed concurrently' } }));
  const result = await h.call('POST', 'contestOutcomeEmails/send', { programId, email: recipient.email, previewToken: recipient.previewToken });
  assert.equal(result.code, 409);
  assert.equal(h.sent.length, 0);
  assert.ok(![...h.rows.keys()].some((key) => key.startsWith('contestOutcomeNotices/')));
});

test('controlled tests bind sender identity into preview and record the actual headers', async () => {
  const h = harness();
  const body = { programId, email: 'sam@buttonpoetry.com', outcome: 'winner' };
  const old = (await h.call('POST', 'contestOutcomeEmails/test', body)).data;
  await save(h);
  assert.equal((await h.call('POST', 'contestOutcomeEmails/test', { ...body, commit: true, previewToken: old.previewToken })).code, 409);
  const current = (await h.call('POST', 'contestOutcomeEmails/test', body)).data;
  assert.deepEqual(current.mailIdentity, custom);
  assert.equal((await h.call('POST', 'contestOutcomeEmails/test', { ...body, commit: true, previewToken: current.previewToken })).code, 200);
  assert.deepEqual([...h.rows].find(([key]) => key.startsWith('contestOutcomeTestNotices/'))[1].mailIdentity, custom);
  assert.equal(h.sent[0].fromName, custom.fromName);
});

test('assignment notice freezes identity and retains its original duplicate fingerprint', async () => {
  const h = harness(custom);
  const body = { programId, reviewerEmail: 'sam@buttonpoetry.com', view: 'assigned' };
  assert.equal((await h.call('POST', 'contestAssignmentNotices/send', body)).code, 200);
  const receiptKey = 'contestAssignmentNotices/' + createHash('sha256').update(JSON.stringify([programId, body.reviewerEmail, body.view, ['circle', 'winner']])).digest('hex');
  assert.deepEqual(h.rows.get(receiptKey).mailIdentity, custom);
  await save(h, { ...custom, fromName: 'Changed' });
  assert.equal((await h.call('POST', 'contestAssignmentNotices/send', body)).code, 409);
  assert.equal(h.sent.length, 1);
});

const adminSource = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
function adminHarness(api) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', disabled: false, dataset: {} });
    return elements.get(id);
  };
  const state = { submissionProgramFilter: programId };
  const context = vm.createContext({ document: { getElementById: element }, state, api,
    escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('\"', '&quot;'),
  });
  vm.runInContext(adminSource.slice(adminSource.indexOf('    let contestEmailPreviewRecipients ='),
    adminSource.indexOf('    function contestEmailRecipientEligible(')) + '\n' +
    adminSource.slice(adminSource.indexOf('    function showContestEmailDraft('), adminSource.indexOf('    async function sendSelectedContestEmail(')), context);
  return { context, element, state };
}

test('admin form saves identity only, clears sendable previews and shows the saved headers', async () => {
  const calls = [];
  const h = adminHarness(async (path, options) => {
    calls.push({ path, options });
    return { mailIdentity: custom };
  });
  await h.context.loadContestMailSettings();
  assert.equal(h.element('contest-mail-from-email').value, custom.fromEmail);
  assert.equal(h.element('contest-mail-settings-fields').disabled, false);
  vm.runInContext(`contestEmailPreviewSendEnabled = true; contestEmailPreviewRecipients = [{email:'stale@example.com'}];`, h.context);
  await h.context.saveContestMailSettings({ preventDefault() {} });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].path, 'admin/contestMailSettings');
  assert.deepEqual(plain(calls[1].options.body), { programId, mailIdentity: custom });
  assert.equal(vm.runInContext('contestEmailPreviewSendEnabled', h.context), false);
  assert.equal(vm.runInContext('contestEmailPreviewRecipients.length', h.context), 0);
  assert.match(h.element('contest-mail-settings-status').textContent, /No email sent/);
  vm.runInContext(`contestEmailPreviewIdentity = ${JSON.stringify(custom)};
    contestEmailPreviewRecipients = [{email:'one@example.com',subject:'Outcome',body:'Message'}];`, h.context);
  h.context.showContestEmailDraft(0);
  assert.match(h.element('contest-email-preview-message').textContent, /From: Sam — Contest Team <sam@buttonpoetry.com>/);
  assert.match(h.element('contest-email-preview-message').textContent, /Replies go to: support@buttonpoetry.com/);
});

test('a late settings response cannot populate a different contest', async () => {
  let finish;
  const h = adminHarness(() => new Promise((resolve) => { finish = resolve; }));
  const loading = h.context.loadContestMailSettings();
  h.state.submissionProgramFilter = 'other-contest';
  finish({ mailIdentity: custom });
  await loading;
  assert.equal(h.element('contest-mail-settings-fields').disabled, true);
  assert.equal(h.element('contest-mail-settings-fields').dataset.programId, '');
  assert.equal(h.element('contest-mail-from-email').value, '');
});


test('default dropdown addresses are automatic and added addresses remain available after switching back', async () => {
  const h = harness();
  const defaults = (await h.call('GET', 'contestMailSettings', { programId })).data;
  assert.deepEqual(defaults.addressOptions, { fromEmail: ['no-reply@buttonpoetry.com'], replyTo: ['support@buttonpoetry.com'] });
  await save(h, { ...custom, replyTo: 'editor@buttonpoetry.com' });
  await save(h, defaults.mailIdentity);
  const loaded = (await h.call('GET', 'contestMailSettings', { programId })).data;
  assert.deepEqual(loaded.mailIdentity, defaults.mailIdentity);
  assert.deepEqual(loaded.addressOptions.fromEmail, ['no-reply@buttonpoetry.com', 'sam@buttonpoetry.com']);
  assert.deepEqual(loaded.addressOptions.replyTo, ['support@buttonpoetry.com', 'editor@buttonpoetry.com']);
  assert.equal(h.sent.length, 0);
});

test('dropdown history omits invalid saved addresses and stays within its contest', async () => {
  const h = harness();
  h.put('submissionPrograms', programId, { mailAddressOptions: { fromEmail: ['outsider@example.com', 'sam@buttonpoetry.com'], replyTo: ['bad', 'editor@buttonpoetry.com'] } });
  const loaded = (await h.call('GET', 'contestMailSettings', { programId })).data;
  assert.deepEqual(loaded.addressOptions.fromEmail, ['no-reply@buttonpoetry.com', 'sam@buttonpoetry.com']);
  assert.deepEqual(loaded.addressOptions.replyTo, ['support@buttonpoetry.com', 'editor@buttonpoetry.com']);
  h.put('submissionPrograms', 'other', { name: 'Other' });
  const other = (await h.call('GET', 'contestMailSettings', { programId: 'other' })).data;
  assert.deepEqual(other.addressOptions.replyTo, ['support@buttonpoetry.com']);
});

test('Add another address reveals the email field and saving adds the selected choice to the dropdown', async () => {
  const calls = [];
  const h = adminHarness(async (path, options) => {
    calls.push({ path, options });
    const mailIdentity = options?.body?.mailIdentity || { ...custom, fromEmail: 'no-reply@buttonpoetry.com' };
    return { mailIdentity, addressOptions: { fromEmail: ['no-reply@buttonpoetry.com', mailIdentity.fromEmail], replyTo: ['support@buttonpoetry.com'] } };
  });
  await h.context.loadContestMailSettings();
  assert.equal(h.element('contest-mail-from-email').value, 'no-reply@buttonpoetry.com');
  assert.equal(h.element('contest-mail-from-email-custom').disabled, true);
  h.element('contest-mail-from-email').value = '__other__';
  h.context.updateContestMailAddressField('contest-mail-from-email');
  assert.equal(h.element('contest-mail-from-email-custom-label').hidden, false);
  assert.equal(h.element('contest-mail-from-email-custom').required, true);
  h.element('contest-mail-from-email-custom').value = 'editor@buttonpoetry.com';
  await h.context.saveContestMailSettings({ preventDefault() {} });
  assert.equal(calls[1].options.body.mailIdentity.fromEmail, 'editor@buttonpoetry.com');
  assert.equal(h.element('contest-mail-from-email').value, 'editor@buttonpoetry.com');
  assert.match(h.element('contest-mail-from-email').innerHTML, /editor@buttonpoetry.com/);
  assert.match(h.element('contest-mail-from-email').innerHTML, /no-reply@buttonpoetry.com/);
  assert.equal(h.element('contest-mail-from-email-custom').disabled, true);
});

test('assignment sender confirmation rejects changed settings without sending or reserving a notice', async () => {
  const h = harness(custom);
  const body = { programId, reviewerEmail: 'sam@buttonpoetry.com', view: 'assigned', expectedMailIdentity: custom };
  await save(h, { ...custom, replyTo: 'sam@buttonpoetry.com' });
  assert.equal((await h.call('POST', 'contestAssignmentNotices/send', body)).code, 409);
  assert.equal(h.sent.length, 0);
  assert.ok(![...h.rows.keys()].some((key) => key.startsWith('contestAssignmentNotices/')));
});

const reviewSource = readFileSync(new URL('../public/contest-review.html', import.meta.url), 'utf8');
function reviewHarness(api) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', disabled: false, dataset: {}, addEventListener() {} });
    return elements.get(id);
  };
  element('program').value = programId;
  const context = vm.createContext({ document: { getElementById: element }, api,
    escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    window: { confirm: () => false },
  });
  vm.runInContext(reviewSource.slice(reviewSource.indexOf('    function updateContestMailAddressField('), reviewSource.indexOf('    async function loadProgress(')), context);
  return { context, element };
}

test('judging workspace exposes the same sender dropdowns and test preview headers', async () => {
  const calls = [];
  const h = reviewHarness(async (path, options) => {
    calls.push(path);
    if (path.startsWith('admin/contestMailSettings')) return { mailIdentity: custom, addressOptions: { fromEmail: ['no-reply@buttonpoetry.com', custom.fromEmail], replyTo: [custom.replyTo] } };
    if (path === 'admin/contestOutcomeEmails/test') return { programId, email: 'sam@buttonpoetry.com', outcome: 'winner', subject: 'Test', body: 'Sample', previewToken: 'fake-preview', mailIdentity: custom };
    throw new Error('Unexpected endpoint ' + path);
  });
  await h.context.loadContestMailSettings();
  assert.match(h.element('contest-mail-from-email').innerHTML, /no-reply@buttonpoetry.com/);
  h.element('contest-test-email').value = 'sam@buttonpoetry.com';
  h.element('contest-test-outcome').value = 'winner';
  await h.context.previewContestTestEmail();
  assert.match(h.element('contest-test-message').textContent, /From: Sam — Contest Team <sam@buttonpoetry.com>/);
  assert.match(h.element('contest-test-message').textContent, /Replies go to: support@buttonpoetry.com/);
  assert.equal(h.element('contest-test-send').disabled, false);
  await h.context.saveContestMailSettings({ preventDefault() {} });
  assert.equal(h.element('contest-test-send').disabled, true);
  assert.equal(vm.runInContext('contestEmailSendEnabled', h.context), false);
  assert.ok(!calls.some((path) => /Emails\/send|Notices\/send/.test(path)));
});

test('editing settings discards an outstanding test preview in the judging workspace', async () => {
  let finish;
  const h = reviewHarness(() => new Promise((resolve) => { finish = resolve; }));
  h.element('contest-test-email').value = 'sam@buttonpoetry.com';
  h.element('contest-test-outcome').value = 'winner';
  const loading = h.context.previewContestTestEmail();
  h.context.clearContestTestPreview();
  finish({ programId, email: 'sam@buttonpoetry.com', outcome: 'winner', mailIdentity: custom, subject: 'Test', body: 'Sample' });
  await loading;
  assert.equal(h.element('contest-test-send').disabled, true);
  assert.equal(h.element('contest-test-message').hidden, true);
});
