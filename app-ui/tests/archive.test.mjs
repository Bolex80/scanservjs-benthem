import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARCHIVE_POLL_INTERVAL_MS,
  ARCHIVE_TIMEOUT_MS,
  archivePdf,
  base64ToBlob,
  buildArchiveScanRequest,
  createArchiveTitle,
  fetchArchiveChildren,
  fetchArchiveLibraries,
  fetchArchiveMetadata,
  findArchivePipeline,
  flattenFolders,
  normaliseArchiveTitle,
  normaliseLibraries,
  pollArchiveJob
} from '../src/classes/archive.js';

const pipelines = [
  'JPG | @:pipeline.high-quality',
  'PDF (JPG | @:pipeline.high-quality)',
  '@:pipeline.ocr | @:pipeline.text-file',
  '@:pipeline.ocr | PDF (JPG | @:pipeline.high-quality)',
  '@:pipeline.ocr | PDF (JPG | @:pipeline.low-quality)'
];

function jsonResponse(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    async json() {
      return body;
    }
  };
}

test('flattens a folder tree into indented relative paths without duplicates', () => {
  const result = flattenFolders({
    folders: [
      {
        name: 'Documents',
        children: [
          { name: 'Scans', children: [{ name: '2026' }] },
          { name: 'Scans' }
        ]
      },
      'Invoices/Suppliers'
    ]
  });

  assert.deepEqual(result, [
    { title: 'Documents/', value: 'Documents' },
    { title: 'Documents/  ├─ Scans', value: 'Documents/Scans' },
    { title: 'Documents/Scans/    ├─ 2026', value: 'Documents/Scans/2026' },
    { title: 'Invoices/', value: 'Invoices' },
    { title: 'Invoices/  ├─ Suppliers', value: 'Invoices/Suppliers' }
  ]);
});

test('accepts the archive service tree response with trailing-slash paths', () => {
  assert.deepEqual(flattenFolders({
    root: '/mnt/tank-fast-documents',
    tree: [{
      name: 'Documents',
      path: 'Documents/',
      depth: 1,
      children: [{ name: 'Scans', path: 'Documents/Scans/', depth: 2, children: [] }]
    }]
  }), [
    { title: 'Documents/', value: 'Documents' },
    { title: 'Documents/  ├─ Scans', value: 'Documents/Scans' }
  ]);
});

test('normalises labelled libraries and selects Spanish labels', () => {
  assert.deepEqual(normaliseLibraries({
    libraries: [
      'documents',
      { name: 'personal-finance', label: 'Personal finance', label_es: 'Finanzas personales' }
    ]
  }, 'es'), [
    { title: 'documents', value: 'documents' },
    { title: 'Finanzas personales', value: 'personal-finance' }
  ]);
});

test('finds the OCR high-quality PDF pipeline by description', () => {
  assert.deepEqual(findArchivePipeline(pipelines), {
    index: 3,
    description: pipelines[3]
  });
  assert.equal(findArchivePipeline(pipelines.slice(0, 3)), null);
});

test('maps every quality preset to pipeline, resolution, and supported mode', () => {
  const modes = ['Lineart', 'Gray', '24bitColor'];
  assert.deepEqual(buildArchiveScanRequest('document', pipelines, modes), {
    pipeline: pipelines[3],
    resolution: 300,
    mode: '24bitColor'
  });
  assert.deepEqual(buildArchiveScanRequest('photo', pipelines, modes), {
    pipeline: pipelines[3],
    resolution: 600,
    mode: '24bitColor'
  });
  assert.deepEqual(buildArchiveScanRequest('quick', pipelines, modes), {
    pipeline: pipelines[3],
    resolution: 200,
    mode: 'Gray'
  });
});

test('creates editable local-date titles and removes a PDF extension', () => {
  const date = new Date(2026, 10, 19, 12);
  assert.equal(createArchiveTitle(date), '2026-11-19-scan');
  assert.equal(createArchiveTitle(date, ''), '2026-11-19-');
  assert.equal(normaliseArchiveTitle('  2026-11-19-receipt.PDF  '), '2026-11-19-receipt');
});

test('decodes base64 PDF content into a PDF blob', async () => {
  const blob = base64ToBlob('JVBERi0xLjQ=');
  assert.equal(blob.type, 'application/pdf');
  assert.equal(Buffer.from(await blob.arrayBuffer()).toString(), '%PDF-1.4');
});

test('loads archive metadata and retains partial data when a request fails', async () => {
  const result = await fetchArchiveMetadata('http://archive.test/', async (url) => {
    if (url.endsWith('/folders')) {
      return jsonResponse({ folders: ['Documents'] });
    }
    throw new TypeError('network down');
  });

  assert.equal(result.unreachable, true);
  assert.deepEqual(result.folders, [{ title: 'Documents/', value: 'Documents' }]);
  assert.deepEqual(result.libraries, []);
  assert.equal(result.serviceUrl, 'http://archive.test');
});

test('fetches one folder level (children) with guards', async () => {
  const calls = [];
  const out = await fetchArchiveChildren('http://archive.test/', 'Casa/Churriana', async (url) => {
    calls.push(url);
    return jsonResponse({ path: 'Casa/Churriana', parent: 'Casa', entries: [{ name: 'Recibos', path: 'Casa/Churriana/Recibos' }] });
  });
  assert.match(calls[0], /\/folders\/children\?path=Casa%2FChurriana$/);
  assert.deepEqual(out.entries.map((e) => e.name), ['Recibos']);
  assert.equal(out.parent, 'Casa');
});

test('fetches libraries with localized labels', async () => {
  const out = await fetchArchiveLibraries('http://archive.test/', 'es', async () =>
    jsonResponse({ libraries: [{ name: 'documents', label: 'General documents', label_es: 'Documentos generales' }] }));
  assert.deepEqual(out, [{ title: 'Documentos generales', value: 'documents' }]);
});

test('uploads multipart PDF fields and polls until done', async () => {
  const requests = [];
  const progress = [];
  const blob = base64ToBlob('JVBERi0xLjQ=');
  const result = await archivePdf({
    serviceUrl: 'http://archive.test/',
    file: blob,
    folder: 'Documents/Scans',
    title: '2026-11-19-receipt',
    collection: 'auto',
    onProgress: job => progress.push(job.state),
    pollIntervalMs: 0,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (url.endsWith('/archive')) {
        assert.equal(options.method, 'POST');
        assert.ok(options.body instanceof FormData);
        assert.equal(options.body.get('folder'), 'Documents/Scans');
        assert.equal(options.body.get('title'), '2026-11-19-receipt');
        assert.equal(options.body.get('collection'), 'auto');
        assert.equal(options.body.get('file').name, '2026-11-19-receipt.pdf');
        return jsonResponse({ job_id: 'job-1' });
      }
      assert.equal(url, 'http://archive.test/jobs/job-1');
      return jsonResponse(requests.length === 2
        ? { state: 'processing' }
        : { state: 'done', path: 'Documents/Scans/receipt.pdf', collection: 'documents', chunks: 4 });
    }
  });

  assert.equal(result.state, 'done');
  assert.deepEqual(progress, ['processing', 'done']);
  assert.equal(ARCHIVE_POLL_INTERVAL_MS, 2000);
  assert.equal(ARCHIVE_TIMEOUT_MS, 300000);
});

test('surfaces archive job errors', async () => {
  await assert.rejects(
    pollArchiveJob({
      serviceUrl: 'http://archive.test',
      jobId: 'job-2',
      pollIntervalMs: 0,
      fetchImpl: async () => jsonResponse({ state: 'error', error: 'OCR failed' })
    }),
    /OCR failed/
  );
});

test('aborts a hung poll request at the client timeout', async () => {
  await assert.rejects(
    pollArchiveJob({
      serviceUrl: 'http://archive.test',
      jobId: 'job-hung',
      pollIntervalMs: 0,
      timeoutMs: 5,
      fetchImpl: async (url, options) => await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('fetch still running')), 20);
        options.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        });
      })
    }),
    /timed out/
  );
});

test('polling has a client-side timeout', async () => {
  await assert.rejects(
    pollArchiveJob({
      serviceUrl: 'http://archive.test',
      jobId: 'job-3',
      timeoutMs: -1,
      fetchImpl: async () => jsonResponse({ state: 'processing' })
    }),
    /timed out/
  );
});
