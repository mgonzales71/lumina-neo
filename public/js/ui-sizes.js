import { AppState } from './state.js';
import { fetchApi } from './api.js';

export function renderSizes() {
    const container = document.getElementById('sizes-tab');
    const profile = AppState.currentProfile;
    if (!profile.imageSizes) {
        profile.imageSizes = { default: 'DEVICE', sizes: { 'DEVICE': { label: 'This Device', mode: 'dynamic', width: null, height: null } } };
    }

    const sizes = profile.imageSizes.sizes;

    let html = `
        <div class="card">
            <h2>Image Sizes</h2>
            <p>Configure output resolutions. "Dynamic" uses the client device's screen size.</p>
            
            <div class="form-group">
                <label>Default Size</label>
                <select id="default-size-select">
                    ${Object.keys(sizes).map(key => `
                        <option value="${key}" ${profile.imageSizes.default === key ? 'selected' : ''}>${sizes[key].label}</option>
                    `).join('')}
                </select>
            </div>

            <ul id="size-list" style="list-style: none; padding: 0;">
                ${Object.entries(sizes).map(([key, size]) => `
                    <li style="border-bottom: 1px solid #444; padding: 10px 0; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${size.label}</strong> (ID: ${key})
                            <br>
                            <span style="font-size: 0.9rem; color: #aaa;">
                                ${size.mode === 'dynamic' ? 'Dynamic (Device Screen)' : `${size.width}x${size.height}`}
                            </span>
                        </div>
                        ${key !== 'DEVICE' ? `<button class="btn btn-secondary btn-sm delete-size-btn" data-key="${key}">Delete</button>` : ''}
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="card">
            <h3>Add New Size</h3>
            <div class="form-group">
                <label>ID (e.g., "INSTAGRAM_STORY")</label>
                <input type="text" id="size-id">
            </div>
            <div class="form-group">
                <label>Label</label>
                <input type="text" id="size-label" placeholder="Instagram Story">
            </div>
            <div class="form-group">
                <label>Mode</label>
                <select id="size-mode">
                    <option value="preset">Preset Dimensions</option>
                    <option value="dynamic">Dynamic (Device)</option>
                </select>
            </div>
            <div id="dimensions-group">
                <div style="display: flex; gap: 10px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Width</label>
                        <input type="number" id="size-width" placeholder="1080">
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Height</label>
                        <input type="number" id="size-height" placeholder="1920">
                    </div>
                </div>
            </div>
            <button id="add-size-btn" class="btn">Add Size</button>
        </div>
    `;

    container.innerHTML = html;

    // Event Listeners
    document.getElementById('default-size-select').addEventListener('change', async (e) => {
        profile.imageSizes.default = e.target.value;
        await saveProfile(profile);
    });

    document.getElementById('size-mode').addEventListener('change', (e) => {
        const isPreset = e.target.value === 'preset';
        document.getElementById('dimensions-group').style.display = isPreset ? 'block' : 'none';
    });

    document.querySelectorAll('.delete-size-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const key = e.target.dataset.key;
            delete profile.imageSizes.sizes[key];
            if (profile.imageSizes.default === key) {
                profile.imageSizes.default = 'DEVICE'; // Fallback
            }
            await saveProfile(profile);
            renderSizes();
        });
    });

    document.getElementById('add-size-btn').addEventListener('click', async () => {
        const id = document.getElementById('size-id').value.trim();
        const label = document.getElementById('size-label').value.trim();
        const mode = document.getElementById('size-mode').value;
        
        if (!id || !label) {
            alert('ID and Label are required.');
            return;
        }
        
        if (profile.imageSizes.sizes[id]) {
            alert('Size ID already exists.');
            return;
        }

        let width = null, height = null;
        if (mode === 'preset') {
            width = parseInt(document.getElementById('size-width').value);
            height = parseInt(document.getElementById('size-height').value);
            if (!width || !height) {
                alert('Width and Height are required for preset mode.');
                return;
            }
        }

        profile.imageSizes.sizes[id] = {
            label,
            mode,
            width,
            height
        };

        await saveProfile(profile);
        renderSizes();
    });
}

async function saveProfile(profile) {
    try {
        await fetchApi('/profile', 'PUT', { userId: AppState.userId, profile });
        AppState.setProfile(profile);
    } catch (err) {
        alert('Failed to save: ' + err.message);
    }
}
