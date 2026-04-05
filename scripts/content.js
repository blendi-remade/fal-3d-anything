// 3D Web — Content Script
// Handles image replacement with loading overlays and 3D viewer iframes

(() => {
  // Track the last right-clicked image element
  let lastRightClickedImg = null;
  // Map of image URLs to their original elements and overlay containers
  const trackedImages = new Map();
  // Viewer base URL (fetched from background)
  let viewerBaseUrl = null;

  // Get the viewer URL from the extension, then restore any saved conversions
  chrome.runtime.sendMessage({ action: 'getViewerUrl' }, (response) => {
    if (response?.viewerUrl) {
      viewerBaseUrl = response.viewerUrl;
      restoreSavedConversions();
    }
  });

  // ── Persistence ──

  function getPageKey() {
    return window.location.href.split('#')[0]; // strip hash
  }

  function saveConversion(imageUrl, result) {
    const pageKey = getPageKey();
    chrome.storage.local.get('h3d_conversions', (data) => {
      const conversions = data.h3d_conversions || {};
      if (!conversions[pageKey]) conversions[pageKey] = [];

      // Don't duplicate
      const exists = conversions[pageKey].some(c => c.imageUrl === imageUrl);
      if (!exists) {
        conversions[pageKey].push({ imageUrl, result });
      }

      chrome.storage.local.set({ h3d_conversions: conversions });
    });
  }

  function removeConversion(imageUrl) {
    const pageKey = getPageKey();
    chrome.storage.local.get('h3d_conversions', (data) => {
      const conversions = data.h3d_conversions || {};
      if (conversions[pageKey]) {
        conversions[pageKey] = conversions[pageKey].filter(c => c.imageUrl !== imageUrl);
        if (conversions[pageKey].length === 0) delete conversions[pageKey];
        chrome.storage.local.set({ h3d_conversions: conversions });
      }
    });
  }

  let isRestoring = false;

  function restoreSavedConversions() {
    const pageKey = getPageKey();
    chrome.storage.local.get('h3d_conversions', (data) => {
      const conversions = data.h3d_conversions || {};
      const pageConversions = conversions[pageKey];
      if (!pageConversions || pageConversions.length === 0) return;

      isRestoring = true;

      function tryRestore() {
        let allFound = true;
        for (const { imageUrl, result } of pageConversions) {
          // Skip if already restored
          if (trackedImages.has(imageUrl)) continue;

          const img = findImageElement(imageUrl);
          if (!img) { allFound = false; continue; }

          const width = Math.max(img.offsetWidth, 200);
          const height = Math.max(img.offsetHeight, 200);

          const container = document.createElement('div');
          container.className = 'h3d-overlay-container';
          container.style.width = width + 'px';
          container.style.height = height + 'px';

          img.style.display = 'none';
          img.parentElement.insertBefore(container, img.nextSibling);

          trackedImages.set(imageUrl, {
            originalImg: img,
            container,
            width,
            height,
          });

          replaceWithViewer(imageUrl, result);
        }

        // If some images weren't found yet (lazy-loaded), retry a few times
        if (!allFound && restoreRetries < 5) {
          restoreRetries++;
          setTimeout(tryRestore, 1000);
        } else {
          isRestoring = false;
        }
      }

      let restoreRetries = 0;
      tryRestore();
    });
  }

  // ── Track right-clicked images ──

  document.addEventListener('contextmenu', (e) => {
    const img = e.target.closest('img') || (e.target.tagName === 'IMG' ? e.target : null);
    if (img) {
      lastRightClickedImg = img;
    }
  }, true);

  // ── Message handler from background ──

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'showLoading':
        showLoadingOverlay(message.imageUrl);
        break;
      case 'statusUpdate':
        updateLoadingStatus(message.imageUrl, message.status);
        break;
      case 'generationComplete':
        replaceWithViewer(message.imageUrl, message.result);
        break;
      case 'generationError':
        showError(message.imageUrl, message.error);
        break;
    }
  });

  // ── Find the image element for a given URL ──

  function findImageElement(url) {
    // First try the last right-clicked image
    if (lastRightClickedImg && isSameImage(lastRightClickedImg, url)) {
      return lastRightClickedImg;
    }
    // Search all images on the page
    const images = document.querySelectorAll('img');
    for (const img of images) {
      if (isSameImage(img, url)) return img;
    }
    return null;
  }

  function isSameImage(img, url) {
    return img.src === url ||
      img.currentSrc === url ||
      img.getAttribute('src') === url ||
      img.src === decodeURIComponent(url) ||
      decodeURIComponent(img.src) === decodeURIComponent(url);
  }

  // ── Loading Overlay ──

  function showLoadingOverlay(imageUrl) {
    const img = findImageElement(imageUrl);
    if (!img) return;

    const rect = img.getBoundingClientRect();
    const width = Math.max(img.offsetWidth, 200);
    const height = Math.max(img.offsetHeight, 200);

    // Create overlay container
    const container = document.createElement('div');
    container.className = 'h3d-overlay-container';
    container.style.width = width + 'px';
    container.style.height = height + 'px';

    container.innerHTML = `
      <div class="h3d-loading-overlay">
        <svg class="h3d-fal-spinner" viewBox="0 0 624 624" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" clipRule="evenodd" d="M402.365 0C413.17 0.000231771 421.824 8.79229 422.858 19.5596C432.087 115.528 508.461 191.904 604.442 201.124C615.198 202.161 624 210.821 624 221.638V402.362C624 413.179 615.198 421.839 604.442 422.876C508.461 432.096 432.087 508.472 422.858 604.44C421.824 615.208 413.17 624 402.365 624H221.635C210.83 624 202.176 615.208 201.142 604.44C191.913 508.472 115.538 432.096 19.5576 422.876C8.80183 421.839 0 413.179 0 402.362V221.638C0 210.821 8.80183 202.161 19.5576 201.124C115.538 191.904 191.913 115.528 201.142 19.5596C202.176 8.79215 210.83 0 221.635 0H402.365ZM312 124C208.17 124 124 208.17 124 312C124 415.83 208.17 500 312 500C415.83 500 500 415.83 500 312C500 208.17 415.83 124 312 124Z"/>
        </svg>
        <div class="h3d-loading-text">Generating 3D model...</div>
        <div class="h3d-loading-subtext">This may take a minute</div>
      </div>
    `;

    // Replace image with overlay
    img.style.display = 'none';
    img.parentElement.insertBefore(container, img.nextSibling);

    trackedImages.set(imageUrl, {
      originalImg: img,
      container,
      width,
      height,
    });
  }

  function updateLoadingStatus(imageUrl, status) {
    const tracked = trackedImages.get(imageUrl);
    if (!tracked) return;

    const textEl = tracked.container.querySelector('.h3d-loading-text');
    if (!textEl) return;

    const messages = {
      queued: 'Waiting in queue...',
      processing: 'Generating 3D model...',
      generating: 'Starting generation...',
    };

    textEl.textContent = messages[status] || 'Processing...';
  }

  // ── Replace with 3D Viewer ──

  function replaceWithViewer(imageUrl, result) {
    const tracked = trackedImages.get(imageUrl);
    if (!tracked) return;

    const { container, width, height } = tracked;

    // Build viewer URL with params
    const glbParam = encodeURIComponent(result.glbUrl);
    const thumbParam = result.thumbnailUrl ? `&thumb=${encodeURIComponent(result.thumbnailUrl)}` : '';
    const titleParam = `&title=${encodeURIComponent(document.title)}`;
    const iframeSrc = `${viewerBaseUrl}?glb=${glbParam}${thumbParam}${titleParam}&mode=inline`;

    // Create viewer container
    const viewerContainer = document.createElement('div');
    viewerContainer.className = 'h3d-viewer-container';
    viewerContainer.style.width = width + 'px';
    viewerContainer.style.height = Math.max(height, 300) + 'px';

    // Block ancestor <a> tag clicks (e.g. Wikipedia wraps images in links)
    viewerContainer.addEventListener('click', (e) => { e.preventDefault(); });

    viewerContainer.innerHTML = `
      <iframe
        class="h3d-viewer-iframe"
        src="${iframeSrc}"
        frameborder="0"
        allowfullscreen
        allow="autoplay; xr-spatial-tracking"
      ></iframe>
      <div class="h3d-viewer-controls">
        <button class="h3d-btn h3d-fullscreen-btn" title="Fullscreen 3D Viewer">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="h3d-btn h3d-restore-btn" title="Restore original image">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 1v4H0M12 15v-4h4M0 5C1 2.5 3.5 1 6.5 1 9.5 1 12 2.5 14 5M16 11c-1 2.5-3.5 4-6.5 4-3 0-5.5-1.5-7.5-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <span class="h3d-badge">3D</span>
      </div>
    `;

    // Fullscreen button — preventDefault stops ancestor <a> tags from navigating
    viewerContainer.querySelector('.h3d-fullscreen-btn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const fullUrl = `${viewerBaseUrl}?glb=${glbParam}${thumbParam}${titleParam}&mode=fullscreen`;
      window.open(fullUrl, '_blank');
    });

    // Restore button
    viewerContainer.querySelector('.h3d-restore-btn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      restoreImage(imageUrl);
    });

    // Replace loading overlay with viewer
    container.replaceWith(viewerContainer);
    trackedImages.set(imageUrl, {
      ...tracked,
      container: viewerContainer,
      result,
    });

    // Persist this conversion (skip if we're restoring from storage)
    if (!isRestoring) {
      saveConversion(imageUrl, result);
    }
  }

  // ── Restore original image ──

  function restoreImage(imageUrl) {
    const tracked = trackedImages.get(imageUrl);
    if (!tracked) return;

    tracked.container.remove();
    tracked.originalImg.style.display = '';
    trackedImages.delete(imageUrl);

    // Remove from persistence
    removeConversion(imageUrl);
  }

  // ── Error handling ──

  function showError(imageUrl, errorMessage) {
    const tracked = trackedImages.get(imageUrl);
    if (!tracked) {
      // If no overlay exists, try to find the image and create an error overlay
      const img = findImageElement(imageUrl);
      if (!img) return;
      showLoadingOverlay(imageUrl);
      return showError(imageUrl, errorMessage);
    }

    const { container } = tracked;

    container.innerHTML = `
      <div class="h3d-error-overlay">
        <div class="h3d-error-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="2"/>
            <line x1="15" y1="9" x2="9" y2="15" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
            <line x1="9" y1="9" x2="15" y2="15" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="h3d-error-text">${escapeHtml(errorMessage)}</div>
        <button class="h3d-btn h3d-retry-btn">Restore Image</button>
      </div>
    `;

    container.querySelector('.h3d-retry-btn').addEventListener('click', () => {
      restoreImage(imageUrl);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
