import { AppState } from './state.js';
import { fetchApi } from './api.js';
import { exportData, importData } from './utils.js';

let currentEditingPromptId = null; 

export function renderPrompts() {
    const container = document.getElementById('prompts-tab');
    const profile = AppState.currentProfile;
    if (!profile.prompts) profile.prompts = {};

    const promptList = Object.values(profile.prompts);

    let html = `
        <div class="card">
            <h2>Prompt Templates</h2>
            <p>Available variables: <code class="code-snippet">{poi_name}</code> <code class="code-snippet">{poi_desc}</code> <code class="code-snippet">{city}</code> <code class="code-snippet">{state_region}</code> <code class="code-snippet">{weather}</code> <code class="code-snippet">{temperature_f}</code> <code class="code-snippet">{time_of_day_simple}</code> <code class="code-snippet">{time_of_day_bucket}</code> <code class="code-snippet">{date}</code> <code class="code-snippet">{time}</code> <code class="code-snippet">{sunrise}</code> <code class="code-snippet">{sunset}</code> <code class="code-snippet">{moon_phase}</code> <code class="code-snippet">{moon_illumination_pct}</code> <code class="code-snippet">{moonrise}</code> <code class="code-snippet">{moonset}</code> <code class="code-snippet">{uv_index}</code> <code class="code-snippet">{cloud_cover_pct}</code> <code class="code-snippet">{visibility_mi}</code> <code class="code-snippet">{wind_speed_mph}</code> <code class="code-snippet">{theme}</code> <code class="code-snippet">{style}</code></p>
            <div style="display:flex; gap:10px; margin-bottom: 20px;">
                <button id="export-prompts-btn" class="btn btn-secondary" style="flex:1;">Export Prompts</button>
                <button id="import-prompts-btn" class="btn btn-secondary" style="flex:1;">Import Prompts</button>
            </div>
            <ul id="prompt-list" style="list-style: none; padding: 0;">
                ${promptList.length === 0 ? '<p style="text-align:center; padding: 20px; opacity: 0.6;">No prompts added yet.</p>' : ''}
                ${promptList.map((p) => {
                    const isDayActive = p.id === profile.activePromptDayId;
                    const isNightActive = p.id === profile.activePromptNightId;
                    return `
                    <li style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 10px; border: 1px solid ${isDayActive || isNightActive ? 'var(--primary-color)' : 'var(--glass-border)'};">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                            <div>
                                <strong style="font-size: 1.1rem;">${p.label}</strong>
                                <span style="font-size: 0.8rem; color: var(--text-secondary); margin-left: 6px;">(${p.id})</span>
                                ${isDayActive ? '<span style="font-size:0.8em; color:var(--primary-color); margin-left:6px;">☀ Day</span>' : ''}
                                ${isNightActive ? '<span style="font-size:0.8em; color:var(--primary-color); margin-left:6px;">☾ Night</span>' : ''}
                            </div>
                            <div style="display:flex; gap: 8px; flex-wrap: wrap;">
                                ${!isDayActive ? `<button class="btn btn-sm set-day-prompt-btn" data-id="${p.id}" style="padding: 6px 10px; font-size: 0.8rem;">☀ Set Day</button>` : ''}
                                ${!isNightActive ? `<button class="btn btn-sm set-night-prompt-btn" data-id="${p.id}" style="padding: 6px 10px; font-size: 0.8rem;">☾ Set Night</button>` : ''}
                                <button class="btn btn-secondary btn-sm edit-prompt-btn" data-id="${p.id}" style="padding: 8px 12px; font-size: 0.85rem;">Edit</button>
                                <button class="btn btn-secondary btn-sm delete-prompt-btn" data-id="${p.id}" style="padding: 8px 12px; font-size: 0.85rem;">Delete</button>
                            </div>
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary); word-break: break-word;">${p.template.substring(0, 120)}${p.template.length > 120 ? '…' : ''}</div>
                    </li>`;
                }).join('')}
            </ul>
        </div>

        <div class="card">
            <h3 id="prompt-form-title">Add New Prompt Template</h3>
            <div class="form-group">
                <label>ID (e.g., "MY_PROMPT")</label>
                <input type="text" id="prompt-id" placeholder="UNIQUE_ID">
            </div>
            <div class="form-group">
                <label>Label</label>
                <input type="text" id="prompt-label" placeholder="My Custom Prompt">
            </div>
            <div class="form-group">
                <label>Template</label>
                <textarea id="prompt-template" rows="3" placeholder="A shot of {poi_name} at {time_of_day_bucket}..."></textarea>
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="save-prompt-btn" class="btn" style="flex:1;">Add Prompt</button>
                <button id="cancel-prompt-edit-btn" class="btn btn-secondary" style="flex:1; display:none;">Cancel Edit</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Event Listeners
    document.querySelectorAll('.set-day-prompt-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            profile.activePromptDayId = e.target.dataset.id;
            await saveProfile(profile);
            renderPrompts();
        });
    });

    document.querySelectorAll('.set-night-prompt-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            profile.activePromptNightId = e.target.dataset.id;
            await saveProfile(profile);
            renderPrompts();
        });
    });

    document.querySelectorAll('.delete-prompt-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!confirm('Are you sure you want to delete this prompt?')) return;
            const id = e.target.dataset.id;
            delete profile.prompts[id];
            await saveProfile(profile);
            renderPrompts();
        });
    });

    document.querySelectorAll('.edit-prompt-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const promptToEdit = profile.prompts[id];
            
            document.getElementById('prompt-id').value = promptToEdit.id;
            document.getElementById('prompt-id').disabled = true; 
            document.getElementById('prompt-label').value = promptToEdit.label;
            document.getElementById('prompt-template').value = promptToEdit.template;
            
            document.getElementById('prompt-form-title').textContent = 'Edit Prompt';
            document.getElementById('save-prompt-btn').textContent = 'Update Prompt';
            document.getElementById('cancel-prompt-edit-btn').style.display = 'block';
            currentEditingPromptId = id;
        });
    });

    document.getElementById('cancel-prompt-edit-btn').addEventListener('click', () => {
        resetPromptForm();
    });

    document.querySelectorAll('.prompt-active-toggle').forEach(chk => {
        chk.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            profile.prompts[id].active = e.target.checked;
            await saveProfile(profile);
        });
    });

    document.getElementById('save-prompt-btn').addEventListener('click', async () => {
        const id = document.getElementById('prompt-id').value.trim();
        const label = document.getElementById('prompt-label').value.trim();
        const template = document.getElementById('prompt-template').value.trim();

        if (!id || !label || !template) {
            alert('All fields (ID, Label, Template) are required.');
            return;
        }

        const newPrompt = {
            id,
            label,
            template,
            active: profile.prompts[id] ? profile.prompts[id].active : true 
        };

        if (currentEditingPromptId !== null) {
            profile.prompts[currentEditingPromptId] = newPrompt; 
        } else {
            if (profile.prompts[id]) {
                alert('Prompt ID already exists. Please choose a unique ID.');
                return;
            }
            profile.prompts[id] = newPrompt; 
        }
        
        await saveProfile(profile);
        resetPromptForm();
        renderPrompts();
    });

    document.getElementById('export-prompts-btn').addEventListener('click', () => {
        exportData(profile.prompts, 'lumina-neo-prompts.json', 'application/json');
    });

    document.getElementById('import-prompts-btn').addEventListener('click', async () => {
        if (!confirm('Importing prompts will overwrite your current prompts. Continue?')) return;
        try {
            const importedPrompts = await importData();
            if (typeof importedPrompts !== 'object' || importedPrompts === null || Array.isArray(importedPrompts) || !Object.values(importedPrompts).every(p => 'id' in p && 'label' in p && 'template' in p && 'active' in p)) {
                throw new Error('Invalid prompts file format. Expected an object with prompt objects.');
            }
            profile.prompts = importedPrompts;
            await saveProfile(profile);
            renderPrompts();
            alert('Prompts imported successfully!');
        } catch (err) {
            alert('Error importing prompts: ' + err.message);
            console.error('Import prompts error:', err);
        }
    });
}

function resetPromptForm() {
    document.getElementById('prompt-id').value = '';
    document.getElementById('prompt-id').disabled = false;
    document.getElementById('prompt-label').value = '';
    document.getElementById('prompt-template').value = '';
    document.getElementById('prompt-form-title').textContent = 'Add New Prompt Template';
    document.getElementById('save-prompt-btn').textContent = 'Add Prompt';
    document.getElementById('cancel-prompt-edit-btn').style.display = 'none';
    currentEditingPromptId = null;
}

async function saveProfile(profile) {
    try {
        await fetchApi('/profile', 'PUT', { userId: AppState.userId, profile });
        AppState.setProfile(profile);
    } catch (err) {
        alert('Failed to save: ' + err.message);
    }
}
