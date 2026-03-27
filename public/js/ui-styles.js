import { AppState } from './state.js';
import { fetchApi } from './api.js';
import { exportData, importData } from './utils.js';

let currentEditingStyleIndex = null; 

export function renderStyles() {
    const container = document.getElementById('styles-tab');
    const profile = AppState.currentProfile;
    if (!profile.styles) profile.styles = [];

    let html = `
        <div class="card">
            <h2>Styles</h2>
            <p>Define artistic styles to be used in image generation. The active style is inserted as <code>{style}</code> in your prompt template.</p>
            <div style="display:flex; gap:10px; margin-bottom: 20px;">
                <button id="export-styles-btn" class="btn btn-secondary" style="flex:1;">Export Styles</button>
                <button id="import-styles-btn" class="btn btn-secondary" style="flex:1;">Import Styles</button>
            </div>
            <ul id="style-list" style="list-style: none; padding: 0;">
                ${profile.styles.length === 0 ? '<p style="text-align:center; padding: 20px; opacity: 0.6;">No styles added yet.</p>' : ''}
                ${profile.styles.map((s, index) => `
                    <li style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: start; border: 1px solid var(--glass-border); ${s.style === profile.activeStyleId ? 'border-color: var(--primary-color);' : ''}">
                        <div>
                            <div style="font-size: 1.1rem; font-weight: 600;">
                                ${s.style}
                                ${s.style === profile.activeStyleId ? '<span style="font-size:0.8em; color:var(--primary-color); margin-left:6px;">✓ Active</span>' : ''}
                            </div>
                            <p style="font-size: 0.9rem; color: var(--text-secondary); margin: 0;">${s.description}</p>
                        </div>
                        <div style="display:flex; gap: 8px; flex-shrink:0; margin-left: 10px;">
                            ${s.style !== profile.activeStyleId ? `<button class="btn btn-sm set-active-style-btn" data-index="${index}" style="padding: 8px 12px; font-size: 0.85rem;">Set Active</button>` : ''}
                            <button class="btn btn-secondary btn-sm edit-style-btn" data-index="${index}" style="padding: 8px 12px; font-size: 0.85rem;">Edit</button>
                            <button class="btn btn-danger btn-sm delete-style-btn" data-index="${index}" style="padding: 8px 12px; font-size: 0.85rem;">Delete</button>
                        </div>
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="card">
            <h3 id="style-form-title">Add New Style</h3>
            <div class="form-group">
                <label>Style ID (e.g., "cyberpunk")</label>
                <input type="text" id="style-id" placeholder="cyberpunk">
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="style-desc" rows="3" placeholder="A futuristic, neon-lit cyberpunk cityscape..."></textarea>
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="save-style-btn" class="btn" style="flex:1;">Add Style</button>
                <button id="cancel-style-edit-btn" class="btn btn-cancel" style="flex:1; display:none;">Cancel Edit</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Event Listeners
    document.querySelectorAll('.set-active-style-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const index = parseInt(e.target.dataset.index);
            profile.activeStyleId = profile.styles[index].style;
            await saveProfile(profile);
            renderStyles();
        });
    });

    document.querySelectorAll('.delete-style-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!confirm('Are you sure you want to delete this style?')) return;
            const index = parseInt(e.target.dataset.index);
            profile.styles.splice(index, 1);
            await saveProfile(profile);
            renderStyles();
        });
    });

    document.querySelectorAll('.edit-style-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const styleToEdit = profile.styles[index];
            
            document.getElementById('style-id').value = styleToEdit.style;
            document.getElementById('style-id').disabled = true; 
            document.getElementById('style-desc').value = styleToEdit.description;
            
            document.getElementById('style-form-title').textContent = 'Edit Style';
            document.getElementById('save-style-btn').textContent = 'Update Style';
            document.getElementById('cancel-style-edit-btn').style.display = 'block';
            currentEditingStyleIndex = index;
        });
    });

    document.getElementById('cancel-style-edit-btn').addEventListener('click', () => {
        resetStyleForm();
    });

    document.getElementById('save-style-btn').addEventListener('click', async () => {
        const id = document.getElementById('style-id').value.trim();
        const desc = document.getElementById('style-desc').value.trim();

        if (!id || !desc) {
            alert('ID and Description are required.');
            return;
        }

        const newStyle = { style: id, description: desc };

        if (currentEditingStyleIndex !== null) {
            profile.styles[currentEditingStyleIndex] = newStyle;
        } else {
            if (profile.styles.some(s => s.style === id)) {
                alert('Style ID already exists.');
                return;
            }
            profile.styles.push(newStyle);
        }
        
        await saveProfile(profile);
        resetStyleForm();
        renderStyles();
    });

    document.getElementById('export-styles-btn').addEventListener('click', () => {
        exportData(profile.styles, 'lumina-neo-styles.json', 'application/json');
    });

    document.getElementById('import-styles-btn').addEventListener('click', async () => {
        if (!confirm('Importing styles will overwrite your current styles. Continue?')) return;
        try {
            const importedStyles = await importData();
            if (!Array.isArray(importedStyles)) {
                throw new Error('Invalid styles file format. Expected a JSON array.');
            }
            // Accept either [{style, description}] objects or plain strings
            const normalized = importedStyles.map(s => {
                if (typeof s === 'string') {
                    const id = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
                    return { style: id, description: s };
                }
                if (typeof s === 'object' && s !== null && 'style' in s && 'description' in s) {
                    return s;
                }
                throw new Error(`Invalid entry: ${JSON.stringify(s)}`);
            });
            profile.styles = normalized;
            // If the current active style no longer exists, default to the first imported one
            if (normalized.length > 0 && !normalized.find(s => s.style === profile.activeStyleId)) {
                profile.activeStyleId = normalized[0].style;
            }
            await saveProfile(profile);
            renderStyles();
            alert(`Imported ${normalized.length} styles successfully!`);
        } catch (err) {
            alert('Error importing styles: ' + err.message);
            console.error('Import styles error:', err);
        }
    });
}

function resetStyleForm() {
    document.getElementById('style-id').value = '';
    document.getElementById('style-id').disabled = false;
    document.getElementById('style-desc').value = '';
    document.getElementById('style-form-title').textContent = 'Add New Style';
    document.getElementById('save-style-btn').textContent = 'Add Style';
    document.getElementById('cancel-style-edit-btn').style.display = 'none';
    currentEditingStyleIndex = null;
}

async function saveProfile(profile) {
    try {
        await fetchApi('/profile', 'PUT', { userId: AppState.userId, profile });
        AppState.setProfile(profile);
    } catch (err) {
        alert('Failed to save: ' + err.message);
    }
}
