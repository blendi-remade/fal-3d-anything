// 3D Web — Background Service Worker
// Handles context menu, fal.ai Hunyuan 3D queue API, and message routing

const FAL_ENDPOINT = 'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d';
const FAL_RUN_URL = `https://fal.run/${FAL_ENDPOINT}`;
const FAL_QUEUE_URL = `https://queue.fal.run/${FAL_ENDPOINT}`;
const POLL_INTERVAL = 4000; // 4 seconds between status checks

// Storage keys
const STORAGE = {
  SELECTED_IMAGE: 'h3d_selectedImage',
  RESULT: 'h3d_result',
  OPERATION: 'h3d_operation',
  OPERATION_ERROR: 'h3d_operationError',
  REQUEST_ID: 'h3d_requestId',
};

// ── Context Menu ──

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'transform-to-3d',
    title: 'Transform to 3D',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'transform-to-3d') return;

  const imageUrl = info.srcUrl;
  if (!imageUrl) return;

  const selectedImage = {
    url: imageUrl,
    tabId: tab.id,
    pageUrl: tab.url,
    pageTitle: tab.title,
    timestamp: Date.now(),
  };

  await chrome.storage.local.set({
    [STORAGE.SELECTED_IMAGE]: selectedImage,
    [STORAGE.RESULT]: null,
    [STORAGE.OPERATION]: null,
    [STORAGE.OPERATION_ERROR]: null,
    [STORAGE.REQUEST_ID]: null,
  });

  // Tell content script to show loading overlay on the image
  chrome.tabs.sendMessage(tab.id, {
    action: 'showLoading',
    imageUrl,
  });

  // Start the 3D generation
  startGeneration(selectedImage);
});

// ── Keep-alive for MV3 service worker ──

let keepAliveInterval = null;

function startKeepAlive() {
  if (keepAliveInterval) return;
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo();
  }, 25000);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// ── API Key ──

async function getApiKey() {
  const { falApiKey } = await chrome.storage.local.get('falApiKey');
  return falApiKey || null;
}

// ── Image fetching ──

async function fetchImageAsBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('Failed to fetch image as base64:', e);
    return null;
  }
}

// ── 3D Generation Pipeline ──

async function startGeneration(selectedImage) {
  startKeepAlive();

  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error('No API key configured. Click the extension icon to set your fal.ai key.');
    }

    await chrome.storage.local.set({ [STORAGE.OPERATION]: 'generating' });
    notifyTab(selectedImage.tabId, { action: 'statusUpdate', status: 'generating', imageUrl: selectedImage.url });

    // Try base64 first, fall back to direct URL
    let imageInput = await fetchImageAsBase64(selectedImage.url);
    if (!imageInput) {
      imageInput = selectedImage.url;
    }

    // First try synchronous fal.run endpoint
    // If it times out or fails, fall back to queue-based approach
    let result;
    try {
      result = await callFalSync(apiKey, imageInput);
    } catch (syncErr) {
      console.warn('Sync call failed, trying queue:', syncErr.message);
      result = await callFalQueue(apiKey, imageInput, selectedImage);
    }

    const glbUrl = result.model_glb?.url || result.model_urls?.glb?.url;
    const thumbnailUrl = result.thumbnail?.url;

    if (!glbUrl) {
      throw new Error('No GLB model URL in response');
    }

    const resultData = {
      glbUrl,
      thumbnailUrl,
      modelUrls: result.model_urls,
      seed: result.seed,
      timestamp: Date.now(),
    };

    await chrome.storage.local.set({
      [STORAGE.RESULT]: resultData,
      [STORAGE.OPERATION]: null,
    });

    notifyTab(selectedImage.tabId, {
      action: 'generationComplete',
      imageUrl: selectedImage.url,
      result: resultData,
    });

  } catch (error) {
    console.error('Generation failed:', error);
    await chrome.storage.local.set({
      [STORAGE.OPERATION]: null,
      [STORAGE.OPERATION_ERROR]: error.message,
    });
    notifyTab(selectedImage.tabId, {
      action: 'generationError',
      imageUrl: selectedImage.url,
      error: error.message,
    });
  } finally {
    stopKeepAlive();
  }
}

// Synchronous call — blocks until result is ready
async function callFalSync(apiKey, imageInput) {
  const response = await fetch(FAL_RUN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input_image_url: imageInput,
      generate_type: 'Normal',
      face_count: 500000,
      enable_pbr: true,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.detail?.[0]?.msg || err.detail || err.message || `API error ${response.status}`;
    throw new Error(msg);
  }

  return await response.json();
}

// Queue-based fallback — submit, poll status, fetch result
async function callFalQueue(apiKey, imageInput, selectedImage) {
  const submitResponse = await fetch(FAL_QUEUE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input_image_url: imageInput,
      generate_type: 'Normal',
      face_count: 500000,
      enable_pbr: true,
    }),
  });

  if (!submitResponse.ok) {
    const err = await submitResponse.json().catch(() => ({}));
    const msg = err.detail?.[0]?.msg || err.detail || err.message || `Queue submit error ${submitResponse.status}`;
    throw new Error(msg);
  }

  const submitData = await submitResponse.json();
  const requestId = submitData.request_id;

  // Use URLs from the response if provided, else construct them
  const statusUrl = submitData.status_url || `${FAL_QUEUE_URL}/requests/${requestId}/status`;
  const responseUrl = submitData.response_url || `${FAL_QUEUE_URL}/requests/${requestId}`;

  // Poll for completion
  while (true) {
    await sleep(POLL_INTERVAL);

    const statusResponse = await fetch(statusUrl, {
      headers: { 'Authorization': `Key ${apiKey}` },
    });

    if (!statusResponse.ok) {
      throw new Error(`Status check failed: ${statusResponse.status}`);
    }

    const statusData = await statusResponse.json();

    if (statusData.status === 'COMPLETED') {
      const resultResponse = await fetch(responseUrl, {
        headers: { 'Authorization': `Key ${apiKey}` },
      });

      if (!resultResponse.ok) {
        throw new Error(`Result fetch failed: ${resultResponse.status}`);
      }

      return await resultResponse.json();
    }

    if (statusData.status === 'FAILED') {
      throw new Error('3D generation failed on the server. Please try again.');
    }

    // Update content script with status
    if (selectedImage?.tabId) {
      notifyTab(selectedImage.tabId, {
        action: 'statusUpdate',
        status: statusData.status === 'IN_QUEUE' ? 'queued' : 'processing',
        imageUrl: selectedImage.url,
      });
    }
  }
}

// ── Message Router ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getApiKey') {
    getApiKey().then(key => sendResponse({ hasKey: !!key }));
    return true;
  }

  if (message.action === 'saveApiKey') {
    chrome.storage.local.set({ falApiKey: message.apiKey }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'getStatus') {
    chrome.storage.local.get([
      STORAGE.OPERATION,
      STORAGE.OPERATION_ERROR,
      STORAGE.RESULT,
      STORAGE.SELECTED_IMAGE,
    ]).then(data => {
      sendResponse({
        operation: data[STORAGE.OPERATION],
        error: data[STORAGE.OPERATION_ERROR],
        result: data[STORAGE.RESULT],
        selectedImage: data[STORAGE.SELECTED_IMAGE],
      });
    });
    return true;
  }

  if (message.action === 'cancelOperation') {
    chrome.storage.local.set({
      [STORAGE.OPERATION]: null,
      [STORAGE.OPERATION_ERROR]: null,
    }).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'getViewerUrl') {
    const url = chrome.runtime.getURL('viewer/viewer.html');
    sendResponse({ viewerUrl: url });
    return true;
  }
});

// ── Helpers ──

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function notifyTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch(() => {
    // Tab may be closed or navigated away
  });
}
