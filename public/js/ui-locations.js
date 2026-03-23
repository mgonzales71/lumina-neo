import { AppState } from './state.js';
import { fetchApi } from './api.js';

export function renderLocations() {
    const container = document.getElementById('locations-tab');
    const profile = AppState.currentProfile;
    
    // Ensure locations array exists
    if (!profile.locations) profile.locations = [];

    let html = `
        <div class="card">
            <h2>Your Locations</h2>
            <ul id="location-list" style="list-style: none; padding: 0;">
                ${profile.locations.length === 0 ? '<p>No locations added yet.</p>' : ''}
                ${profile.locations.map((loc, index) => `
                    <li style="border-bottom: 1px solid #444; padding: 10px 0; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${loc.city}</strong>, ${loc.state}, ${loc.country}
                            <div style="font-size: 0.8rem; color: #aaa;">ID: ${loc.id} | Lat: ${loc.lat}, Lon: ${loc.lon}</div>
                        </div>
                        <button class="btn btn-secondary btn-sm delete-loc-btn" data-index="${index}">Delete</button>
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="card">
            <h3>Add New Location</h3>
            <div class="form-group">
                <label>City</label>
                <input type="text" id="loc-city" placeholder="Portland">
            </div>
            <div class="form-group">
                <label>State / Region</label>
                <input type="text" id="loc-state" placeholder="OR">
            </div>
            <div class="form-group">
                <label>Country</label>
                <input type="text" id="loc-country" placeholder="USA">
            </div>
            <button id="add-loc-btn" class="btn">Add Location</button>
        </div>
    `;

    container.innerHTML = html;

    // Event Listeners
    document.querySelectorAll('.delete-loc-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const index = parseInt(e.target.dataset.index);
            profile.locations.splice(index, 1);
            await saveProfile(profile);
            renderLocations();
        });
    });

    document.getElementById('add-loc-btn').addEventListener('click', async () => {
        const city = document.getElementById('loc-city').value;
        const state = document.getElementById('loc-state').value;
        const country = document.getElementById('loc-country').value;

        if (!city || !country) {
            alert('City and Country are required.');
            return;
        }

        const btn = document.getElementById('add-loc-btn');
        btn.textContent = 'Verifying...';
        btn.disabled = true;

        try {
            const result = await fetchApi('/locations/sanitize', 'POST', {
                city, state, country, save: true
            });

            if (result.status === 'multiple') {
                alert('Multiple matches found (feature not fully implemented). Picking first one.');
                // Handle multiple logic here if implemented
            }

            const newLoc = result.location;
            
            // Check for duplicates
            if (profile.locations.some(l => l.id === newLoc.id)) {
                alert('Location already exists in your profile.');
            } else {
                profile.locations.push(newLoc);
                await saveProfile(profile);
                renderLocations();
            }

        } catch (err) {
            alert('Error adding location: ' + err.message);
        } finally {
            btn.textContent = 'Add Location';
            btn.disabled = false;
        }
    });
}

async function saveProfile(profile) {
    try {
        await fetchApi('/profile', 'PUT', { userId: AppState.userId, profile });
        AppState.setProfile(profile);
    } catch (err) {
        console.error('Failed to save profile', err);
        alert('Failed to save changes.');
    }
}
