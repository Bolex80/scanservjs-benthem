export const ARCHIVE_SERVICE_URL_KEY = 'benthem.archive.serviceUrl';
export const ARCHIVE_LAST_FOLDER_KEY = 'benthem.archive.lastFolder';
export const ARCHIVE_DEFAULT_SERVICE_URL = 'http://192.168.2.60:8792';
export const ARCHIVE_POLL_INTERVAL_MS = 2000;
export const ARCHIVE_TIMEOUT_MS = 300000;

const ARCHIVE_PIPELINE_PREFIX = '@:pipeline.ocr';
const ARCHIVE_PIPELINE_SUFFIX = 'PDF (JPG | @:pipeline.high-quality)';
const ARCHIVE_PRESETS = {
  document: { resolution: 300, mode: 'colour' },
  photo: { resolution: 600, mode: 'colour' },
  quick: { resolution: 200, mode: 'greyscale' }
};

export function normaliseArchiveServiceUrl(value) {
  const url = (value || '').trim() || ARCHIVE_DEFAULT_SERVICE_URL;
  return url.replace(/\/+$/, '');
}

export function getArchiveServiceUrl(storage = localStorage) {
  return normaliseArchiveServiceUrl(storage.getItem(ARCHIVE_SERVICE_URL_KEY));
}

export function setArchiveServiceUrl(value, storage = localStorage) {
  storage.setItem(ARCHIVE_SERVICE_URL_KEY, (value || '').trim());
}

export function normaliseFolderPath(value) {
  return String(value ?? '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\/+|\/+$/g, '');
}

function folderTitle(path) {
  const parts = path.split('/');
  if (parts.length === 1) {
    return `${parts[0]}/`;
  }

  const parent = `${parts.slice(0, -1).join('/')}/`;
  return `${parent}${'  '.repeat(parts.length - 1)}├─ ${parts.at(-1)}`;
}

export function flattenFolders(payload) {
  const paths = [];
  const seen = new Set();

  function addPath(value) {
    const path = normaliseFolderPath(value);
    if (!path) {
      return;
    }

    const parts = path.split('/');
    parts.forEach((part, index) => {
      const ancestor = parts.slice(0, index + 1).join('/');
      if (!seen.has(ancestor)) {
        seen.add(ancestor);
        paths.push(ancestor);
      }
    });
  }

  function visit(node, parentPath = '') {
    if (!node) {
      return;
    }
    if (typeof node === 'string') {
      addPath(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(child => visit(child, parentPath));
      return;
    }
    if (typeof node !== 'object') {
      return;
    }

    const suppliedPath = node.path ?? node.relative_path ?? node.relative ?? node.value;
    const ownPath = suppliedPath !== undefined
      ? normaliseFolderPath(suppliedPath)
      : normaliseFolderPath(node.name
        ? [parentPath, node.name].filter(Boolean).join('/')
        : '');
    addPath(ownPath);

    const children = node.children ?? node.folders ?? node.tree ?? node.items ?? [];
    visit(children, ownPath || parentPath);
  }

  visit(payload);
  return paths.map(value => ({ title: folderTitle(value), value }));
}

export function normaliseLibraries(payload, locale = 'en') {
  const libraries = Array.isArray(payload) ? payload : payload?.libraries || [];
  const seen = new Set();
  const items = [];

  libraries.forEach(library => {
    const value = typeof library === 'string'
      ? library
      : library?.name || library?.value;
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);

    const title = typeof library === 'string'
      ? library
      : (locale.toLowerCase().startsWith('es')
        ? library.label_es || library.label
        : library.label) || value;
    items.push({ title, value });
  });

  return items;
}

export function findArchivePipeline(pipelines) {
  const index = (pipelines || []).findIndex(pipeline => {
    const description = typeof pipeline === 'string' ? pipeline : pipeline?.description;
    return description?.trim().startsWith(ARCHIVE_PIPELINE_PREFIX)
      && description.trim().endsWith(ARCHIVE_PIPELINE_SUFFIX);
  });

  if (index < 0) {
    return null;
  }
  const pipeline = pipelines[index];
  return {
    index,
    description: typeof pipeline === 'string' ? pipeline : pipeline.description
  };
}

export async function fetchArchiveChildren(serviceUrl, path = '', fetchImpl) {
  const request = (fetchImpl || fetch).bind(globalThis);
  const base = normaliseArchiveServiceUrl(serviceUrl);
  const response = await request(`${base}/folders/children?path=${encodeURIComponent(normaliseFolderPath(path))}`);
  if (!response.ok) {
    throw new Error(`Folder listing failed (${response.status})`);
  }
  const data = await response.json();
  return {
    path: normaliseFolderPath(data?.path ?? ''),
    parent: data?.parent === null ? null : normaliseFolderPath(data?.parent ?? ''),
    entries: Array.isArray(data?.entries) ? data.entries : []
  };
}

export async function fetchArchiveLibraries(serviceUrl, locale = 'en', fetchImpl) {
  const response = await requestJson(serviceUrl, '/libraries', {}, fetchImpl);
  return normaliseLibraries(response, locale);
}

function presetMode(preset, modeOptions) {
  const matcher = preset.mode === 'colour' ? /colou?r/i : /gr[ae]y/i;
  return (modeOptions || []).find(mode => matcher.test(mode))
    || (preset.mode === 'colour' ? 'Color' : 'Gray');
}

export function buildArchiveScanRequest(presetName, pipelines, modeOptions) {
  const preset = ARCHIVE_PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown archive quality preset: ${presetName}`);
  }
  const pipeline = findArchivePipeline(pipelines);
  if (!pipeline) {
    throw new Error('OCR high-quality PDF pipeline is unavailable');
  }

  return {
    pipeline: pipeline.description,
    resolution: preset.resolution,
    mode: presetMode(preset, modeOptions)
  };
}

export function createArchiveTitle(date = new Date(), slug = 'scan') {
  const pad = value => String(value).padStart(2, '0');
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const slugPart = String(slug)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${datePart}-${slugPart}`;
}

export function normaliseArchiveTitle(title) {
  return (title || '').trim().replace(/\.pdf$/i, '');
}

export function base64ToBlob(content) {
  const base64 = content.startsWith('data:') ? content.split(',')[1] : content;
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new Blob([bytes], { type: 'application/pdf' });
}

async function requestJson(serviceUrl, path, options = {}, fetchImpl) {
  const http = fetchImpl || fetch;
  const response = await http(`${normaliseArchiveServiceUrl(serviceUrl)}${path}`, options);
  const body = await response.json();
  if (!response.ok) {
    const message = typeof body === 'string' ? body : body?.error || body?.message || JSON.stringify(body);
    throw new Error(message || `Archive service returned ${response.status}`);
  }
  return body;
}

export async function fetchArchiveMetadata(serviceUrl, fetchImpl, locale = 'en') {
  const [folders, libraries] = await Promise.allSettled([
    requestJson(serviceUrl, '/folders', {}, fetchImpl),
    requestJson(serviceUrl, '/libraries', {}, fetchImpl)
  ]);

  return {
    serviceUrl: normaliseArchiveServiceUrl(serviceUrl),
    folders: folders.status === 'fulfilled' ? flattenFolders(folders.value) : [],
    libraries: libraries.status === 'fulfilled' ? normaliseLibraries(libraries.value, locale) : [],
    unreachable: folders.status === 'rejected' || libraries.status === 'rejected'
  };
}

function archiveJobError(job) {
  return job.error || job.message || 'Archive job failed';
}

export async function pollArchiveJob({
  serviceUrl,
  jobId,
  onProgress,
  fetchImpl,
  pollIntervalMs = ARCHIVE_POLL_INTERVAL_MS,
  timeoutMs = ARCHIVE_TIMEOUT_MS
}) {
  const startedAt = Date.now();

  while (true) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('Archive job timed out');
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('Archive job timed out');
    }

    const controller = new AbortController();
    let timedOut = false;
    const abortTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.max(0, timeoutMs - (Date.now() - startedAt)));

    let job;
    try {
      job = await requestJson(
        serviceUrl,
        `/jobs/${encodeURIComponent(jobId)}`,
        { signal: controller.signal },
        fetchImpl
      );
    } catch (error) {
      if (timedOut) {
        throw new Error('Archive job timed out', { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(abortTimer);
    }
    if (onProgress) {
      onProgress(job);
    }
    if (job.state === 'done') {
      return job;
    }
    if (job.state === 'error') {
      throw new Error(archiveJobError(job));
    }
  }
}

export async function archivePdf({
  serviceUrl,
  file,
  folder,
  title,
  collection,
  onProgress,
  fetchImpl,
  pollIntervalMs = ARCHIVE_POLL_INTERVAL_MS,
  timeoutMs = ARCHIVE_TIMEOUT_MS
}) {
  const archiveTitle = normaliseArchiveTitle(title);
  const form = new FormData();
  form.append('file', file, `${archiveTitle}.pdf`);
  form.append('folder', normaliseFolderPath(folder));
  form.append('title', archiveTitle);
  form.append('collection', collection || 'auto');

  const response = await requestJson(serviceUrl, '/archive', {
    method: 'POST',
    body: form
  }, fetchImpl);
  const jobId = response.job_id || response.id;
  if (!jobId) {
    throw new Error('Archive service did not return a job ID');
  }

  return await pollArchiveJob({
    serviceUrl,
    jobId,
    onProgress,
    fetchImpl,
    pollIntervalMs,
    timeoutMs
  });
}
