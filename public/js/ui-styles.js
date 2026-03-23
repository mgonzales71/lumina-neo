import { AppState } from './state.js';
import { fetchApi } from './api.js';

export function renderStyles() {
    const container = document.getElementById('styles-tab');
    const profile = AppState.currentProfile;
    if (!profile.styles) profile.styles = [];

    let html = `
        <div class="card">
            <h2>Styles</h2>
            <p>Define artistic styles to be used in image generation.</p>
            <ul id="style-list" style="list-style: none; padding: 0;">
                ${profile.styles.map((s, index) => `
                    <li style="border-bottom: 1px solid #444; padding: 10px 0; display: flex; justify-content: space-between; align-items: start;">
                        <div>
                            <strong>${s.style}</strong>
                            <p style="font-size: 0.9rem; color: #ccc; margin: 0;">${s.description}</p>
                        </div>
                        <button class="btn btn-secondary btn-sm delete-style-btn" data-index="${index}">Delete</button>
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="card">
            <h3>Add New Style</h3>
            <div class="form-group">
                <label>Style ID (e.g., "cyberpunk")</label>
                <input type="text" id="style-id" placeholder="cyberpunk">
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="style-desc" rows="3" placeholder="A futuristic, neon-lit cyberpunk cityscape..."></textarea>
            </div>
            <button id="add-style-btn" class="btn">Add Style</button>
        </div>
    `;

    container.innerHTML = html;

    // Delete
    document.querySelectorAll('.delete-style-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const index = e.target.dataset.index;
            profile.styles.splice(index, 1);
            await saveProfile(profile);
            renderStyles();
        });
    });

    // Add
    document.getElementById('add-style-btn').addEventListener('click', async () => {
        const id = document.getElementById('style-id').value.trim();
        const desc = document.getElementById('style-desc').value.trim();

        if (!id || !desc) {
            alert('ID and Description are required.');
            return;
        }

        // Check unique
        if (profile.styles.some(s => s.style === id)) {
            alert('Style ID already exists.');
            return;
        }

        profile.styles.push({ style: id, description: desc });
        await saveProfile(profile);
        renderStyles();
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
