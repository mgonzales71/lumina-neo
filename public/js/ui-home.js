import { AppState } from './state.js';
import { fetchApi } from './api.js';

export async function renderHome() {
    const container = document.getElementById('home-tab');
    const profile = AppState.currentProfile;

    const activeImageSizeId = profile.activeImageSizeId || profile.imageSizes.default;
    const activeImageSize = profile.imageSizes.sizes[activeImageSizeId];

    let placeholderWidth = 1024; 
    let placeholderHeight = 1024;

    if (activeImageSize.mode === 'preset') {
        placeholderWidth = activeImageSize.width;
        placeholderHeight = activeImageSize.height;
    } else if (activeImageSize.mode === 'dynamic' && window.innerWidth && window.innerHeight) {
        // For dynamic, use a ratio from current window but cap for a reasonable placeholder
        const aspectRatio = window.innerWidth / window.innerHeight;
        if (aspectRatio > 1) { // Landscape
            placeholderWidth = Math.min(window.innerWidth * 0.7, 800);
            placeholderHeight = placeholderWidth / aspectRatio;
        } else { // Portrait or Square
            placeholderHeight = Math.min(window.innerHeight * 0.7, 800);
            placeholderWidth = placeholderHeight * aspectRatio;
        }
    }

    // Ensure min size for visibility
    placeholderWidth = Math.max(placeholderWidth, 300);
    placeholderHeight = Math.max(placeholderHeight, 300);

    const lastImg = AppState.lastGenerated?.imageUrl;
    const lastDebug = AppState.lastGenerated?.debug;

    container.innerHTML = `
        <div class="card" style="text-align: center;">
            <div id="image-container" 
                 style="background: var(--glass-bg); 
                        border: 1px solid var(--glass-border); 
                        min-height: ${placeholderHeight}px; 
                        width: ${placeholderWidth}px; 
                        max-width: 100%; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        color: var(--text-secondary); 
                        margin: 0 auto 1rem auto; 
                        border-radius: var(--radius-md); 
                        overflow: hidden; 
                        position: relative; 
                        box-shadow: var(--glass-shadow);"
            >
                ${lastImg ? `<img src="${lastImg}" style="max-width: 100%; max-height: 80vh; display: block; object-fit: contain;">` : `
                    <svg width="${placeholderWidth * 0.4}" height="${placeholderHeight * 0.4}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4;">
                        <path d="M5.52 19c-.37 0-.74-.08-1.07-.24-.71-.34-1.22-1-1.39-1.81-.17-.81.04-1.66.57-2.28L12 2l7.78 13.67c.53.62.74 1.47.57 2.28-.17.81-.68 1.47-1.39 1.81-.33.16-.7.24-1.07.24h-13z"></path>
                        <path d="M12 18V6"></path>
                        <path d="M10.23 13.23L12 18l1.77-4.77"></path>
                        <path d="M8 9H4"></path>
                        <path d="M20 9h-4"></path>
                    </svg>
                `}
                <div id="loading-overlay" style="position: absolute; top:0; left:0; right:0; bottom:0; background: var(--glass-bg); backdrop-filter: blur(var(--blur-amount)); -webkit-backdrop-filter: blur(var(--blur-amount)); display: none; align-items: center; justify-content: center; color: var(--text-primary); flex-direction: column; gap: 10px;">
                    <svg class="spinner" width="30" height="30" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">
                        <circle class="path" fill="none" stroke-width="6" stroke-linecap="round" cx="33" cy="33" r="30"></circle>
                    </svg>
                    <span>Generating...</span>
                </div>
            </div>
            
            <button id="generate-btn" class="btn" style="font-size: 1.2rem; padding: 1rem 2rem;">Generate New Image</button>
            
            <div style="margin-top: 1rem;">
                <button id="toggle-debug-btn" class="btn btn-secondary btn-sm">${lastDebug ? 'Show Details' : 'No Details'}</button>
            </div>

            <div id="debug-panel" class="card" style="margin-top: 1rem; padding: var(--spacing-md); display: ${lastDebug ? 'none' : 'none'}; text-align: left; border-radius: var(--radius-md);">
                <h3 style="margin-top:0;">Generation Details</h3>
                <div id="debug-content" style="background: rgba(0,0,0,0.1); padding: 15px; border-radius: var(--radius-sm); font-family: monospace; font-size: 0.85rem; overflow-x: auto; max-height: 400px;">
                    ${lastDebug ? formatDebug(lastDebug) : 'Click generate to see details.'}
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('generate-btn').addEventListener('click', handleGenerate);
    
    const debugPanel = document.getElementById('debug-panel');
    const toggleDebugBtn = document.getElementById('toggle-debug-btn');
    if(lastDebug) {
        toggleDebugBtn.textContent = 'Show Details';
        debugPanel.style.display = 'none';
    } else {
        toggleDebugBtn.textContent = 'No Details';
        toggleDebugBtn.disabled = true;
    }

    toggleDebugBtn.addEventListener('click', () => {
        if (debugPanel.style.display === 'none') {
            debugPanel.style.display = 'block';
            toggleDebugBtn.textContent = 'Hide Details';
        } else {
            debugPanel.style.display = 'none';
            toggleDebugBtn.textContent = 'Show Details';
        }
    });

    // Add spinner CSS for the loading overlay
    const style = document.createElement('style');
    style.innerHTML = `
        .spinner {
            animation: rotate 2s linear infinite;
            z-index: 2;
            position: absolute;
            top: 50%;
            left: 50%;
            margin: -15px 0 0 -15px;
            width: 30px;
            height: 30px;
        }
        .spinner .path {
            stroke: var(--primary-color);
            stroke-width: 3;
            stroke-linecap: round;
            animation: dash 1.5s ease-in-out infinite;
        }
        @keyframes rotate {
            100% { transform: rotate(360deg); }
        }
        @keyframes dash {
            0% { stroke-dasharray: 1, 150; stroke-dashoffset: 0; }
            50% { stroke-dasharray: 90, 150; stroke-dashoffset: -35; }
            100% { stroke-dasharray: 90, 150; stroke-dashoffset: -124; }
        }
    `;
    document.head.appendChild(style);
}

function formatDebug(debug) {
    let varsHtml = '';
    for (const key in debug.promptVariables) {
        let value = debug.promptVariables[key];
        if (typeof value === 'object' && value !== null) {
            value = JSON.stringify(value);
        }
        varsHtml += `<li><strong>${key}:</strong> <code>${value}</code></li>`;
    }

    return `
        <p><strong>Final Prompt:</strong> <code>${debug.prompt}</code></p>
        <p><strong>Provider:</strong> ${debug.provider} (Model: ${debug.model})</p>
        <p><strong>Image Size:</strong> ${debug.width}x${debug.height}</p>
        <h4>Resolved Prompt Variables:</h4>
        <ul style="list-style:none; padding:0; line-height: 1.6;">
            ${varsHtml}
        </ul>
    `;
}

async function handleGenerate() {
    const btn = document.getElementById('generate-btn');
    const overlay = document.getElementById('loading-overlay');
    const imgContainer = document.getElementById('image-container');
    const debugContent = document.getElementById('debug-content');
    const toggleDebugBtn = document.getElementById('toggle-debug-btn');

    btn.disabled = true;
    // Clear previous image content but preserve the overlay element
    const children = Array.from(imgContainer.children);
    children.forEach(child => { if (child.id !== 'loading-overlay') child.remove(); });
    overlay.style.display = 'flex';
    toggleDebugBtn.textContent = 'No Details';
    toggleDebugBtn.disabled = true;
    debugContent.innerHTML = 'Generating...';

    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        btn.disabled = false;
        overlay.style.display = 'none';
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
            const { latitude, longitude } = position.coords;
            const profile = AppState.currentProfile;

            const activeImageSizeId = profile.activeImageSizeId || profile.imageSizes.default;
            const activeImageSize = profile.imageSizes.sizes[activeImageSizeId];

            let targetWidth = 1024;
            let targetHeight = 1024;

            if (activeImageSize.mode === 'preset') {
                targetWidth = activeImageSize.width;
                targetHeight = activeImageSize.height;
            } else if (activeImageSize.mode === 'dynamic') {
                // Use actual device size for dynamic mode
                targetWidth = window.innerWidth * window.devicePixelRatio;
                targetHeight = window.innerHeight * window.devicePixelRatio;

                // Cap at a reasonable max for API limits, e.g., 2048 or 4096
                const MAX_DIM = 2048; // Example max dimension
                if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
                    const aspectRatio = targetWidth / targetHeight;
                    if (aspectRatio > 1) { // Landscape
                        targetWidth = MAX_DIM;
                        targetHeight = Math.round(MAX_DIM / aspectRatio);
                    } else {
                        targetHeight = MAX_DIM;
                        targetWidth = Math.round(MAX_DIM * aspectRatio);
                    }
                }
            }
            
            const response = await fetchApi('/generate-image', 'POST', {
                userId: AppState.userId,
                profileId: AppState.profileId,
                lat: latitude,
                lon: longitude,
                deviceSize: { width: targetWidth, height: targetHeight }
            });

            // Remove placeholder/previous image, keep overlay (hidden below)
            Array.from(imgContainer.children).forEach(child => { if (child.id !== 'loading-overlay') child.remove(); });
            const img = document.createElement('img');
            img.src = response.imageUrl;
            img.style.cssText = 'max-width:100%; max-height:80vh; display:block; object-fit:contain;';
            imgContainer.insertBefore(img, overlay);
            
            debugContent.innerHTML = formatDebug(response.debug);
            toggleDebugBtn.textContent = 'Show Details';
            toggleDebugBtn.disabled = false;
            
            AppState.lastGenerated = response;
            AppState.save();

        } catch (err) {
            console.error(err);
            alert('Generation failed: ' + err.message);
            debugContent.innerHTML = `<p style="color: red;">Error: ${err.message}</p>`;
        } finally {
            overlay.style.display = 'none';
            btn.disabled = false;
        }

    }, (error) => {
        alert('Location access denied or failed: ' + error.message);
        btn.disabled = false;
        overlay.style.display = 'none';
        debugContent.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    });
}
