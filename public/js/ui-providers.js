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
                    <button class="provider-enable-btn ${userConf.enabled ? 'toggle-on' : ''}" data-id="${def.id}" style="
                        min-width:58px; padding:5px 12px; border-radius:20px; font-size:0.8rem; font-weight:600;
                        border:1.5px solid ${userConf.enabled ? 'var(--primary)' : 'var(--glass-border)'};
                        background:${userConf.enabled ? 'rgba(var(--primary-rgb),0.2)' : 'rgba(255,255,255,0.05)'};
                        color:${userConf.enabled ? 'var(--primary)' : 'var(--text-secondary)'};
                        cursor:pointer; transition:all 0.2s;
                    ">${userConf.enabled ? 'ON' : 'OFF'}</button>
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

    document.querySelectorAll('.provider-enable-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const newVal = !settings.providers[id].enabled;
            settings.providers[id].enabled = newVal;
            e.target.classList.toggle('toggle-on', newVal);
            e.target.textContent = newVal ? 'ON' : 'OFF';
            e.target.style.border = `1.5px solid ${newVal ? 'var(--primary)' : 'var(--glass-border)'}`;
            e.target.style.background = newVal ? 'rgba(var(--primary-rgb),0.2)' : 'rgba(255,255,255,0.05)';
            e.target.style.color = newVal ? 'var(--primary)' : 'var(--text-secondary)';
            document.getElementById(`config-${id}`).style.display = newVal ? 'block' : 'none';
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
        html += `<div style="margin-top:12px; padding-top:12px; border-top:0.5px solid var(--glass-border);">
            <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; opacity:0.5; margin-bottom:12px;">Advanced Options</div>`;

        nonModelFields.forEach(field => {
            const val = userConf.defaults[field.key] !== undefined ? userConf.defaults[field.key] : '';
            const label = field.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

            if (field.type === 'boolean') {
                const active = val === true || val === 'true';
                html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0;">
                    <span style="font-size:0.9rem; opacity:0.85;">${label}</span>
                    <button class="toggle-btn ${active ? 'toggle-on' : ''}" data-provider="${providerId}" data-category="${categoryName}" data-key="${field.key}" style="
                        min-width:58px; padding:5px 12px; border-radius:20px; font-size:0.8rem; font-weight:600;
                        border:1.5px solid ${active ? 'var(--primary)' : 'var(--glass-border)'};
                        background:${active ? 'rgba(var(--primary-rgb),0.2)' : 'rgba(255,255,255,0.05)'};
                        color:${active ? 'var(--primary)' : 'var(--text-secondary)'};
                        cursor:pointer; transition:all 0.2s;
                    ">${active ? 'ON' : 'OFF'}</button>
                </div>`;
            } else if (field.type === 'select') {
                html += `<div class="form-group"><label>${label}</label>
                    <select class="config-default-field" data-provider="${providerId}" data-category="${categoryName}" data-key="${field.key}">`;
                field.options.forEach(opt => {
                    html += `<option value="${opt}" ${val == opt ? 'selected' : ''}>${opt}</option>`;
                });
                html += `</select></div>`;
            } else {
                html += `<div class="form-group"><label>${label}</label>
                    <input type="${field.type === 'number' ? 'number' : 'text'}" class="config-default-field" data-provider="${providerId}" data-category="${categoryName}" data-key="${field.key}" value="${val}" placeholder="${field.key === 'negative_prompt' ? 'worst quality, blurry' : ''}">
                </div>`;
            }
        });
        html += `</div>`;
    }

    return html;
}

function bindDynamicListeners(settings) {
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const { provider, category, key } = e.target.dataset;
            if (!settings.providers[provider][category]) settings.providers[provider][category] = { selectedModel: '', defaults: {} };
            if (!settings.providers[provider][category].defaults) settings.providers[provider][category].defaults = {};
            const newVal = !settings.providers[provider][category].defaults[key];
            settings.providers[provider][category].defaults[key] = newVal;
            // Update button appearance immediately
            e.target.classList.toggle('toggle-on', newVal);
            e.target.textContent = newVal ? 'ON' : 'OFF';
            e.target.style.border = `1.5px solid ${newVal ? 'var(--primary)' : 'var(--glass-border)'}`;
            e.target.style.background = newVal ? 'rgba(var(--primary-rgb),0.2)' : 'rgba(255,255,255,0.05)';
            e.target.style.color = newVal ? 'var(--primary)' : 'var(--text-secondary)';
        });
    });

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
