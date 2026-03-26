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
                        <div class="provider-info" style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 0.9rem;">
                            <strong>Account:</strong> ${account.username} (${account.tier})<br>
                            <strong>Balance:</strong> ${account.balance} Pollen
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
                const label = m.paid ? `${m.label} *` : m.label;
                html += `<option value="${m.id}" ${userConf.selectedModel === m.id ? 'selected' : ''}>${label}</option>`;
            });
            html += `</select>`;
        } else {
             html += `<input type="text" class="config-field" data-provider="${providerId}" data-category="${categoryName}" data-key="selectedModel" value="${userConf.selectedModel || ''}">`;
        }
        html += `</div>`;
    }

    // Other Fields
    def.fields.filter(f => f.key !== 'model').forEach(field => {
        const val = userConf.defaults[field.key] !== undefined ? userConf.defaults[field.key] : '';
        html += `<div class="form-group"><label>${field.key}</label>`;
        if (field.type === 'select') {
             html += `<select class="config-default-field" data-provider="${providerId}" data-category="${categoryName}" data-key="${field.key}">`;
             field.options.forEach(opt => {
                 html += `<option value="${opt}" ${val == opt ? 'selected' : ''}>${opt}</option>`;
             });
             html += `</select>`;
        } else {
            html += `<input type="${field.type === 'number' ? 'number' : 'text'}" class="config-default-field" data-provider="${providerId}" data-category="${categoryName}" data-key="${field.key}" value="${val}">`;
        }
        html += `</div>`;
    });

    return html;
}

function bindDynamicListeners(settings) {
    document.querySelectorAll('.config-field').forEach(input => {
        input.addEventListener('change', (e) => {
            const { provider, category, key } = e.target.dataset;
            settings.providers[provider][category][key] = e.target.value;
        });
    });

    document.querySelectorAll('.config-default-field').forEach(input => {
        input.addEventListener('change', (e) => {
            const { provider, category, key } = e.target.dataset;
            if (!settings.providers[provider][category].defaults) settings.providers[provider][category].defaults = {};
            settings.providers[provider][category].defaults[key] = e.target.value;
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
