import { AppState } from './state.js';
import { fetchApi } from './api.js';

export function renderThemes() {
    const container = document.getElementById('themes-tab');
    const profile = AppState.currentProfile;
    if (!profile.themes) profile.themes = [];

    // Helper to format MMDD to Date string
    const formatDate = (mmdd) => {
        const str = mmdd.toString().padStart(4, '0');
        return `${str.slice(0, 2)}/${str.slice(2)}`;
    };

    let html = `
        <div class="card">
            <h2>Seasonal Themes</h2>
            <p>Themes are automatically selected based on the current date.</p>
            <ul id="theme-list" style="list-style: none; padding: 0;">
                ${profile.themes.map((t, index) => `
                    <li style="border-bottom: 1px solid #444; padding: 10px 0; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${t.Theme}</strong> (${formatDate(t.Begin)} - ${formatDate(t.End)})
                        </div>
                        <button class="btn btn-secondary btn-sm delete-theme-btn" data-index="${index}">Delete</button>
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="card">
            <h3>Add New Theme</h3>
            <div class="form-group">
                <label>Theme Name</label>
                <input type="text" id="theme-name" placeholder="e.g. Halloween">
            </div>
            <div style="display: flex; gap: 10px;">
                <div class="form-group" style="flex: 1;">
                    <label>Start Date (MM-DD)</label>
                    <input type="date" id="theme-start">
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>End Date (MM-DD)</label>
                    <input type="date" id="theme-end">
                </div>
            </div>
            <button id="add-theme-btn" class="btn">Add Theme</button>
        </div>
    `;

    container.innerHTML = html;

    // Delete
    document.querySelectorAll('.delete-theme-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const index = e.target.dataset.index;
            profile.themes.splice(index, 1);
            await saveProfile(profile);
            renderThemes();
        });
    });

    // Add
    document.getElementById('add-theme-btn').addEventListener('click', async () => {
        const name = document.getElementById('theme-name').value;
        const startVal = document.getElementById('theme-start').value; // YYYY-MM-DD
        const endVal = document.getElementById('theme-end').value;

        if (!name || !startVal || !endVal) {
            alert('All fields are required.');
            return;
        }

        const parseDate = (d) => {
            const parts = d.split('-'); // YYYY, MM, DD
            return parseInt(parts[1]) * 100 + parseInt(parts[2]);
        };

        const newTheme = {
            Theme: name,
            Begin: parseDate(startVal),
            End: parseDate(endVal)
        };

        profile.themes.push(newTheme);
        await saveProfile(profile);
        renderThemes();
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
