import { fetchApi } from './api.js';
import { AppState } from './state.js';

export function renderLogin(onSuccess) {
    const app = document.getElementById('app');
    
    // Create Modal Overlay
    const modal = document.createElement('div');
    modal.id = 'login-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '1000';

    modal.innerHTML = `
        <div class="card" style="width: 300px; text-align: center;">
            <h2>Lumina Neo Login</h2>
            <div class="form-group">
                <label for="login-userid">User ID</label>
                <input type="text" id="login-userid" placeholder="e.g. DEFAULT">
            </div>
            <div class="form-group">
                <label for="login-passkey">Passkey</label>
                <input type="password" id="login-passkey" placeholder="Passkey">
            </div>
            <button id="login-btn" class="btn">Login</button>
            <p id="login-error" style="color: red; margin-top: 10px; display: none;"></p>
        </div>
    `;

    app.appendChild(modal);

    const btn = document.getElementById('login-btn');
    const userIdInput = document.getElementById('login-userid');
    const passkeyInput = document.getElementById('login-passkey');
    const errorMsg = document.getElementById('login-error');

    btn.addEventListener('click', async () => {
        const userId = userIdInput.value.trim();
        const passkey = passkeyInput.value.trim();

        if (!userId || !passkey) {
            errorMsg.textContent = 'Please enter User ID and Passkey';
            errorMsg.style.display = 'block';
            return;
        }

        try {
            btn.disabled = true;
            btn.textContent = 'Logging in...';
            errorMsg.style.display = 'none';

            const data = await fetchApi('/auth/login', 'POST', { userId, passkey });
            
            // Login Success
            AppState.userId = data.userId;
            AppState.passkey = passkey; // keep in memory for authenticated requests
            AppState.save(); // Persist
            
            // Cleanup and Callback
            modal.remove();
            if (onSuccess) onSuccess();

        } catch (err) {
            errorMsg.textContent = err.message || 'Login failed';
            errorMsg.style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Login';
        }
    });
}
