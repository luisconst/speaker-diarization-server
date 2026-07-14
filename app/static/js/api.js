/**
 * API Client for Speaker Diarization Server
 */
class ApiClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    async _request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        // Setup headers if not form data
        if (!(options.body instanceof FormData)) {
            options.headers = {
                'Content-Type': 'application/json',
                ...options.headers
            };
        }

        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                let errorMsg = `HTTP Error: ${response.status}`;
                try {
                    const errJson = await response.json();
                    if (errJson && errJson.detail) {
                        errorMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
                    }
                } catch (e) {}
                throw new Error(errorMsg);
            }
            // Return JSON if it exists, otherwise success message
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            return { success: true };
        } catch (error) {
            console.error(`API Error on ${endpoint}:`, error);
            throw error;
        }
    }

    // Health and GPU Status
    async getStatus() {
        return this._request('/api/v1/status');
    }

    // Speaker Endpoints
    async getSpeakers() {
        return this._request('/api/v1/speakers');
    }

    async enrollSpeaker(name, audioFile = null) {
        const formData = new FormData();
        formData.append('name', name);
        if (audioFile) {
            formData.append('audio_file', audioFile);
        }
        return this._request('/api/v1/speakers/enroll', {
            method: 'POST',
            body: formData
        });
    }

    async renameSpeaker(speakerId, newName) {
        return this._request(`/api/v1/speakers/${speakerId}/rename`, {
            method: 'PATCH',
            body: JSON.stringify({ new_name: newName })
        });
    }

    async deleteSpeaker(speakerId) {
        return this._request(`/api/v1/speakers/${speakerId}`, {
            method: 'DELETE'
        });
    }

    async deleteAllUnknownSpeakers() {
        return this._request('/api/v1/speakers/unknown/all', {
            method: 'DELETE'
        });
    }

    // Speaker Emotion Profiles
    async getSpeakerEmotionThreshold(speakerId) {
        return this._request(`/api/v1/conversations/speakers/${speakerId}/emotion-threshold`);
    }

    async updateSpeakerEmotionThreshold(speakerId, threshold) {
        return this._request(`/api/v1/conversations/speakers/${speakerId}/emotion-threshold?threshold=${threshold}`, {
            method: 'PATCH'
        });
    }

    async getSpeakerEmotionProfiles(speakerId) {
        return this._request(`/api/v1/conversations/speakers/${speakerId}/emotion-profiles`);
    }

    async updateSpeakerEmotionProfileThreshold(speakerId, emotionCategory, threshold) {
        return this._request(`/api/v1/conversations/speakers/${speakerId}/emotion-profiles/${encodeURIComponent(emotionCategory)}/threshold?threshold=${threshold}`, {
            method: 'PATCH'
        });
    }

    async updateSpeakerEmotionProfileVoiceThreshold(speakerId, emotionCategory, threshold) {
        return this._request(`/api/v1/conversations/speakers/${speakerId}/emotion-profiles/${encodeURIComponent(emotionCategory)}/voice-threshold?threshold=${threshold}`, {
            method: 'PATCH'
        });
    }

    async deleteSpeakerEmotionProfiles(speakerId) {
        return this._request(`/api/v1/conversations/speakers/${speakerId}/emotion-profiles`, {
            method: 'DELETE'
        });
    }


    // Conversation Endpoints
    async getConversations(skip = 0, limit = 100, status = null, speakerId = null, startDate = null, endDate = null, uploadedBy = null) {
        let query = `/api/v1/conversations?skip=${skip}&limit=${limit}`;
        if (status) query += `&status=${encodeURIComponent(status)}`;
        if (speakerId) query += `&speaker_id=${encodeURIComponent(speakerId)}`;
        if (startDate) query += `&start_date=${encodeURIComponent(startDate)}`;
        if (endDate) query += `&end_date=${encodeURIComponent(endDate)}`;
        if (uploadedBy) query += `&uploaded_by=${encodeURIComponent(uploadedBy)}`;
        return this._request(query);
    }



    async getConversation(id) {
        return this._request(`/api/v1/conversations/${id}`);
    }

    async updateConversationTitle(id, title) {
        return this._request(`/api/v1/conversations/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ title })
        });
    }

    async deleteConversation(id) {
        return this._request(`/api/v1/conversations/${id}`, {
            method: 'DELETE'
        });
    }

    async reprocessConversation(id) {
        return this._request(`/api/v1/conversations/${id}/reprocess`, {
            method: 'POST'
        });
    }

    async recalculateEmotions(id) {
        return this._request(`/api/v1/conversations/${id}/recalculate-emotions`, {
            method: 'POST'
        });
    }

    // Segment and Human-in-the-loop Endpoints
    async identifySpeakerInSegment(conversationId, segmentId, { speakerId = null, speakerName = null, enroll = true }) {
        return this._request(`/api/v1/conversations/${conversationId}/segments/${segmentId}/identify`, {
            method: 'POST',
            body: JSON.stringify({
                speaker_id: speakerId,
                speaker_name: speakerName,
                enroll: enroll
            })
        });
    }

    async correctEmotionInSegment(conversationId, segmentId, emotionCategory, learn = true) {
        return this._request(`/api/v1/conversations/${conversationId}/segments/${segmentId}/correct-emotion?corrected_emotion=${encodeURIComponent(emotionCategory)}&learn=${learn}`, {
            method: 'POST'
        });
    }

    async toggleSegmentMisidentified(conversationId, segmentId, isMisidentified) {
        return this._request(`/api/v1/conversations/${conversationId}/segments/${segmentId}/misidentified`, {
            method: 'PATCH',
            body: JSON.stringify({ is_misidentified: isMisidentified })
        });
    }

    async toggleEmotionMisidentified(conversationId, segmentId, isMisidentified) {
        return this._request(`/api/v1/conversations/${conversationId}/segments/${segmentId}/emotion-misidentified`, {
            method: 'PATCH',
            body: JSON.stringify({ is_misidentified: isMisidentified })
        });
    }

    getSegmentAudioUrl(segmentId) {
        return `/api/v1/conversations/segments/${segmentId}/audio`;
    }

    getSpeakerSampleAudioUrl(speakerId) {
        return `/api/v1/speakers/${speakerId}/sample-audio`;
    }

    getExportTranscriptUrl(conversationId, format) {
        return `/api/v1/conversations/${conversationId}/export?format=${format}`;
    }


    // Process Full Audio File
    async processAudioFile(file) {
        const formData = new FormData();
        formData.append('audio_file', file);
        return this._request('/api/v1/process', {
            method: 'POST',
            body: formData
        });
    }

    // Settings Endpoints
    async getSettings() {
        return this._request('/api/v1/settings/voice');
    }

    async saveSettings(settings) {
        return this._request('/api/v1/settings/voice', {
            method: 'POST',
            body: JSON.stringify(settings)
        });
    }

    async resetSettings() {
        return this._request('/api/v1/settings/voice/reset', {
            method: 'POST'
        });
    }

    // Profiles and Checkpoints (Backup & Restore)
    async getProfiles() {
        return this._request('/api/v1/profiles');
    }

    async createProfile(name) {
        // Name passed as query param or body depends on endpoint design. Let's see backup_api:
        // @router.post("") with JSON body
        return this._request('/api/v1/profiles', {
            method: 'POST',
            body: JSON.stringify({ profile_name: name })
        });
    }

    async deleteProfile(name) {
        return this._request(`/api/v1/profiles/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });
    }

    async createCheckpoint(profileName, note = "") {
        return this._request(`/api/v1/profiles/${encodeURIComponent(profileName)}/checkpoints`, {
            method: 'POST',
            body: JSON.stringify({ note })
        });
    }

    async getCheckpoints(profileName) {
        return this._request(`/api/v1/profiles/${encodeURIComponent(profileName)}/checkpoints`);
    }

    async restoreCheckpoint(profileName, checkpointTimestamp) {
        return this._request('/api/v1/profiles/restore', {
            method: 'POST',
            body: JSON.stringify({
                profile_name: profileName,
                checkpoint_timestamp: checkpointTimestamp
            })
        });
    }

    // WS Connection helper
    getStreamingWebSocketUrl() {
        const loc = window.location;
        const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = loc.host;
        return `${proto}//${host}/api/v1/streaming/ws`;
    }
}

export const api = new ApiClient();
export default api;
