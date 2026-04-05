// 3D Web — Content Script
// Handles image replacement with loading overlays and 3D viewer iframes

(() => {
  // Track the last right-clicked image element
  let lastRightClickedImg = null;
  // Map of image URLs to their original elements and overlay containers
  const trackedImages = new Map();
  // Viewer base URL (fetched from background)
  let viewerBaseUrl = null;

  // Get the viewer URL from the extension
  chrome.runtime.sendMessage({ action: 'getViewerUrl' }, (response) => {
    if (response?.viewerUrl) viewerBaseUrl = response.viewerUrl;
  });

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
        <div class="h3d-spinner">
          <div class="h3d-cube">
            <div class="h3d-face h3d-front"></div>
            <div class="h3d-face h3d-back"></div>
            <div class="h3d-face h3d-left"></div>
            <div class="h3d-face h3d-right"></div>
            <div class="h3d-face h3d-top"></div>
            <div class="h3d-face h3d-bottom"></div>
          </div>
        </div>
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
    const iframeSrc = `${viewerBaseUrl}?glb=${glbParam}${thumbParam}&mode=inline`;

    // Create viewer container
    const viewerContainer = document.createElement('div');
    viewerContainer.className = 'h3d-viewer-container';
    viewerContainer.style.width = width + 'px';
    viewerContainer.style.height = Math.max(height, 300) + 'px';

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

    // Fullscreen button
    viewerContainer.querySelector('.h3d-fullscreen-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const fullUrl = `${viewerBaseUrl}?glb=${glbParam}${thumbParam}&mode=fullscreen`;
      window.open(fullUrl, '_blank');
    });

    // Restore button
    viewerContainer.querySelector('.h3d-restore-btn').addEventListener('click', (e) => {
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
  }

  // ── Restore original image ──

  function restoreImage(imageUrl) {
    const tracked = trackedImages.get(imageUrl);
    if (!tracked) return;

    tracked.container.remove();
    tracked.originalImg.style.display = '';
    trackedImages.delete(imageUrl);
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
