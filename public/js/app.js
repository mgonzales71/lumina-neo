/**
 * Lumina Neo Frontend
 * Version: v1.1.6
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

    if (!AppState.userId || !AppState.passkey) {
        console.log('No session. Showing login screen.');
        renderLogin(() => {
            initApp();
        });
        return;
    }

    try {
        await loadProfile();
        await applyAppearance();
        setupNavigation();
        initThemeControls();
        initBgControls();
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
    const themeMode = localStorage.getItem('lumina_theme') || 'auto';

    if (themeMode === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        return;
    }
    if (themeMode === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        return;
    }

    // 'auto': determine from sunrise/sunset at current location
    let isDay = false;
    try {
        const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        const res = await fetchApi(`/env?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
        const { sunrise, sunset } = res.weather;
        const now = new Date();
        const cur = now.getHours() * 60 + now.getMinutes();
        const parse = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        isDay = cur >= parse(sunrise) && cur < parse(sunset);
        console.log(`Auto Appearance: isDay=${isDay}`);
    } catch (err) {
        console.warn('Auto appearance fallback to system preference:', err);
        isDay = window.matchMedia('(prefers-color-scheme: light)').matches;
    }

    document.documentElement.setAttribute('data-theme', isDay ? 'light' : 'dark');
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
            // Scroll active tab into view in the bottom bar
            newBtn.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
            tabPanes.forEach(pane => pane.classList.remove('active'));
            const targetPane = document.getElementById(`${tabId}-tab`);
            if (targetPane) {
                targetPane.classList.add('active');
                // Scroll content back to top on tab switch
                document.getElementById('tab-content').scrollTop = 0;
                loadTabContent(tabId);
            }
        });
    });
}

// ── Theme Toggle (3-way: auto → light → dark → auto) ───────

function initThemeControls() {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    const current = localStorage.getItem('lumina_theme') || 'auto';
    btn.setAttribute('data-mode', current);
    btn.onclick = toggleTheme;
}

function toggleTheme() {
    const btn = document.getElementById('theme-toggle-btn');
    const current = localStorage.getItem('lumina_theme') || 'auto';
    const next = current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto';
    localStorage.setItem('lumina_theme', next);
    if (btn) btn.setAttribute('data-mode', next);

    if (next === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else if (next === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        // Auto: apply system preference immediately; sunrise/sunset runs on next load
        const prefersDark = !window.matchMedia('(prefers-color-scheme: light)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
}

// ── BG Color Picker ────────────────────────────────────────

function initBgControls() {
    const savedBg = localStorage.getItem('lumina_bg') || 'forest';
    applyBg(savedBg);

    const btn     = document.getElementById('bg-picker-btn');
    const popover = document.getElementById('bg-popover');
    if (!btn || !popover) return;

    btn.onclick = (e) => {
        e.stopPropagation();
        popover.classList.toggle('open');
    };

    // Close on outside tap — register only once
    if (!window._bgPopoverBound) {
        window._bgPopoverBound = true;
        document.addEventListener('click', () => {
            document.getElementById('bg-popover')?.classList.remove('open');
        });
    }

    document.querySelectorAll('.bg-swatch').forEach(swatch => {
        swatch.onclick = (e) => {
            e.stopPropagation();
            const bg = swatch.getAttribute('data-bg');
            applyBg(bg);
            localStorage.setItem('lumina_bg', bg);
            popover.classList.remove('open');
        };
    });
}

function applyBg(bgId) {
    document.documentElement.setAttribute('data-bg', bgId);
    document.querySelectorAll('.bg-swatch').forEach(s => {
        s.classList.toggle('active', s.getAttribute('data-bg') === bgId);
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
