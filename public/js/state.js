// State Management
export const AppState = {
    userId: localStorage.getItem('userId') || null,
    profileId: localStorage.getItem('profileId') || null,
    currentProfile: null,
    activeTab: 'home',
    lastGenerated: JSON.parse(localStorage.getItem('lastGenerated') || '{}'),

    save() {
        localStorage.setItem('userId', this.userId);
        if (this.profileId) localStorage.setItem('profileId', this.profileId);
        localStorage.setItem('lastGenerated', JSON.stringify(this.lastGenerated));
    },

    setProfile(profile) {
        this.currentProfile = profile;
        this.profileId = profile.id;
        this.save();
    },
    
    setTab(tabName) {
        this.activeTab = tabName;
        // Logic to update UI or dispatch event could go here
    }
};
