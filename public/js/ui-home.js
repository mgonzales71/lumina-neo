import { AppState } from './state.js';
import { fetchApi } from './api.js';

export function renderHome() {
    const container = document.getElementById('home-tab');
    
    // Restore last generated if available
    const lastImg = AppState.lastGenerated?.imageUrl;
    const lastDebug = AppState.lastGenerated?.debug;

    container.innerHTML = `
        <div class="card" style="text-align: center;">
            <div id="image-container" style="background: #000; min-height: 300px; display: flex; align-items: center; justify-content: center; color: #aaa; margin-bottom: 1rem; border-radius: 8px; overflow: hidden; position: relative;">
                ${lastImg ? `<img src="${lastImg}" style="max-width: 100%; max-height: 80vh; display: block;">` : 'Image Preview'}
                <div id="loading-overlay" style="position: absolute; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.7); display: none; align-items: center; justify-content: center; color: white;">
                    Generating...
                </div>
            </div>
            
            <button id="generate-btn" class="btn" style="font-size: 1.2rem; padding: 1rem 2rem;">Generate New Image</button>
            
            <div style="margin-top: 1rem;">
                <button id="toggle-debug-btn" class="btn btn-secondary btn-sm">Show Details</button>
            </div>

            <div id="debug-panel" style="margin-top: 1rem; border-top: 1px solid #444; padding-top: 1rem; display: ${lastDebug ? 'none' : 'none'}; text-align: left;">
                <h3>Generation Details</h3>
                <div id="debug-content" style="background: #222; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 0.85rem; overflow-x: auto;">
                    ${lastDebug ? formatDebug(lastDebug) : 'No data yet.'}
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('generate-btn').addEventListener('click', handleGenerate);
    
    const debugPanel = document.getElementById('debug-panel');
    document.getElementById('toggle-debug-btn').addEventListener('click', () => {
        debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
    });
}

function formatDebug(debug) {
    return `
<strong>Prompt:</strong> ${debug.prompt}<br>
<strong>Provider:</strong> ${debug.provider} (${debug.model})<br>
<strong>Size:</strong> ${debug.width}x${debug.height}<br>
<br>
<strong>Variables:</strong>
<pre>${JSON.stringify(debug.promptVariables, null, 2)}</pre>
    `;
}

async function handleGenerate() {
    const btn = document.getElementById('generate-btn');
    const overlay = document.getElementById('loading-overlay');
    const imgContainer = document.getElementById('image-container');
    const debugContent = document.getElementById('debug-content');

    btn.disabled = true;
    overlay.style.display = 'flex';

    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        btn.disabled = false;
        overlay.style.display = 'none';
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
            const { latitude, longitude } = position.coords;
            const deviceSize = { width: window.innerWidth * window.devicePixelRatio, height: window.innerHeight * window.devicePixelRatio };
            
            // Adjust for high DPI but limit to reasonable max for API
            // (Pollinations max is often around 2048 or so depending on model)
            // Let's constrain to 1024-1536 range for speed/cost if needed, or let API handle it.
            // Using logical pixels might be safer for defaults:
            const logicalSize = { width: window.innerWidth, height: window.innerHeight };

            const response = await fetchApi('/generate-image', 'POST', {
                userId: AppState.userId,
                passkey: 'stub-passkey', // In real app, manage this securely
                profileId: AppState.profileId,
                lat: latitude,
                lon: longitude,
                deviceSize: logicalSize
            });

            // Update UI
            imgContainer.innerHTML = `<img src="${response.imageUrl}" style="max-width: 100%; max-height: 80vh; display: block;">`;
            imgContainer.appendChild(overlay); // Keep overlay structure but hidden
            overlay.style.display = 'none';
            
            debugContent.innerHTML = formatDebug(response.debug);
            
            // Save State
            AppState.lastGenerated = response;
            AppState.save();

        } catch (err) {
            console.error(err);
            alert('Generation failed: ' + err.message);
            overlay.style.display = 'none';
        } finally {
            btn.disabled = false;
        }

    }, (error) => {
        alert('Location access denied or failed: ' + error.message);
        btn.disabled = false;
        overlay.style.display = 'none';
    });
}
