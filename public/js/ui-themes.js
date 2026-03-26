import { AppState } from './state.js';
import { fetchApi } from './api.js';
import { exportData, importData } from './utils.js';

let currentEditingThemeIndex = null; 

export function renderThemes() {
    const container = document.getElementById('themes-tab');
    const profile = AppState.currentProfile;
    if (!profile.themes) profile.themes = [];

    const formatDateForDisplay = (mmdd) => {
        const str = mmdd.toString().padStart(4, '0');
        return `${str.slice(0, 2)}/${str.slice(2)}`;
    };

    const formatDateForInput = (mmdd) => {
        if (!mmdd) return '';
        const str = mmdd.toString().padStart(4, '0');
        const year = new Date().getFullYear(); 
        return `${year}-${str.slice(0, 2)}-${str.slice(2)}`;
    };

    let html = `
        <div class="card">
            <h2>Seasonal Themes</h2>
            <p>Themes are automatically selected based on the current date.</p>
            <div style="display:flex; gap:10px; margin-bottom: 20px;">
                <button id="export-themes-btn" class="btn btn-secondary" style="flex:1;">Export Themes</button>
                <button id="import-themes-btn" class="btn btn-secondary" style="flex:1;">Import Themes</button>
            </div>
            <ul id="theme-list" style="list-style: none; padding: 0;">
                ${profile.themes.length === 0 ? '<p style="text-align:center; padding: 20px; opacity: 0.6;">No themes added yet.</p>' : ''}
                ${profile.themes.map((t, index) => `
                    <li style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--glass-border);">
                        <div>
                            <div style="font-size: 1.1rem; font-weight: 600;">${t.Theme}</div>
                            <div style="font-size: 0.9rem; color: var(--text-secondary);">(${formatDateForDisplay(t.Begin)} - ${formatDateForDisplay(t.End)})</div>
                        </div>
                        <div style="display:flex; gap: 8px;">
                            <button class="btn btn-secondary btn-sm edit-theme-btn" data-index="${index}" style="padding: 8px 12px; font-size: 0.85rem;">Edit</button>
                            <button class="btn btn-secondary btn-sm delete-theme-btn" data-index="${index}" style="padding: 8px 12px; font-size: 0.85rem;">Delete</button>
                        </div>
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="card">
            <h3 id="theme-form-title">Add New Theme</h3>
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
            <div style="display: flex; gap: 10px;">
                <button id="save-theme-btn" class="btn" style="flex:1;">Add Theme</button>
                <button id="cancel-edit-btn" class="btn btn-secondary" style="flex:1; display:none;">Cancel Edit</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Event Listeners
    document.querySelectorAll('.delete-theme-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!confirm('Are you sure you want to delete this theme?')) return;
            const index = parseInt(e.target.dataset.index);
            profile.themes.splice(index, 1);
            await saveProfile(profile);
            renderThemes();
        });
    });

    document.querySelectorAll('.edit-theme-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const themeToEdit = profile.themes[index];
            
            document.getElementById('theme-name').value = themeToEdit.Theme;
            document.getElementById('theme-start').value = formatDateForInput(themeToEdit.Begin);
            document.getElementById('theme-end').value = formatDateForInput(themeToEdit.End);
            
            document.getElementById('theme-form-title').textContent = 'Edit Theme';
            document.getElementById('save-theme-btn').textContent = 'Update Theme';
            document.getElementById('cancel-edit-btn').style.display = 'block';
            currentEditingThemeIndex = index;
        });
    });

    document.getElementById('cancel-edit-btn').addEventListener('click', () => {
        resetThemeForm();
    });

    document.getElementById('save-theme-btn').addEventListener('click', async () => {
        const name = document.getElementById('theme-name').value;
        const startVal = document.getElementById('theme-start').value; 
        const endVal = document.getElementById('theme-end').value;

        if (!name || !startVal || !endVal) {
            alert('All fields are required.');
            return;
        }

        const parseDate = (d) => {
            const parts = d.split('-'); 
            return parseInt(parts[1]) * 100 + parseInt(parts[2]);
        };

        const newTheme = {
            Theme: name,
            Begin: parseDate(startVal),
            End: parseDate(endVal)
        };

        if (currentEditingThemeIndex !== null) {
            profile.themes[currentEditingThemeIndex] = newTheme;
        } else {
            profile.themes.push(newTheme);
        }
        
        await saveProfile(profile);
        resetThemeForm();
        renderThemes();
    });

    document.getElementById('export-themes-btn').addEventListener('click', () => {
        exportData(profile.themes, 'lumina-neo-themes.json', 'application/json');
    });

    document.getElementById('import-themes-btn').addEventListener('click', async () => {
        if (!confirm('Importing themes will overwrite your current themes. Continue?')) return;
        try {
            const importedThemes = await importData();
            if (!Array.isArray(importedThemes) || !importedThemes.every(t => 'Theme' in t && 'Begin' in t && 'End' in t)) {
                throw new Error('Invalid themes file format.');
            }
            profile.themes = importedThemes;
            await saveProfile(profile);
            renderThemes();
            alert('Themes imported successfully!');
        } catch (err) {
            alert('Error importing themes: ' + err.message);
            console.error('Import themes error:', err);
        }
    });
}

function resetThemeForm() {
    document.getElementById('theme-name').value = '';
    document.getElementById('theme-start').value = '';
    document.getElementById('theme-end').value = '';
    document.getElementById('theme-form-title').textContent = 'Add New Theme';
    document.getElementById('save-theme-btn').textContent = 'Add Theme';
    document.getElementById('cancel-edit-btn').style.display = 'none';
    currentEditingThemeIndex = null;
}

async function saveProfile(profile) {
    try {
        await fetchApi('/profile', 'PUT', { userId: AppState.userId, profile });
        AppState.setProfile(profile);
    } catch (err) {
        alert('Failed to save: ' + err.message);
    }
}
