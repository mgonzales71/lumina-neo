import { AppState } from './state.js';
import { fetchApi } from './api.js';

let registry = null;
let providerData = {}; // Cache for account and models

export async function renderProviders() {
    const container = document.getElementById('providers-tab');
    
    if (!registry) {
        try {
            registry = await fetchApi('/providers/registry');
        } catch (err) {
            container.innerHTML = `<div class="card"><p style="color:red">Failed to load provider registry: ${err.message}</p></div>`;
            return;
        }
    }

    const profile = AppState.currentProfile;
    if (!profile.providerSettings) {
        profile.providerSettings = { activeProvider: 'pollinations', providers: {} };
    }
    const settings = profile.providerSettings;

    let html = `
        <div class="card">
            <h2>AI Providers</h2>
            <p>Configure which AI services are used for generation.</p>
            
            <div class="form-group">
                <label>Active Provider</label>
                <select id="active-provider-select">
                    ${Object.values(registry).map(p => `
                        <option value="${p.id}" ${settings.activeProvider === p.id ? 'selected' : ''}>${p.label}</option>
                    `).join('')}
                </select>
            </div>
            <button id="save-providers-btn" class="btn">Save Settings</button>
        </div>
    `;

    for (const def of Object.values(registry)) {
        if (!settings.providers[def.id]) {
            settings.providers[def.id] = { enabled: false, apiKey: '', image: { selectedModel: '', defaults: {} }, text: { selectedModel: '', defaults: {} } };
        }
        const userConf = settings.providers[def.id];

        // Fetch dynamic data if enabled and key exists
        if (userConf.enabled && userConf.apiKey && def.id === 'pollinations' && !providerData[def.id]) {
            try {
                const [account, imageModels, textModels] = await Promise.all([
                    fetchApi(`/providers/account?userId=${AppState.userId}&profileId=${profile.id}&providerId=${def.id}`),
                    fetchApi(`/providers/models?providerId=${def.id}&category=image`),
                    fetchApi(`/providers/models?providerId=${def.id}&category=text`)
                ]);
                providerData[def.id] = { account, imageModels, textModels };
            } catch (err) {
                console.error('Failed to fetch provider data:', err);
            }
        }

        const data = providerData[def.id] || {};
        const account = data.account || {};

        html += `
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3>${def.label} <a href="${def.docsUrl}" target="_blank" style="font-size: 0.8rem;">(Docs)</a></h3>
                    <label>
                        <input type="checkbox" class="provider-enable" data-id="${def.id}" ${userConf.enabled ? 'checked' : ''}> Enabled
                    </label>
                </div>
                
                <div class="provider-config" id="config-${def.id}" style="display: ${userConf.enabled ? 'block' : 'none'}; margin-top: 10px;">
                    <div class="form-group">
                        <label>API Key</label>
                        <input type="password" class="provider-apikey" data-id="${def.id}" value="${userConf.apiKey || ''}" placeholder="${def.apiKeyUrl ? 'Get key at ' + def.apiKeyUrl : 'No key required'}">
                    </div>

                    ${account.username ? `
                        <div class="provider-info" style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; margin-bottom: 15px; font-size: 0.9rem; line-height: 1.7;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <span><strong>${account.username}</strong> &nbsp;<span style="opacity:0.7; font-size:0.85em;">${account.tier}</span></span>
                                <span style="font-weight:600; color:var(--primary);">${account.balance} Pollen</span>
                            </div>
                            ${account.email ? `<div style="opacity:0.7; font-size:0.85em;">${account.email}</div>` : ''}
                            ${account.nextResetAt ? `<div style="opacity:0.6; font-size:0.8em;">Resets ${new Date(account.nextResetAt).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}</div>` : ''}
                        </div>
                    ` : ''}

                    <!-- Image Settings -->
                    ${def.categories.image ? renderCategoryConfig(def.id, 'image', def.categories.image, userConf.image, data.imageModels) : ''}
                    
                    <!-- Text Settings -->
                    ${def.categories.text ? renderCategoryConfig(def.id, 'text', def.categories.text, userConf.text, data.textModels) : ''}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;

    // Event Listeners
    document.getElementById('active-provider-select').addEventListener('change', (e) => {
        settings.activeProvider = e.target.value;
    });

    document.getElementById('save-providers-btn').addEventListener('click', async () => {
        await saveProfile(profile);
    });

    document.querySelectorAll('.provider-enable').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const id = e.target.dataset.id;
            settings.providers[id].enabled = e.target.checked;
            document.getElementById(`config-${id}`).style.display = e.target.checked ? 'block' : 'none';
        });
    });

    document.querySelectorAll('.provider-apikey').forEach(input => {
        input.addEventListener('change', (e) => {
            const id = e.target.dataset.id;
            settings.providers[id].apiKey = e.target.value;
            delete providerData[id]; // Clear cache to refetch with new key
        });
    });

    bindDynamicListeners(settings);
}

function renderCategoryConfig(providerId, categoryName, def, userConf, dynamicModels) {
    if (!userConf) userConf = { selectedModel: '', defaults: {} };

    let html = `<h4>${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} Generation</h4>`;
    
    // Model Select
    const modelField = def.fields.find(f => f.key === 'model');
    if (modelField) {
        html += `<div class="form-group"><label>Model</label>`;
        
        const modelsToRender = dynamicModels || (modelField.options ? modelField.options.map(o => ({ id: o, label: o })) : []);

        if (modelsToRender.length > 0) {
            html += `<select class="config-field" data-provider="${providerId}" data-category="${categoryName}" data-key="selectedModel">`;
            modelsToRender.forEach(m => {
                const label = m.paid ? `${m.label} 💰` : m.label;
                html += `<option value="${m.id}" ${userConf.selectedModel === m.id ? 'selected' : ''}>${label}</option>`;
            });
            html += `</select>`;
        } else {
             html += `<input type="text" class="config-field" data-provider="${providerId}" data-category="${categoryName}" data-key="selectedModel" value="${userConf.selectedModel || ''}">`;
        }
        html += `</div>`;
    }

    // Other Fields
    const nonModelFields = def.fields.filter(f => f.key !== 'model');
    if (nonModelFields.length > 0) {
        html += `<details style="margin-top:4px;"><summary style="cursor:pointer; font-size:0.85rem; opacity:0.7; margin-bottom:10px; user-select:none;">Advanced Options</summary><div style="padding-top:10px;">`;
        nonModelFields.forEach(field => {
            const val = userConf.defaults[field.key] !== undefined ? userConf.defaults[field.key] : '';
            const label = field.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            html += `<div class="form-group"><label>${label}</label>`;
            if (field.type === 'select') {
                html += `<select class="config-default-field" data-provider="${providerId}" data-category="${categoryName}" data-key="${field.key}">`;
                field.options.forEach(opt => {
                    html += `<option value="${opt}" ${val == opt ? 'selected' : ''}>${opt}</option>`;
                });
                html += `</select>`;
            } else if (field.type === 'boolean') {
                const checked = val === true || val === 'true';
                html += `<label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                    <input type="checkbox" class="config-default-field" data-provider="${providerId}" data-category="${categoryName}" data-key="${field.key}" ${checked ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer;">
                    <span style="font-size:0.85rem; opacity:0.8;">${label}</span>
                </label>`;
            } else {
                html += `<input type="${field.type === 'number' ? 'number' : 'text'}" class="config-default-field" data-provider="${providerId}" data-category="${categoryName}" data-key="${field.key}" value="${val}" placeholder="${field.key === 'negative_prompt' ? 'worst quality, blurry' : ''}">`;
            }
            html += `</div>`;
        });
        html += `</div></details>`;
    }

    return html;
}

function bindDynamicListeners(settings) {
    document.querySelectorAll('.config-field').forEach(input => {
        input.addEventListener('change', (e) => {
            const { provider, category, key } = e.target.dataset;
            if (!settings.providers[provider][category]) settings.providers[provider][category] = { selectedModel: '', defaults: {} };
            settings.providers[provider][category][key] = e.target.value;
        });
    });

    document.querySelectorAll('.config-default-field').forEach(input => {
        input.addEventListener('change', (e) => {
            const { provider, category, key } = e.target.dataset;
            if (!settings.providers[provider][category]) settings.providers[provider][category] = { selectedModel: '', defaults: {} };
            if (!settings.providers[provider][category].defaults) settings.providers[provider][category].defaults = {};
            const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
            settings.providers[provider][category].defaults[key] = value;
        });
    });
}

async function saveProfile(profile) {
    try {
        await fetchApi('/profile', 'PUT', { userId: AppState.userId, profile });
        AppState.setProfile(profile);
        alert('Provider settings saved!');
        renderProviders(); // Re-render to fetch new data
    } catch (err) {
        alert('Failed to save: ' + err.message);
    }
}
