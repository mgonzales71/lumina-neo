/**
 * Lumina Neo Frontend
 * Version: v1.0.0
 * SPA application bootstrapping and navigation
 */
import { renderHome } from './ui-home.js';
import { renderLogin } from './ui-login.js';
import { AppState } from './state.js';
import { fetchApi } from './api.js';

// Lazy imports handled in switch, but we can dynamic import
// or static import if we prefer. Given the size, static is fine but dynamic is cleaner for SPA.
// Let's stick to dynamic imports for non-critical tabs as per previous pattern for 'profiles'.

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    console.log('Lumina Neo Initializing...');

    if (!AppState.userId) {
        console.log('No user logged in. Showing login screen.');
        renderLogin(() => {
            // Reload to clear any stale state or just re-init
            initApp();
        });
        return;
    }

    try {
        await loadProfile();
        setupNavigation();
        renderHome(); // Initial render
    } catch (err) {
        console.error('Initialization failed:', err);
        if (err.message.includes('Auth') || err.message.includes('401')) {
            // Logout and retry
            AppState.userId = null;
            AppState.save();
            initApp();
        } else {
            alert('Failed to load profile. Please check your connection or login again.');
        }
    }
}

async function loadProfile() {
    console.log('Loading profile for user:', AppState.userId);
    const profileId = AppState.profileId || 'default';
    
    try {
        const profile = await fetchApi(`/profile?userId=${AppState.userId}&profileId=${profileId}`);
        AppState.setProfile(profile);
        console.log('Profile loaded:', profile.name);
    } catch (err) {
        console.error('Failed to load profile:', err);
        throw err;
    }
}

function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navButtons.forEach(btn => {
        // Remove old listeners to avoid duplicates if re-inited
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', () => {
            const tabId = newBtn.getAttribute('data-tab');
            
            // Update Active Button
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            newBtn.classList.add('active');

            // Update Active Pane
            tabPanes.forEach(pane => pane.classList.remove('active'));
            const targetPane = document.getElementById(`${tabId}-tab`);
            if (targetPane) {
                targetPane.classList.add('active');
                
                // Dispatch event or call render function for tab
                loadTabContent(tabId);
            }
        });
    });
}

function loadTabContent(tabId) {
    console.log('Switching to tab:', tabId);
    AppState.setTab(tabId);
    
    switch (tabId) {
        case 'home':
            renderHome();
            break;
        case 'profiles':
            import('./ui-profiles.js').then(module => module.renderProfiles());
            break;
        case 'locations':
            import('./ui-locations.js').then(module => module.renderLocations());
            break;
        case 'poi':
            import('./ui-poi.js').then(module => module.renderPOI());
            break;
        case 'themes':
            import('./ui-themes.js').then(module => module.renderThemes());
            break;
        case 'styles':
            import('./ui-styles.js').then(module => module.renderStyles());
            break;
        case 'prompts':
            import('./ui-prompts.js').then(module => module.renderPrompts());
            break;
        case 'sizes':
            import('./ui-sizes.js').then(module => module.renderSizes());
            break;
        case 'providers':
            import('./ui-providers.js').then(module => module.renderProviders());
            break;
        // Add other cases as we implement them
        default:
            console.log(`Tab ${tabId} not implemented yet.`);
    }
}
