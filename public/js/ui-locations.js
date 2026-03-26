import { AppState } from './state.js';
import { fetchApi } from './api.js';
import { exportData, importData } from './utils.js';

let lastSanitized = null;

export function renderLocations() {
    const container = document.getElementById('locations-tab');
    const profile = AppState.currentProfile;
    
    if (!profile.locations) profile.locations = [];

    let html = `
        <div class="card">
            <h2>Your Locations</h2>
            <p>Manage the base locations for your scene generation.</p>
            <div style="display:flex; gap:10px; margin-bottom: 20px;">
                <button id="export-locations-btn" class="btn btn-secondary" style="flex:1;">Export Locations</button>
                <button id="import-locations-btn" class="btn btn-secondary" style="flex:1;">Import Locations</button>
            </div>
            <ul id="location-list" style="list-style: none; padding: 0; margin-top: 20px;">
                ${profile.locations.length === 0 ? '<p style="text-align:center; padding: 20px; opacity: 0.6;">No locations added yet.</p>' : ''}
                ${profile.locations.map((loc, index) => `
                    <li style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--glass-border);">
                        <div>
                            <div style="font-size: 1.1rem; font-weight: 600;">${loc.city}</div>
                            <div style="font-size: 0.9rem; color: var(--text-secondary);">${loc.state ? loc.state + ', ' : ''}${loc.country}</div>
                            <div style="font-size: 0.75rem; color: var(--primary-color); font-family: monospace; margin-top: 4px;">${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}</div>
                        </div>
                        <button class="btn btn-secondary btn-sm delete-loc-btn" data-index="${index}" style="padding: 8px 12px; font-size: 0.85rem;">Delete</button>
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="card">
            <h3>Add New Location</h3>
            <p style="font-size: 0.9rem; margin-bottom: 20px; opacity: 0.8;">Enter whatever you know, then click <strong>Lookup</strong> to automatically fetch and clean the details using Nominatim.</p>
            
            <div class="form-group">
                <label>City / Place Name</label>
                <input type="text" id="loc-city" placeholder="e.g. Paris or Portland">
            </div>
            <div class="form-group">
                <label>State / Region (Optional)</label>
                <input type="text" id="loc-state" placeholder="e.g. Oregon or Île-de-France">
            </div>
            <div class="form-group">
                <label>Country</label>
                <input type="text" id="loc-country" placeholder="e.g. USA or France">
            </div>
            
            <div id="sanitize-result" style="display:none; margin-bottom: 20px; padding: 15px; background: rgba(52, 199, 89, 0.1); border: 1px solid var(--success-color); border-radius: 12px;">
                <div style="font-weight: 600; color: var(--success-color); margin-bottom: 5px;">✓ Location Verified</div>
                <div id="verified-text" style="font-size: 0.95rem;"></div>
            </div>

            <div style="display: flex; gap: 10px;">
                <button id="lookup-loc-btn" class="btn btn-secondary" style="flex: 1;">Lookup & Sanitize</button>
                <button id="add-loc-btn" class="btn" style="flex: 1; display: none;">Confirm & Add</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Event Listeners
    document.querySelectorAll('.delete-loc-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!confirm('Are you sure you want to delete this location?')) return;
            const index = parseInt(e.target.dataset.index);
            profile.locations.splice(index, 1);
            await saveProfile(profile);
            renderLocations();
        });
    });

    const lookupBtn = document.getElementById('lookup-loc-btn');
    const addBtn = document.getElementById('add-loc-btn');
    const resultDiv = document.getElementById('sanitize-result');
    const verifiedText = document.getElementById('verified-text');

    lookupBtn.addEventListener('click', async () => {
        const city = document.getElementById('loc-city').value;
        const state = document.getElementById('loc-state').value;
        const country = document.getElementById('loc-country').value;

        if (!city && !country) {
            alert('Please enter at least a city or country.');
            return;
        }

        lookupBtn.textContent = 'Searching...';
        lookupBtn.disabled = true;

        try {
            const res = await fetchApi('/locations/sanitize', 'POST', {
                city, state, country, save: false
            });

            if (res.status === 'multiple') {
                // Show candidate picker
                verifiedText.innerHTML = `
                    <div style="margin-bottom: 8px; font-weight: 600; color: var(--warning-color, #f5a623);">Multiple matches found. Please choose one:</div>
                    ${res.candidates.map((c, i) => `
                        <div style="margin-bottom: 6px;">
                            <button class="btn btn-secondary btn-sm candidate-btn" data-index="${i}" style="width:100%; text-align:left; padding: 8px 12px;">
                                ${c.city}${c.state ? ', ' + c.state : ''}, ${c.country} <span style="opacity:0.6; font-size:0.8em;">(${c.lat.toFixed(3)}, ${c.lon.toFixed(3)})</span>
                            </button>
                        </div>
                    `).join('')}
                `;
                resultDiv.style.borderColor = 'var(--warning-color, #f5a623)';
                resultDiv.style.display = 'block';
                addBtn.style.display = 'none';

                resultDiv.querySelectorAll('.candidate-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const selectedIndex = parseInt(e.target.closest('.candidate-btn').dataset.index);
                        const confirmRes = await fetchApi('/locations/sanitize', 'POST', {
                            city, state, country, save: false, selectedIndex
                        });
                        lastSanitized = confirmRes.location;
                        showVerified(verifiedText, resultDiv, addBtn, lastSanitized);
                    });
                });
            } else {
                lastSanitized = res.location;
                showVerified(verifiedText, resultDiv, addBtn, lastSanitized);
            }

            lookupBtn.textContent = 'Re-Lookup';

        } catch (err) {
            alert('Lookup failed: ' + err.message);
            resultDiv.style.display = 'none';
            addBtn.style.display = 'none';
        } finally {
            lookupBtn.disabled = false;
        }
    });

    function showVerified(verifiedText, resultDiv, addBtn, loc) {
        verifiedText.innerHTML = `
            <strong>Cleaned:</strong> ${loc.city}${loc.state ? ', ' + loc.state : ''}, ${loc.country}<br>
            <span style="font-size: 0.8rem; opacity: 0.8;">Coords: ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}</span>
        `;
        resultDiv.style.borderColor = 'var(--success-color)';
        resultDiv.style.display = 'block';
        addBtn.style.display = 'block';
    }

    addBtn.addEventListener('click', async () => {
        if (!lastSanitized) return;

        if (profile.locations.some(l => l.id === lastSanitized.id)) {
            alert('This location is already in your list.');
            return;
        }

        addBtn.textContent = 'Adding...';
        addBtn.disabled = true;

        try {
            profile.locations.push(lastSanitized);
            await saveProfile(profile);
            
            lastSanitized = null;
            renderLocations();
        } catch (err) {
            alert('Save failed: ' + err.message);
            addBtn.disabled = false;
            addBtn.textContent = 'Confirm & Add';
        }
    });

    document.getElementById('export-locations-btn').addEventListener('click', () => {
        exportData(profile.locations, 'lumina-neo-locations.json', 'application/json');
    });

    document.getElementById('import-locations-btn').addEventListener('click', async () => {
        if (!confirm('Importing locations will overwrite your current locations. Continue?')) return;
        try {
            const importedLocations = await importData();
            if (!Array.isArray(importedLocations) || !importedLocations.every(l => 'id' in l && 'city' in l && 'state' in l && 'country' in l && 'lat' in l && 'lon' in l)) {
                throw new Error('Invalid locations file format.');
            }
            profile.locations = importedLocations;
            await saveProfile(profile);
            renderLocations();
            alert('Locations imported successfully!');
        } catch (err) {
            alert('Error importing locations: ' + err.message);
            console.error('Import locations error:', err);
        }
    });
}

async function saveProfile(profile) {
    try {
        await fetchApi('/profile', 'PUT', { userId: AppState.userId, profile });
        AppState.setProfile(profile);
    } catch (err) {
        console.error('Failed to save profile', err);
        alert('Failed to save changes to Cloudflare.');
    }
}
