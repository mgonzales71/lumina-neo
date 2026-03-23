import { AppState } from './state.js';
import { fetchApi } from './api.js';

export function renderProfiles() {
    const container = document.getElementById('profiles-tab');
    const profile = AppState.currentProfile;

    container.innerHTML = `
        <div class="card">
            <h2>Current Profile: ${profile.name}</h2>
            <div class="form-group">
                <label>Profile ID</label>
                <input type="text" value="${profile.id}" disabled>
            </div>
            <div class="form-group">
                <label>Name</label>
                <input type="text" id="profile-name" value="${profile.name}">
            </div>
             <div class="form-group">
                <label>Theme (UI)</label>
                <select id="profile-theme">
                    <option value="dark" ${profile.theme === 'dark' ? 'selected' : ''}>Dark</option>
                    <option value="light" ${profile.theme === 'light' ? 'selected' : ''}>Light</option>
                </select>
            </div>
            <button id="save-profile-btn" class="btn">Save Changes</button>
        </div>
        
        <div class="card">
            <h3>Account</h3>
            <p>Logged in as: <strong>${AppState.userId}</strong></p>
            <button id="logout-btn" class="btn btn-secondary">Logout</button>
        </div>
    `;

    document.getElementById('save-profile-btn').addEventListener('click', async () => {
        const newName = document.getElementById('profile-name').value;
        const newTheme = document.getElementById('profile-theme').value;
        
        const updatedProfile = { ...profile, name: newName, theme: newTheme };
        
        try {
            await fetchApi('/profile', 'PUT', { userId: AppState.userId, profile: updatedProfile });
            AppState.setProfile(updatedProfile);
            alert('Profile saved!');
            renderProfiles(); // Re-render to update title
        } catch (err) {
            alert('Failed to save profile: ' + err.message);
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
