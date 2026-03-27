import { AppState } from './state.js';
import { fetchApi } from './api.js';
import { exportData, importData } from './utils.js';

let currentEditingPromptId = null;

const PROMPT_VARIABLES = [
    { group: 'POI',      vars: ['poi_name', 'poi_desc'] },
    { group: 'Location', vars: ['city', 'state_region', 'country'] },
    { group: 'Time',     vars: ['time_of_day', 'time_of_day_simple', 'time_of_day_bucket', 'datetime', 'date', 'time'] },
    { group: 'Weather',  vars: ['weather', 'temperature', 'temperature_f', 'wind_speed_mph', 'cloud_cover_pct', 'visibility_mi', 'uv_index', 'precipitation_chance'] },
    { group: 'Sun/Moon', vars: ['sunrise', 'sunset', 'moon_phase', 'moon_illumination_pct', 'moonrise', 'moonset'] },
    { group: 'Style',    vars: ['theme', 'style'] },
];

function buildVariableChips() {
    return PROMPT_VARIABLES.map(group => `
        <div style="margin-bottom: 8px;">
            <span style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.5; display: block; margin-bottom: 4px;">${group.group}</span>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${group.vars.map(v => `
                    <button class="var-chip" data-var="${v}" style="
                        background: rgba(var(--primary-rgb, 99,102,241), 0.15);
                        border: 1px solid rgba(var(--primary-rgb, 99,102,241), 0.35);
                        color: inherit;
                        border-radius: 6px;
                        padding: 3px 9px;
                        font-size: 0.78rem;
                        font-family: monospace;
                        cursor: pointer;
                        line-height: 1.6;
                    ">{${v}}</button>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
}

export function renderPrompts() {
    const container = document.getElementById('prompts-tab');
    const profile = AppState.currentProfile;
    if (!profile.prompts) profile.prompts = {};

    const promptList = Object.values(profile.prompts);

    let html = `
        <div class="card">
            <h2>Prompt Templates</h2>
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
                    <li style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 10px; border: 1px solid ${isDayActive || isNightActive ? 'var(--primary)' : 'var(--glass-border)'};">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                            <div>
                                <strong style="font-size: 1.1rem;">${p.label}</strong>
                                <span style="font-size: 0.8rem; color: var(--text-secondary); margin-left: 6px;">(${p.id})</span>
                                ${isDayActive ? '<span style="font-size:0.8em; color:var(--primary); margin-left:6px;">☀ Day</span>' : ''}
                                ${isNightActive ? '<span style="font-size:0.8em; color:var(--primary); margin-left:6px;">☾ Night</span>' : ''}
                            </div>
                            <div style="display:flex; gap: 8px; flex-wrap: wrap;">
                                ${!isDayActive ? `<button class="btn btn-sm set-day-prompt-btn" data-id="${p.id}" style="padding: 6px 10px; font-size: 0.8rem;">☀ Set Day</button>` : ''}
                                ${!isNightActive ? `<button class="btn btn-sm set-night-prompt-btn" data-id="${p.id}" style="padding: 6px 10px; font-size: 0.8rem;">☾ Set Night</button>` : ''}
                                <button class="btn btn-secondary btn-sm edit-prompt-btn" data-id="${p.id}" style="padding: 8px 12px; font-size: 0.85rem;">Edit</button>
                                <button class="btn btn-danger btn-sm delete-prompt-btn" data-id="${p.id}" style="padding: 8px 12px; font-size: 0.85rem;">Delete</button>
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
                <div style="background: var(--input-bg); border: 0.5px solid var(--input-border); border-radius: var(--r-md); padding: 12px; margin-bottom: 8px;">
                    <div style="font-size: 0.75rem; opacity: 0.6; margin-bottom: 10px;">Tap a variable to insert it at the cursor:</div>
                    ${buildVariableChips()}
                </div>
                <textarea id="prompt-template" rows="5" placeholder="A {style} image of {poi_name} at {time_of_day_bucket}..."></textarea>
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="save-prompt-btn" class="btn" style="flex:1;">Add Prompt</button>
                <button id="cancel-prompt-edit-btn" class="btn btn-cancel" style="flex:1; display:none;">Cancel Edit</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Variable chip insertion
    const textarea = document.getElementById('prompt-template');
    document.querySelectorAll('.var-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            insertAtCursor(textarea, `{${chip.dataset.var}}`);
        });
    });

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

            // Scroll form into view
            document.getElementById('prompt-form-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    document.getElementById('cancel-prompt-edit-btn').addEventListener('click', () => {
        resetPromptForm();
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
            const ids = Object.keys(importedPrompts);
            if (ids.length > 0) {
                if (!importedPrompts[profile.activePromptDayId]) profile.activePromptDayId = ids[0];
                if (!importedPrompts[profile.activePromptNightId]) profile.activePromptNightId = ids[0];
            }
            await saveProfile(profile);
            renderPrompts();
            alert(`Imported ${ids.length} prompts successfully!`);
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
