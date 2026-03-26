/**
 * Lumina Neo Frontend Utility Functions
 * Version: v1.2.2
 */

export function exportData(data, filename, type) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function importData() {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) {
                return reject(new Error('No file selected'));
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    resolve(data);
                } catch (error) {
                    reject(new Error('Invalid JSON file'));
                }
            };
            reader.onerror = (error) => {
                reject(new Error('Failed to read file'));
            };
            reader.readAsText(file);
        };
        input.click();
    });
}
