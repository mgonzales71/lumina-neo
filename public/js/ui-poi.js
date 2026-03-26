import { AppState } from './state.js';
import { fetchApi } from './api.js';
import { exportData, importData } from './utils.js';

export function renderPOI() {
    const container = document.getElementById('poi-tab');
    const profile = AppState.currentProfile;
    const locations = profile.locations || [];

    if (locations.length === 0) {
        container.innerHTML = '<div class="card"><p>Please add a location in the Locations tab first.</p></div>';
        return;
    }

    let selectedLocId = container.dataset.selectedLocId || locations[0].id;

    if (!locations.find(l => l.id === selectedLocId)) {
        selectedLocId = locations[0].id;
    }

    let html = `
        <div class="card">
            <h2>Manage Points of Interest</h2>
            <div class="form-group">
                <label>Select Location</label>
                <select id="poi-location-select">
                    ${locations.map(loc => `<option value="${loc.id}" ${loc.id === selectedLocId ? 'selected' : ''}>${loc.city}, ${loc.country}</option>`).join('')}
                </select>
            </div>
            <div style="display:flex; gap:10px; margin-bottom: 20px;">
                <button id="export-pois-btn" class="btn btn-secondary" style="flex:1;">Export POIs</button>
                <button id="import-pois-btn" class="btn btn-secondary" style="flex:1;">Import POIs</button>
            </div>
            <div style="display: flex; gap: 10px; margin-bottom: 1rem;">
                <button id="refresh-poi-btn" class="btn">Regenerate via AI</button>
                <button id="add-poi-btn" class="btn btn-secondary">Add Manually</button>
                <button id="save-poi-btn" class="btn" style="background-color: var(--primary-color);">Save Changes</button>
            </div>
        </div>

        <div class="card">
            <h3 id="current-loc-name-display">POIs for <span id="current-loc-name">${locations.find(l => l.id === selectedLocId)?.city}</span></h3>
            <div id="poi-list-container">Loading...</div>
        </div>
    `;

    container.innerHTML = html;
    
    // Initial Load
    loadPOIs(selectedLocId);

    // Event Listeners
    const select = document.getElementById('poi-location-select');
    select.addEventListener('change', (e) => {
        const newId = e.target.value;
        container.dataset.selectedLocId = newId;
        document.getElementById('current-loc-name').textContent = locations.find(l => l.id === newId)?.city;
        loadPOIs(newId);
    });

    document.getElementById('refresh-poi-btn').addEventListener('click', () => {
        const currentLocId = document.getElementById('poi-location-select').value;
        const currentLoc = profile.locations.find(l => l.id === currentLocId);
        if (!currentLoc) { alert('Please select a valid location.'); return; }

        loadPOIs(currentLocId, true, currentLoc.city, currentLoc.state, currentLoc.country);
    });

    document.getElementById('add-poi-btn').addEventListener('click', () => {
        addManualPOI();
    });

    document.getElementById('save-poi-btn').addEventListener('click', () => {
        const currentLocId = document.getElementById('poi-location-select').value;
        savePOIs(currentLocId);
    });

    document.getElementById('export-pois-btn').addEventListener('click', () => {
        const currentLocId = document.getElementById('poi-location-select').value;
        exportData(currentPOIs, `lumina-neo-pois-${currentLocId}.json`, 'application/json');
    });

    document.getElementById('import-pois-btn').addEventListener('click', async () => {
        if (!confirm('Importing POIs will overwrite your current POIs for this location. Continue?')) return;
        try {
            const importedPOIs = await importData();
            if (!Array.isArray(importedPOIs) || !importedPOIs.every(p => 'name' in p && 'description' in p)) {
                throw new Error('Invalid POIs file format. Expected an array of POI objects with name and description.');
            }
            currentPOIs = importedPOIs;
            renderPOIList();
            const currentLocId = document.getElementById('poi-location-select').value;
            await savePOIs(currentLocId, false); // Save the imported POIs to KV
            alert('POIs imported successfully!');
        } catch (err) {
            alert('Error importing POIs: ' + err.message);
            console.error('Import POIs error:', err);
        }
    });
}

let currentPOIs = [];

async function loadPOIs(locationId, refresh = false, city = '', state = '', country = '') {
    const listContainer = document.getElementById('poi-list-container');
    listContainer.innerHTML = 'Loading...';

    try {
        const data = await fetchApi('/poi/populate', 'POST', {
            userId: AppState.userId,
            profileId: AppState.currentProfile.id,
            locationId,
            city,
            state,
            country,
            refresh
        });
        currentPOIs = data; 
        renderPOIList();
    } catch (err) {
        listContainer.innerHTML = `<p style="color: red;">Failed to load POIs: ${err.message}</p>`;
    }
}

function renderPOIList() {
    const listContainer = document.getElementById('poi-list-container');
    
    if (currentPOIs.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; padding: 20px; opacity: 0.6;">No POIs found. Click Regenerate or Add Manually.</p>';
        return;
    }

    listContainer.innerHTML = `
        <ul style="list-style: none; padding: 0;">
            ${currentPOIs.map((poi, index) => `
                <li style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: start; border: 1px solid var(--glass-border);">
                    <div style="flex: 1; margin-right: 10px;">
                        <div class="form-group" style="margin-bottom: 10px;">
                            <label>Name</label>
                            <input type="text" class="poi-name-input" data-index="${index}" value="${poi.name}" placeholder="POI Name">
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label>Description</label>
                            <textarea class="poi-desc-input" data-index="${index}" rows="2" placeholder="Description"></textarea>
                        </div>
                    </div>
                    <button class="btn btn-secondary btn-sm delete-poi-btn" data-index="${index}" style="padding: 8px 12px; font-size: 0.85rem;">&times;</button>
                </li>
            `).join('')}
        </ul>
    `;

    document.querySelectorAll('.poi-name-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.index);
            currentPOIs[idx].name = e.target.value;
        });
    });

    document.querySelectorAll('.poi-desc-input').forEach(input => {
        input.value = currentPOIs[parseInt(input.dataset.index)].description; // Ensure textarea gets correct initial value
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.index);
            currentPOIs[idx].description = e.target.value;
        });
    });

    document.querySelectorAll('.delete-poi-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!confirm('Are you sure you want to delete this POI?')) return;
            const idx = parseInt(e.target.dataset.index);
            currentPOIs.splice(idx, 1);
            renderPOIList();
        });
    });
}

function addManualPOI() {
    currentPOIs.unshift({ name: 'New Point of Interest', description: 'A brief description of this point of interest.' });
    renderPOIList();
}

async function savePOIs(locationId, showSuccessAlert = true) {
    const btn = document.getElementById('save-poi-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        await fetchApi('/poi/save', 'POST', {
            locationId,
            pois: currentPOIs
        });
        if(showSuccessAlert) alert('POIs saved successfully!');
    } catch (err) {
        alert('Failed to save POIs: ' + err.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}
