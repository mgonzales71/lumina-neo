import { AppState } from './state.js';
import { fetchApi } from './api.js';

export function renderPOI() {
    const container = document.getElementById('poi-tab');
    const profile = AppState.currentProfile;
    const locations = profile.locations || [];

    if (locations.length === 0) {
        container.innerHTML = '<div class="card"><p>Please add a location in the Locations tab first.</p></div>';
        return;
    }

    // Default to first location if not selected
    let selectedLocId = container.dataset.selectedLocId || locations[0].id;

    // Check if selected location still exists
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
            <div style="display: flex; gap: 10px; margin-bottom: 1rem;">
                <button id="refresh-poi-btn" class="btn">Regenerate via AI</button>
                <button id="add-poi-btn" class="btn btn-secondary">Add Manually</button>
                <button id="save-poi-btn" class="btn" style="background-color: #27ae60;">Save Changes</button>
            </div>
        </div>

        <div class="card">
            <h3>POIs for <span id="current-loc-name">${locations.find(l => l.id === selectedLocId)?.city}</span></h3>
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
        loadPOIs(select.value, true);
    });

    document.getElementById('add-poi-btn').addEventListener('click', () => {
        addManualPOI();
    });

    document.getElementById('save-poi-btn').addEventListener('click', () => {
        savePOIs(select.value);
    });
}

let currentPOIs = [];

async function loadPOIs(locationId, refresh = false) {
    const listContainer = document.getElementById('poi-list-container');
    listContainer.innerHTML = 'Loading...';

    try {
        const data = await fetchApi('/poi/populate', 'POST', {
            userId: AppState.userId,
            locationId,
            refresh
        });
        currentPOIs = data; // Store in module scope for editing
        renderPOIList();
    } catch (err) {
        listContainer.innerHTML = `<p style="color: red;">Failed to load POIs: ${err.message}</p>`;
    }
}

function renderPOIList() {
    const listContainer = document.getElementById('poi-list-container');
    
    if (currentPOIs.length === 0) {
        listContainer.innerHTML = '<p>No POIs found. Click Regenerate or Add Manually.</p>';
        return;
    }

    listContainer.innerHTML = `
        <ul style="list-style: none; padding: 0;">
            ${currentPOIs.map((poi, index) => `
                <li style="border-bottom: 1px solid #444; padding: 10px 0;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1; margin-right: 10px;">
                            <input type="text" class="poi-name-input" data-index="${index}" value="${poi.name}" style="font-weight: bold; margin-bottom: 5px;">
                            <textarea class="poi-desc-input" data-index="${index}" rows="2" style="font-size: 0.9rem;">${poi.description}</textarea>
                        </div>
                        <button class="btn btn-secondary btn-sm delete-poi-btn" data-index="${index}">&times;</button>
                    </div>
                </li>
            `).join('')}
        </ul>
    `;

    // Bind edit events to update local state
    document.querySelectorAll('.poi-name-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = e.target.dataset.index;
            currentPOIs[idx].name = e.target.value;
        });
    });

    document.querySelectorAll('.poi-desc-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = e.target.dataset.index;
            currentPOIs[idx].description = e.target.value;
        });
    });

    document.querySelectorAll('.delete-poi-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = e.target.dataset.index;
            currentPOIs.splice(idx, 1);
            renderPOIList();
        });
    });
}

function addManualPOI() {
    currentPOIs.unshift({ name: 'New POI', description: 'Description here...' });
    renderPOIList();
}

async function savePOIs(locationId) {
    const btn = document.getElementById('save-poi-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        await fetchApi('/poi/save', 'POST', {
            locationId,
            pois: currentPOIs
        });
        alert('POIs saved successfully!');
    } catch (err) {
        alert('Failed to save POIs: ' + err.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}
