import { AppState } from './state.js';
import { fetchApi } from './api.js';

let currentAbortController = null;

export async function renderHome() {
    const container = document.getElementById('home-tab');
    const profile = AppState.currentProfile;

    const activeImageSizeId = profile.activeImageSizeId || profile.imageSizes.default;
    const activeImageSize   = profile.imageSizes.sizes[activeImageSizeId];

    // Compute aspect ratio for CSS — fills full width, correct height
    let aspectRatio = '4 / 5'; // portrait default
    if (activeImageSize?.mode === 'preset' && activeImageSize.width && activeImageSize.height) {
        aspectRatio = `${activeImageSize.width} / ${activeImageSize.height}`;
    } else if (activeImageSize?.mode === 'dynamic') {
        const w = window.screen.width  * (window.devicePixelRatio || 1);
        const h = window.screen.height * (window.devicePixelRatio || 1);
        aspectRatio = `${w} / ${h}`;
    }

    const lastImg   = AppState.lastGenerated?.imageUrl;
    const lastDebug = AppState.lastGenerated?.debug;

    container.innerHTML = `
        <div class="card" style="text-align:center;">

            <!-- Image Frame -->
            <div id="image-container" class="image-frame" style="aspect-ratio: ${aspectRatio};">
                ${lastImg
                    ? `<img src="${lastImg}" alt="Generated image">`
                    : `<div class="image-frame-placeholder">
                           <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                               <rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/>
                               <polyline points="21 15 16 10 5 21"/>
                           </svg>
                       </div>`
                }
                <div id="loading-overlay" class="loading-overlay">
                    <div class="gen-aurora gen-aurora-1"></div>
                    <div class="gen-aurora gen-aurora-2"></div>
                    <div class="gen-aurora gen-aurora-3"></div>
                    <div class="gen-particle"></div>
                    <div class="gen-particle"></div>
                    <div class="gen-particle"></div>
                    <div class="gen-particle"></div>
                    <div class="gen-particle"></div>
                    <div class="gen-particle"></div>
                    <div class="gen-particle"></div>
                    <div class="gen-particle"></div>
                    <div class="gen-particle"></div>
                    <div class="gen-particle"></div>
                    <div class="gen-particle"></div>
                    <div class="gen-particle"></div>
                    <div class="gen-content">
                        <svg class="spinner" width="28" height="28" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">
                            <circle class="path" fill="none" stroke-width="6" stroke-linecap="round" cx="33" cy="33" r="30"/>
                        </svg>
                        <span>Generating…</span>
                    </div>
                </div>
            </div>

            <!-- Generate / Cancel -->
            <button id="generate-btn" class="btn home-generate-btn">
                <span class="btn-label">Generate Image</span>
                <span class="btn-progress-bar"></span>
            </button>

            <!-- Post-generate actions -->
            <div id="image-actions" class="image-actions" style="display:${lastImg ? 'flex' : 'none'};">
                <button id="save-image-btn"  class="btn btn-secondary">Save</button>
                <button id="view-image-btn"  class="btn btn-secondary">View</button>
                <button id="wallpaper-btn"   class="btn btn-secondary">Wallpaper</button>
            </div>

            <!-- Debug toggle -->
            <div class="debug-toggle-row">
                <button id="toggle-debug-btn" class="btn btn-secondary btn-sm" ${lastDebug ? '' : 'disabled'}>
                    ${lastDebug ? 'Show Details' : 'No Details'}
                </button>
            </div>

            <!-- Debug panel -->
            <div id="debug-panel" class="card debug-panel" style="display:none; text-align:left;">
                <h3>Generation Details</h3>
                <div id="debug-content" class="debug-content">
                    ${lastDebug ? formatDebug(lastDebug) : 'Generate an image to see details.'}
                </div>
            </div>
        </div>
    `;

    // Generate
    document.getElementById('generate-btn').addEventListener('click', handleGenerate);

    // Actions — set from lastGenerated on initial render
    document.getElementById('save-image-btn').addEventListener('click', () => saveImage(AppState.lastGenerated?.imageUrl));
    document.getElementById('view-image-btn').addEventListener('click', () => {
        const url = AppState.lastGenerated?.imageUrl;
        if (url) window.open(url, '_blank');
    });
    document.getElementById('wallpaper-btn').addEventListener('click', () => setWallpaper(AppState.lastGenerated?.imageUrl));

    // Debug toggle
    const debugPanel     = document.getElementById('debug-panel');
    const toggleDebugBtn = document.getElementById('toggle-debug-btn');
    toggleDebugBtn.addEventListener('click', () => {
        const open = debugPanel.style.display !== 'none';
        debugPanel.style.display = open ? 'none' : 'block';
        toggleDebugBtn.textContent = open ? 'Show Details' : 'Hide Details';
    });
}

async function handleGenerate() {
    const btn            = document.getElementById('generate-btn');
    const overlay        = document.getElementById('loading-overlay');
    const imgContainer   = document.getElementById('image-container');
    const debugContent   = document.getElementById('debug-content');
    const toggleDebugBtn = document.getElementById('toggle-debug-btn');
    const btnLabel       = btn.querySelector('.btn-label');

    // ── Cancel if already generating ──────────────────────────
    if (currentAbortController) {
        currentAbortController.abort();
        return;
    }

    // ── Start generation ──────────────────────────────────────
    currentAbortController = new AbortController();
    btnLabel.textContent = '✕  Cancel';
    btn.classList.add('generating');
    Array.from(imgContainer.children).forEach(c => { if (c.id !== 'loading-overlay') c.remove(); });
    overlay.classList.add('active');
    toggleDebugBtn.textContent = 'No Details';
    toggleDebugBtn.disabled = true;

    // Use custom location if locationMode is 'custom' and activeLocationId is set
    const profile2 = AppState.currentProfile;
    if (profile2.locationMode === 'custom' && profile2.activeLocationId) {
        const customLoc = (profile2.locations || []).find(l => l.id === profile2.activeLocationId);
        if (customLoc) {
            await doGenerate(customLoc.lat, customLoc.lon, btn, btnLabel, overlay, imgContainer, debugContent, toggleDebugBtn);
            return;
        }
    }

    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        resetBtn(btn, btnLabel, overlay);
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        await doGenerate(latitude, longitude, btn, btnLabel, overlay, imgContainer, debugContent, toggleDebugBtn);
    }, (error) => {
        alert('Location access denied: ' + error.message);
        resetBtn(btn, btnLabel, overlay);
    }, { timeout: 10000 });
}

async function doGenerate(lat, lon, btn, btnLabel, overlay, imgContainer, debugContent, toggleDebugBtn) {
    try {
        const profile = AppState.currentProfile;
        const activeImageSizeId = profile.activeImageSizeId || profile.imageSizes.default;
        const activeImageSize   = profile.imageSizes.sizes[activeImageSizeId];

        let targetWidth  = 1024;
        let targetHeight = 1024;

        if (activeImageSize?.mode === 'preset') {
            targetWidth  = activeImageSize.width;
            targetHeight = activeImageSize.height;
        } else if (activeImageSize?.mode === 'dynamic') {
            targetWidth  = Math.round(window.screen.width  * (window.devicePixelRatio || 1));
            targetHeight = Math.round(window.screen.height * (window.devicePixelRatio || 1));
            const MAX_DIM = 2048;
            if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
                const ratio = targetWidth / targetHeight;
                if (ratio > 1) { targetWidth = MAX_DIM; targetHeight = Math.round(MAX_DIM / ratio); }
                else           { targetHeight = MAX_DIM; targetWidth = Math.round(MAX_DIM * ratio); }
            }
        }

        const response = await fetchApi('/generate-image', 'POST', {
            userId:     AppState.userId,
            passkey:    AppState.passkey,
            profileId:  AppState.profileId,
            lat,
            lon,
            deviceSize: { width: targetWidth, height: targetHeight }
        }, {}, currentAbortController.signal);

        // Insert generated image
        Array.from(imgContainer.children).forEach(c => { if (c.id !== 'loading-overlay') c.remove(); });
        const img = document.createElement('img');
        img.src = response.imageUrl;
        img.alt = 'Generated image';
        imgContainer.insertBefore(img, overlay);

        // Show actions
        const actions = document.getElementById('image-actions');
        actions.style.display = 'flex';
        document.getElementById('save-image-btn').onclick  = () => saveImage(response.imageUrl);
        document.getElementById('view-image-btn').onclick  = () => window.open(response.imageUrl, '_blank');
        document.getElementById('wallpaper-btn').onclick   = () => setWallpaper(response.imageUrl);

        // Debug
        if (debugContent) debugContent.innerHTML = formatDebug(response.debug);
        toggleDebugBtn.textContent = 'Show Details';
        toggleDebugBtn.disabled    = false;

        AppState.lastGenerated = response;
        AppState.save();

    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error(err);
            alert('Generation failed: ' + err.message);
        }
    } finally {
        resetBtn(btn, btnLabel, overlay);
    }
}

function resetBtn(btn, btnLabel, overlay) {
    currentAbortController = null;
    btnLabel.textContent = 'Generate Image';
    btn.classList.remove('generating');
    overlay.classList.remove('active');
}

async function saveImage(url) {
    if (!url) return;
    try {
        const res  = await fetch(url);
        const blob = await res.blob();
        const file = new File([blob], 'lumina-neo.jpg', { type: blob.type || 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Lumina Neo' });
        } else {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'lumina-neo.jpg';
            a.click();
            URL.revokeObjectURL(a.href);
        }
    } catch (err) {
        if (err.name !== 'AbortError') alert('Save failed: ' + err.message);
    }
}

async function setWallpaper(url) {
    if (!url) return;
    try {
        const res  = await fetch(url);
        const blob = await res.blob();
        const file = new File([blob], 'lumina-neo-wallpaper.jpg', { type: blob.type || 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Set as Wallpaper' });
        } else {
            alert('Wallpaper sharing is not supported on this device/browser.');
        }
    } catch (err) {
        if (err.name !== 'AbortError') alert('Set wallpaper failed: ' + err.message);
    }
}

function formatDebug(debug) {
    if (!debug) return 'No debug data.';
    let varsHtml = '';
    for (const key in debug.promptVariables) {
        let value = debug.promptVariables[key];
        if (typeof value === 'object' && value !== null) value = JSON.stringify(value);
        varsHtml += `<div><strong>${key}:</strong> ${value}</div>`;
    }
    return `
        <p><strong>Prompt:</strong> ${debug.prompt}</p>
        <p><strong>Provider:</strong> ${debug.provider} &mdash; ${debug.model} &mdash; ${debug.width}&times;${debug.height}</p>
        <details style="margin-top:8px;">
            <summary style="cursor:pointer; opacity:0.7; font-size:0.8rem;">Variables</summary>
            <div style="margin-top:8px; display:grid; grid-template-columns:1fr 1fr; gap:2px 16px; font-size:0.75rem; line-height:1.7;">${varsHtml}</div>
        </details>
    `;
}
