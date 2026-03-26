/**
 * Lumina Neo Frontend
 * Version: v1.1.4
 * SPA application bootstrapping and navigation
 */
import { renderHome } from './ui-home.js';
import { renderLogin } from './ui-login.js';
import { AppState } from './state.js';
import { fetchApi } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    console.log('Lumina Neo Initializing...');

    if (!AppState.userId) {
        console.log('No user logged in. Showing login screen.');
        renderLogin(() => {
            initApp();
        });
        return;
    }

    try {
        await loadProfile();
        await applyAppearance();
        setupNavigation();
        renderHome();
    } catch (err) {
        console.error('Initialization failed:', err);
        if (err.message.includes('Auth') || err.message.includes('401')) {
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

export async function applyAppearance() {
    const profile = AppState.currentProfile;
    if (!profile) return;

    let mode = profile.appearance || 'auto';

    if (mode === 'auto') {
        let isDay = false;
        
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            
            const res = await fetchApi(`/env?lat=${lat}&lon=${lon}`);
            const { sunrise, sunset } = res.weather;
            
            const now = new Date();
            const currentTime = now.getHours() * 60 + now.getMinutes();
            
            const parseTime = (t) => {
                const [h, m] = t.split(':').map(Number);
                return h * 60 + m;
            };
            
            const sunriseMinutes = parseTime(sunrise);
            const sunsetMinutes = parseTime(sunset);
            
            isDay = currentTime >= sunriseMinutes && currentTime < sunsetMinutes;
            console.log(`Auto Appearance: now=${currentTime}, sunrise=${sunriseMinutes}, sunset=${sunsetMinutes}, isDay=${isDay}`);
        } catch (err) {
            console.warn('Geolocation or Env API failed for auto appearance, falling back to system preference:', err);
            isDay = !window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        
        mode = isDay ? 'light' : 'dark';
    }

    if (mode === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navButtons.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', () => {
            const tabId = newBtn.getAttribute('data-tab');
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            newBtn.classList.add('active');
            tabPanes.forEach(pane => pane.classList.remove('active'));
            const targetPane = document.getElementById(`${tabId}-tab`);
            if (targetPane) {
                targetPane.classList.add('active');
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
        default:
            console.log(`Tab ${tabId} not implemented yet.`);
    }
}
