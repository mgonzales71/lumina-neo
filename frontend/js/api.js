const API_BASE_URL = 'https://api.lumina-neo.peakits.com/api';

export async function fetchApi(endpoint, method = 'GET', body = null, headers = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);
        const json = await response.json();

        if (!response.ok || !json.ok) {
            throw new Error(json.error?.message || `API Error: ${response.status}`);
        }

        return json.data;
    } catch (error) {
        console.error('API Request Failed:', error);
        throw error;
    }
}
