import { AppState } from './state.js';
import { fetchApi } from './api.js';
import { exportData, importData } from './utils.js';

let currentEditingSizeId = null; 

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

            <div style="display:flex; gap:10px; margin-bottom: 20px;">
                <button id="export-sizes-btn" class="btn btn-secondary" style="flex:1;">Export Sizes</button>
                <button id="import-sizes-btn" class="btn btn-secondary" style="flex:1;">Import Sizes</button>
            </div>

            <ul id="size-list" style="list-style: none; padding: 0;">
                ${Object.entries(sizes).map(([key, size]) => `
                    <li style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--glass-border);">
                        <div>
                            <div style="font-size: 1.1rem; font-weight: 600;">${size.label}</div>
                            <div style="font-size: 0.9rem; color: var(--text-secondary);">
                                ${size.mode === 'dynamic' ? 'Dynamic (Device Screen)' : `${size.width}x${size.height}`}
                            </div>
                        </div>
                        <div style="display:flex; gap: 8px;">
                            ${key !== 'DEVICE' ? `<button class="btn btn-secondary btn-sm edit-size-btn" data-key="${key}" style="padding: 8px 12px; font-size: 0.85rem;">Edit</button>` : ''}
                            ${key !== 'DEVICE' ? `<button class="btn btn-secondary btn-sm delete-size-btn" data-key="${key}" style="padding: 8px 12px; font-size: 0.85rem;">Delete</button>` : ''}
                        </div>
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="card">
            <h3 id="size-form-title">Add New Size</h3>
            <div class="form-group">
                <label>ID (e.g., "INSTAGRAM_STORY")</label>
                <input type="text" id="size-id" placeholder="UNIQUE_ID">
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
            <div style="display: flex; gap: 10px;">
                <button id="save-size-btn" class="btn" style="flex:1;">Add Size</button>
                <button id="cancel-size-edit-btn" class="btn btn-secondary" style="flex:1; display:none;">Cancel Edit</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Event Listeners
    document.getElementById('default-size-select').addEventListener('change', async (e) => {
        profile.imageSizes.default = e.target.value;
        await saveProfile(profile);
    });

    const sizeModeSelect = document.getElementById('size-mode');
    const dimensionsGroup = document.getElementById('dimensions-group');

    sizeModeSelect.addEventListener('change', (e) => {
        const isPreset = e.target.value === 'preset';
        dimensionsGroup.style.display = isPreset ? 'block' : 'none';
    });

    document.querySelectorAll('.delete-size-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!confirm('Are you sure you want to delete this image size?')) return;
            const key = e.target.dataset.key;
            delete profile.imageSizes.sizes[key];
            if (profile.imageSizes.default === key) {
                profile.imageSizes.default = 'DEVICE'; // Fallback
            }
            await saveProfile(profile);
            renderSizes();
        });
    });

    document.querySelectorAll('.edit-size-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = e.target.dataset.key;
            const sizeToEdit = profile.imageSizes.sizes[key];
            
            document.getElementById('size-id').value = key;
            document.getElementById('size-id').disabled = true; 
            document.getElementById('size-label').value = sizeToEdit.label;
            document.getElementById('size-mode').value = sizeToEdit.mode;
            
            const isPreset = sizeToEdit.mode === 'preset';
            dimensionsGroup.style.display = isPreset ? 'block' : 'none';
            document.getElementById('size-width').value = sizeToEdit.width || '';
            document.getElementById('size-height').value = sizeToEdit.height || '';
            
            document.getElementById('size-form-title').textContent = 'Edit Image Size';
            document.getElementById('save-size-btn').textContent = 'Update Size';
            document.getElementById('cancel-size-edit-btn').style.display = 'block';
            currentEditingSizeId = key;
        });
    });

    document.getElementById('cancel-size-edit-btn').addEventListener('click', () => {
        resetSizeForm();
    });

    document.getElementById('save-size-btn').addEventListener('click', async () => {
        const id = document.getElementById('size-id').value.trim();
        const label = document.getElementById('size-label').value.trim();
        const mode = document.getElementById('size-mode').value;
        
        if (!id || !label) {
            alert('ID and Label are required.');
            return;
        }

        let width = null, height = null;
        if (mode === 'preset') {
            width = parseInt(document.getElementById('size-width').value);
            height = parseInt(document.getElementById('size-height').value);
            if (isNaN(width) || isNaN(height)) {
                alert('Width and Height must be valid numbers for preset mode.');
                return;
            }
        }

        const newSize = {
            label,
            mode,
            width,
            height
        };

        if (currentEditingSizeId !== null) {
            profile.imageSizes.sizes[currentEditingSizeId] = newSize;
        } else {
            if (profile.imageSizes.sizes[id]) {
                alert('Size ID already exists. Please choose a unique ID.');
                return;
            }
            profile.imageSizes.sizes[id] = newSize;
        }
        
        await saveProfile(profile);
        resetSizeForm();
        renderSizes();
    });

    document.getElementById('export-sizes-btn').addEventListener('click', () => {
        exportData(profile.imageSizes.sizes, 'lumina-neo-image-sizes.json', 'application/json');
    });

    document.getElementById('import-sizes-btn').addEventListener('click', async () => {
        if (!confirm('Importing image sizes will overwrite existing sizes with matching IDs. Continue?')) return;
        try {
            const importedSizes = await importData();
            if (typeof importedSizes !== 'object' || importedSizes === null || Array.isArray(importedSizes)) {
                throw new Error('Invalid image sizes file format. Expected an object with size definitions.');
            }

            // Validate each imported size and merge
            for (const id in importedSizes) {
                const size = importedSizes[id];
                if (!('label' in size && 'mode' in size && (size.mode === 'dynamic' || size.mode === 'preset'))) {
                    throw new Error(`Invalid format for size ID ${id}. Missing label or invalid mode.`);
                }
                if (size.mode === 'preset' && (typeof size.width !== 'number' || typeof size.height !== 'number' || isNaN(size.width) || isNaN(size.height))) {
                    throw new Error(`Invalid width or height for preset size ID ${id}.`);
                }
                // Ensure DEVICE is not overwritten if it's a different definition
                if (id === 'DEVICE' && profile.imageSizes.sizes['DEVICE'] && size.mode === 'dynamic' && size.label === 'This Device') {
                    // Don't overwrite default DEVICE if it's the standard one
                    continue;
                }
                profile.imageSizes.sizes[id] = size; 
            }

            await saveProfile(profile);
            renderSizes();
            alert('Image sizes imported successfully!');
        } catch (err) {
            alert('Error importing image sizes: ' + err.message);
            console.error('Import image sizes error:', err);
        }
    });
}

function resetSizeForm() {
    document.getElementById('size-id').value = '';
    document.getElementById('size-id').disabled = false;
    document.getElementById('size-label').value = '';
    document.getElementById('size-mode').value = 'preset';
    document.getElementById('dimensions-group').style.display = 'block';
    document.getElementById('size-width').value = '';
    document.getElementById('size-height').value = '';
    document.getElementById('size-form-title').textContent = 'Add New Size';
    document.getElementById('save-size-btn').textContent = 'Add Size';
    document.getElementById('cancel-size-edit-btn').style.display = 'none';
    currentEditingSizeId = null;
}

async function saveProfile(profile) {
    try {
        await fetchApi('/profile', 'PUT', { userId: AppState.userId, profile });
        AppState.setProfile(profile);
    } catch (err) {
        alert('Failed to save: ' + err.message);
    }
}
