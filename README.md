# 3D Web

A Chrome extension, powered by [fal.ai](https://fal.ai), that transforms any image on the web into an interactive 3D model. Right-click an image, and watch it come to life as a museum-quality 3D exhibit you can rotate, zoom, and explore.

Turn any webpage into a gallery.

<!-- Full 3D viewer screenshot -->

## How it works

1. Right-click any image on any webpage
2. Select **"Transform to 3D"** from the context menu
3. The image is replaced with an interactive 3D viewer, right on the page
4. Click fullscreen for the museum experience - complete with gallery lighting, soft shadows, and a cinematic reveal

<!-- Inline 3D viewer on webpage screenshot -->

## The viewer

The fullscreen viewer is built with Three.js and designed to feel like walking into a gallery:

- **7-light museum rig** - warm key spotlight, cool fill, rim light for silhouette separation, and ambient bounce
- **Cinematic entry** - the camera slowly dollies in as gallery lights fade up
- **Soft contact shadows** on a subtle pedestal with animated caustic light patterns
- **Floating dust particles** in the spotlight beam
- **Cursor-reactive lighting** - the spotlight subtly follows your gaze
- **Post-processing** - bloom, vignette, film grain, and SMAA anti-aliasing
- **Slow auto-rotate** that pauses when you interact, then gracefully resumes

### Keyboard shortcuts (fullscreen)

| Key | Action |
|-----|--------|
| R | Toggle auto-rotate |
| C | Reset camera |
| D | Download .glb |

## Setup

```bash
git clone https://github.com/blendi-remade/fal-3d-anything.git
cd fal-3d-anything
npm install
```

Then load the extension in Chrome:

1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the project folder
4. Click the extension icon and enter your [fal.ai API key](https://fal.ai/dashboard/keys)

## Powered by

3D generation is handled by [Hunyuan 3D v3.1](https://fal.ai/models/fal-ai/hunyuan-3d/v3.1/pro/image-to-3d) running on [fal.ai](https://fal.ai) - fast inference for generative media models.

## License

MIT
