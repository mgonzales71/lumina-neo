import { AppState } from './state.js';
import { fetchApi } from './api.js';

export function renderPrompts() {
    const container = document.getElementById('prompts-tab');
    const profile = AppState.currentProfile;
    if (!profile.prompts) profile.prompts = {};

    const promptList = Object.values(profile.prompts);

    let html = `
        <div class="card">
            <h2>Prompt Templates</h2>
            <p>Use placeholders like {poi_name}, {weather}, {time_of_day}, {style}.</p>
            <ul id="prompt-list" style="list-style: none; padding: 0;">
                ${promptList.map((p) => `
                    <li style="border-bottom: 1px solid #444; padding: 10px 0; display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <strong>${p.label}</strong> (ID: ${p.id})
                            <button class="btn btn-secondary btn-sm delete-prompt-btn" data-id="${p.id}">Delete</button>
                        </div>
                        <textarea class="edit-prompt-template" data-id="${p.id}" rows="2" style="font-family: monospace;">${p.template}</textarea>
                        <div style="font-size: 0.8rem; display: flex; gap: 10px;">
                            <label><input type="checkbox" class="edit-prompt-active" data-id="${p.id}" ${p.active ? 'checked' : ''}> Active</label>
                        </div>
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="card">
            <h3>Add New Prompt Template</h3>
            <div class="form-group">
                <label>ID (e.g., "MY_PROMPT")</label>
                <input type="text" id="prompt-id">
            </div>
            <div class="form-group">
                <label>Label</label>
                <input type="text" id="prompt-label" placeholder="My Custom Prompt">
            </div>
            <div class="form-group">
                <label>Template</label>
                <textarea id="prompt-template" rows="3" placeholder="A shot of {poi_name}..."></textarea>
            </div>
            <button id="add-prompt-btn" class="btn">Add Prompt</button>
        </div>
    `;

    container.innerHTML = html;

    // Delete
    document.querySelectorAll('.delete-prompt-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            delete profile.prompts[id];
            await saveProfile(profile);
            renderPrompts();
        });
    });

    // Edit Template
    document.querySelectorAll('.edit-prompt-template').forEach(area => {
        area.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            profile.prompts[id].template = e.target.value;
            await saveProfile(profile);
        });
    });

    // Edit Active
    document.querySelectorAll('.edit-prompt-active').forEach(chk => {
        chk.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            profile.prompts[id].active = e.target.checked;
            await saveProfile(profile);
        });
    });

    // Add
    document.getElementById('add-prompt-btn').addEventListener('click', async () => {
        const id = document.getElementById('prompt-id').value.trim();
        const label = document.getElementById('prompt-label').value.trim();
        const template = document.getElementById('prompt-template').value.trim();

        if (!id || !label || !template) {
            alert('All fields are required.');
            return;
        }

        if (profile.prompts[id]) {
            alert('Prompt ID already exists.');
            return;
        }

        profile.prompts[id] = {
            id,
            label,
            template,
            active: true
        };

        await saveProfile(profile);
        renderPrompts();
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
