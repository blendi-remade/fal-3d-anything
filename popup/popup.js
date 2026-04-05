// 3D Web — Popup Script

const $ = (sel) => document.querySelector(sel);

const state = {
  hasApiKey: false,
  isApiKeyVisible: false,
  isApiCardOpen: false,
};

// ── Init ──

document.addEventListener('DOMContentLoaded', async () => {
  await checkApiKey();
  await checkStatus();
  bindEvents();
});

// ── API Key Management ──

async function checkApiKey() {
  const { falApiKey } = await chrome.storage.local.get('falApiKey');
  state.hasApiKey = !!falApiKey;

  const statusEl = $('#apiStatus');
  const bodyEl = $('#apiBody');
  const inputEl = $('#apiKeyInput');

  if (state.hasApiKey) {
    statusEl.textContent = 'Configured';
    statusEl.classList.add('configured');
    inputEl.value = '';
    inputEl.placeholder = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
    bodyEl.classList.remove('open');
    state.isApiCardOpen = false;
  } else {
    statusEl.textContent = 'Not configured';
    statusEl.classList.remove('configured');
    bodyEl.classList.add('open');
    state.isApiCardOpen = true;
  }
}

async function saveApiKey() {
  const input = $('#apiKeyInput');
  const key = input.value.trim();

  if (!key) {
    showToast('Please enter an API key', 'error');
    return;
  }

  await chrome.storage.local.set({ falApiKey: key });
  state.hasApiKey = true;
  showToast('API key saved!', 'success');
  await checkApiKey();
}

function toggleApiCard() {
  state.isApiCardOpen = !state.isApiCardOpen;
  const bodyEl = $('#apiBody');
  bodyEl.classList.toggle('open', state.isApiCardOpen);
}

function toggleKeyVisibility() {
  const input = $('#apiKeyInput');
  state.isApiKeyVisible = !state.isApiKeyVisible;
  input.type = state.isApiKeyVisible ? 'text' : 'password';
}

// ── Status Polling ──

let pollInterval = null;

async function checkStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });

    if (response.operation) {
      showStatusSection(response);
      startPolling();
    } else if (response.result) {
      showResultSection(response.result, response.selectedImage);
    } else if (response.error) {
      showToast(response.error, 'error');
      showEmptySection();
    } else {
      showEmptySection();
    }
  } catch {
    showEmptySection();
  }
}

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(async () => {
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
    if (!response.operation) {
      stopPolling();
      if (response.result) {
        showResultSection(response.result, response.selectedImage);
      } else if (response.error) {
        showToast(response.error, 'error');
        showEmptySection();
      }
    } else {
      updateStatusText(response);
    }
  }, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ── UI Sections ──

function showStatusSection(response) {
  $('#statusSection').style.display = '';
  $('#resultSection').style.display = 'none';
  $('#emptySection').style.display = 'none';
  updateStatusText(response);

  if (response.selectedImage?.url) {
    $('#statusImage').innerHTML = `<img src="${escapeAttr(response.selectedImage.url)}" alt="Source image"/>`;
  }
}

function updateStatusText(response) {
  const title = $('#statusTitle');
  const detail = $('#statusDetail');

  if (response.operation === 'generating') {
    title.textContent = 'Generating 3D model...';
    detail.textContent = 'This may take up to a minute';
  }
}

function showResultSection(result, selectedImage) {
  $('#statusSection').style.display = 'none';
  $('#resultSection').style.display = '';
  $('#emptySection').style.display = 'none';

  const previewSrc = result.thumbnailUrl || '';
  if (previewSrc) {
    $('#resultPreview').innerHTML = `<img src="${escapeAttr(previewSrc)}" alt="3D model preview"/>`;
  } else {
    $('#resultPreview').innerHTML = `<p style="padding:20px;text-align:center;color:var(--text-muted)">3D model generated!</p>`;
  }

  // Store result for button handlers
  state.currentResult = result;
}

function showEmptySection() {
  $('#statusSection').style.display = 'none';
  $('#resultSection').style.display = 'none';
  $('#emptySection').style.display = '';
}

// ── Event Bindings ──

function bindEvents() {
  $('#apiToggle').addEventListener('click', toggleApiCard);
  $('#saveKeyBtn').addEventListener('click', saveApiKey);
  $('#toggleVisibility').addEventListener('click', toggleKeyVisibility);

  // Enter key saves API key
  $('#apiKeyInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveApiKey();
  });

  // Open 3D viewer in new tab
  $('#openViewerBtn').addEventListener('click', () => {
    if (!state.currentResult?.glbUrl) return;
    const viewerUrl = chrome.runtime.getURL('viewer/viewer.html');
    const glb = encodeURIComponent(state.currentResult.glbUrl);
    const thumb = state.currentResult.thumbnailUrl ? `&thumb=${encodeURIComponent(state.currentResult.thumbnailUrl)}` : '';
    window.open(`${viewerUrl}?glb=${glb}${thumb}&mode=fullscreen`, '_blank');
  });

  // Download GLB
  $('#downloadBtn').addEventListener('click', async () => {
    if (!state.currentResult?.glbUrl) return;
    try {
      const response = await fetch(state.currentResult.glbUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'model.glb';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(state.currentResult.glbUrl, '_blank');
    }
  });
}

// ── Helpers ──

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
