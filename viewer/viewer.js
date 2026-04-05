// 3D Web — Viewer Script

(() => {
  const params = new URLSearchParams(window.location.search);
  const glbUrl = params.get('glb');
  const thumbUrl = params.get('thumb');
  const mode = params.get('mode') || 'fullscreen';

  const viewer = document.getElementById('viewer');
  const loadingScreen = document.getElementById('loadingScreen');
  const errorScreen = document.getElementById('errorScreen');
  const errorText = document.getElementById('errorText');
  const controls = document.getElementById('viewerControls');
  const progressFill = document.getElementById('progressFill');

  if (!glbUrl) {
    showError('No model URL provided');
    return;
  }

  // Apply mode
  if (mode === 'inline') {
    document.body.classList.add('inline-mode');
  } else {
    controls.style.display = '';
    // Show controls briefly on load
    document.body.classList.add('controls-visible');
    setTimeout(() => document.body.classList.remove('controls-visible'), 3000);
  }

  // Set poster/thumbnail
  if (thumbUrl) {
    viewer.setAttribute('poster', thumbUrl);
  }

  // Load the model
  viewer.setAttribute('src', glbUrl);
  viewer.style.display = '';

  // Progress tracking
  viewer.addEventListener('progress', (event) => {
    const progress = event.detail.totalProgress * 100;
    progressFill.style.width = progress + '%';
  });

  // Model loaded
  viewer.addEventListener('load', () => {
    loadingScreen.style.display = 'none';
    progressFill.style.width = '100%';
    setTimeout(() => {
      const bar = document.getElementById('progressBar');
      if (bar) bar.style.opacity = '0';
    }, 500);
  });

  // Error handling
  viewer.addEventListener('error', (event) => {
    showError('Failed to load 3D model');
    console.error('Model viewer error:', event);
  });

  // ── Controls ──

  const toggleRotateBtn = document.getElementById('toggleRotate');
  const resetCameraBtn = document.getElementById('resetCamera');
  const downloadBtn = document.getElementById('downloadGlb');

  let isAutoRotating = true;

  if (toggleRotateBtn) {
    toggleRotateBtn.classList.add('active');
    toggleRotateBtn.addEventListener('click', () => {
      isAutoRotating = !isAutoRotating;
      viewer.autoRotate = isAutoRotating;
      toggleRotateBtn.classList.toggle('active', isAutoRotating);
    });
  }

  if (resetCameraBtn) {
    resetCameraBtn.addEventListener('click', () => {
      viewer.cameraOrbit = 'auto auto auto';
      viewer.cameraTarget = 'auto auto auto';
      viewer.fieldOfView = 'auto';
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      try {
        const response = await fetch(glbUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'model.glb';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        window.open(glbUrl, '_blank');
      }
    });
  }

  // ── Keyboard shortcuts (fullscreen mode) ──

  if (mode === 'fullscreen') {
    document.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'r':
        case 'R':
          if (toggleRotateBtn) toggleRotateBtn.click();
          break;
        case 'c':
        case 'C':
          if (resetCameraBtn) resetCameraBtn.click();
          break;
        case 'd':
        case 'D':
          if (downloadBtn) downloadBtn.click();
          break;
        case 'Escape':
          window.close();
          break;
      }
    });
  }

  function showError(message) {
    loadingScreen.style.display = 'none';
    viewer.style.display = 'none';
    errorScreen.style.display = '';
    errorText.textContent = message;
  }
})();
