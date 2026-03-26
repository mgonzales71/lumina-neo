import { AppState } from './state.js';
import { fetchApi } from './api.js';
import { applyAppearance } from './app.js';
import { exportData, importData } from './utils.js';

export async function renderProfiles() {
    const container = document.getElementById('profiles-tab');
    const profile = AppState.currentProfile; // Active profile

    let userProfiles = [];
    try {
        userProfiles = await fetchApi(`/profiles/list?userId=${AppState.userId}`);
    } catch (err) {
        console.error('Failed to load user profiles:', err);
        container.innerHTML = `<div class="card"><p style="color:red">Failed to load profiles: ${err.message}</p></div>`;
        return;
    }

    let html = `
        <div class="card">
            <h2>Manage Profiles</h2>
            <p>Each profile stores independent settings for Lumina Neo.</p>

            <div style="display:flex; gap:10px; margin-bottom: 20px;">
                <button id="export-all-profiles-btn" class="btn btn-secondary" style="flex:1;">Export All</button>
                <button id="import-profiles-btn" class="btn btn-secondary" style="flex:1;">Import Profiles</button>
            </div>

            <h3>Your Profiles</h3>
            <ul id="profile-list" style="list-style: none; padding: 0;">
                ${userProfiles.length === 0 ? '<p style="text-align:center; padding: 20px; opacity: 0.6;">No profiles found.</p>' : ''}
                ${userProfiles.map(p => `
                    <li style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--glass-border);">
                        <div>
                            <div style="font-size: 1.1rem; font-weight: 600;">
                                ${p.name} ${p.id === profile.id ? '<span style="font-size:0.8em; color:var(--primary-color);"> (Active)</span>' : ''}
                            </div>
                            <div style="font-size: 0.9rem; color: var(--text-secondary);">ID: ${p.id}</div>
                        </div>
                        <div style="display:flex; gap: 8px;">
                            ${p.id !== profile.id ? `<button class="btn btn-secondary btn-sm switch-profile-btn" data-id="${p.id}" style="padding: 8px 12px; font-size: 0.85rem;">Switch To</button>` : ''}
                            ${p.id !== profile.id ? `<button class="btn btn-secondary btn-sm delete-profile-btn" data-id="${p.id}" style="padding: 8px 12px; font-size: 0.85rem;">Delete</button>` : ''}
                        </div>
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="card">
            <h3 id="current-profile-settings-title">Current Profile Settings: ${profile.name}</h3>
            <div class="form-group">
                <label>Profile ID</label>
                <input type="text" value="${profile.id}" disabled>
            </div>
            <div class="form-group">
                <label>Name</label>
                <input type="text" id="profile-name" value="${profile.name}">
            </div>
             <div class="form-group">
                <label>Appearance (UI)</label>
                <select id="profile-appearance">
                    <option value="auto" ${profile.appearance === 'auto' ? 'selected' : ''}>Auto (Sunrise/Sunset)</option>
                    <option value="dark" ${profile.appearance === 'dark' ? 'selected' : ''}>Dark</option>
                    <option value="light" ${profile.appearance === 'light' ? 'selected' : ''}>Light</option>
                </select>
                <p style="font-size: 0.8rem; margin-top: 5px; opacity: 0.7;">Auto mode switches between light and dark based on your local sunrise and sunset.</p>
            </div>
            <button id="save-current-profile-btn" class="btn">Save Changes</button>
        </div>

        <div class="card">
            <h3>Create New Profile</h3>
            <div class="form-group">
                <label>New Profile ID (e.g., "WORK_PROFILE")</label>
                <input type="text" id="new-profile-id" placeholder="UNIQUE_ID_FOR_NEW_PROFILE">
            </div>
            <div class="form-group">
                <label>New Profile Name</label>
                <input type="text" id="new-profile-name" placeholder="My Work Profile">
            </div>
            <button id="create-profile-btn" class="btn">Create Profile</button>
        </div>

        <div class="card">
            <h3>Account</h3>
            <p>Logged in as: <strong>${AppState.userId}</strong></p>
            <button id="logout-btn" class="btn btn-secondary">Logout</button>
        </div>
    `;

    container.innerHTML = html;

    // Event Listeners for current profile settings
    document.getElementById('save-current-profile-btn').addEventListener('click', async () => {
        const newName = document.getElementById('profile-name').value;
        const newAppearance = document.getElementById('profile-appearance').value;
        
        const updatedProfile = { ...profile, name: newName, appearance: newAppearance };
        
        try {
            await fetchApi('/profile', 'PUT', { userId: AppState.userId, profile: updatedProfile });
            AppState.setProfile(updatedProfile);
            await applyAppearance();
            alert('Profile settings saved!');
            renderProfiles(); // Re-render to update list
        } catch (err) {
            alert('Failed to save profile: ' + err.message);
        }
    });

    // Event Listeners for profile list
    document.querySelectorAll('.switch-profile-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (confirm(`Switch to profile "${userProfiles.find(p => p.id === id)?.name}"?`)) {
                AppState.profileId = id;
                AppState.save();
                location.reload(); // Full reload to apply new profile settings everywhere
            }
        });
    });

    document.querySelectorAll('.delete-profile-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const idToDelete = e.target.dataset.id;
            if (confirm(`Are you sure you want to delete profile "${userProfiles.find(p => p.id === idToDelete)?.name}"? This action cannot be undone.`)) {
                try {
                    // Need backend endpoint for deleting a profile
                    await fetchApi(`/profile/delete?userId=${AppState.userId}&profileId=${idToDelete}`, 'DELETE');
                    alert('Profile deleted!');
                    // If deleted active profile, switch to default or first available
                    if (AppState.profileId === idToDelete) {
                        AppState.profileId = userProfiles.find(p => p.id !== idToDelete)?.id || 'default'; // Switch to another or default
                        AppState.save();
                        location.reload();
                    } else {
                        renderProfiles(); // Re-render to update list
                    }
                } catch (err) {
                    alert('Failed to delete profile: ' + err.message);
                }
            }
        });
    });

    document.getElementById('create-profile-btn').addEventListener('click', async () => {
        const newId = document.getElementById('new-profile-id').value.trim();
        const newName = document.getElementById('new-profile-name').value.trim();

        if (!newId || !newName) {
            alert('New Profile ID and Name are required.');
            return;
        }
        if (userProfiles.some(p => p.id === newId)) {
            alert('Profile ID already exists. Please choose a unique ID.');
            return;
        }

        const newProfile = createDefaultProfile(newId); // Use backend logic for default structure
        newProfile.name = newName;

        try {
            await fetchApi('/profile', 'PUT', { userId: AppState.userId, profile: newProfile });
            AppState.profileId = newId; // Set newly created as active
            AppState.save();
            location.reload();
            alert('Profile created and activated!');
        } catch (err) {
            alert('Failed to create profile: ' + err.message);
        }
    });

    document.getElementById('export-all-profiles-btn').addEventListener('click', async () => {
        try {
            const allUserProfiles = await fetchApi(`/profiles/list?userId=${AppState.userId}`);
            exportData(allUserProfiles, `lumina-neo-profiles-${AppState.userId}.json`, 'application/json');
        } catch (err) {
            alert('Failed to export profiles: ' + err.message);
        }
    });

    document.getElementById('import-profiles-btn').addEventListener('click', async () => {
        if (!confirm('Importing profiles will add/overwrite profiles for this user. Existing profiles with matching IDs will be overwritten. Continue?')) return;
        try {
            const importedProfiles = await importData();
            if (!Array.isArray(importedProfiles) || !importedProfiles.every(p => 'id' in p && 'name' in p && 'appearance' in p)) {
                throw new Error('Invalid profiles file format. Expected an array of profile objects.');
            }
            
            for (const impProfile of importedProfiles) {
                // Overwrite/add each profile
                await fetchApi('/profile', 'PUT', { userId: AppState.userId, profile: impProfile });
            }
            alert('Profiles imported successfully!');
            renderProfiles(); // Re-render to show imported profiles
        } catch (err) {
            alert('Error importing profiles: ' + err.message);
            console.error('Import profiles error:', err);
        }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        AppState.userId = null;
        AppState.profileId = null;
        AppState.currentProfile = null;
        AppState.save();
        location.reload();
    });
}

function createDefaultProfile(id) {
  return {
    id,
    name: 'Default Profile',
    appearance: 'auto',
    language: 'en',
    activePromptDayId: 'POI_DAYTIME',
    activePromptNightId: 'POI_NIGHTTIME',
    activeStyleId: 'photorealistic',
    activeImageSizeId: 'DEVICE',
    themes: [],
    styles: [
      { style: 'photorealistic', description: 'Highly detailed, photorealistic 8k image' }
    ],
    locations: [],
    prompts: {
      'POI_DAYTIME': { id: 'POI_DAYTIME', label: 'Daytime', template: 'A beautiful daytime shot of {poi_name}, {weather}, {style}', active: true },
      'POI_NIGHTTIME': { id: 'POI_NIGHTTIME', label: 'Nighttime', template: 'A cinematic nighttime shot of {poi_name}, {weather}, {style}', active: true }
    },
    imageSizes: {
      default: 'DEVICE',
      sizes: {
        'DEVICE': { label: 'This Device', mode: 'dynamic', width: null, height: null }
      }
    },
    providerSettings: {
      activeProvider: 'pollinations',
      providers: {
        pollinations: { 
          enabled: true, 
          apiKey: '',
          image: { selectedModel: 'flux', defaults: {} },
          text: { selectedModel: 'openai', defaults: {} }
        },
        openrouter: { 
          enabled: false, 
          apiKey: '',
          image: { selectedModel: '', defaults: {} },
          text: { selectedModel: '', defaults: {} }
        }
      }
    }
  };
}
