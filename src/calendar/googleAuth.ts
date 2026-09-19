import { App, Notice, Platform, requestUrl } from 'obsidian';
import type GoogleCalendarSyncPlugin from '../core/main';
import type { OAuth2Tokens } from '../core/types';
import { LogUtils } from '../utils/logUtils';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';

const REFRESH_TOKEN_SECRET_ID = 'obsidian-tasks-gcal-sync-refresh-token';
const LOCAL_STATE_KEY = 'obsidian-tasks-gcal-sync-oauth-state';
const LOCAL_VERIFIER_KEY = 'obsidian-tasks-gcal-sync-pkce-verifier';

export class GoogleAuthManager {
    private readonly plugin: GoogleCalendarSyncPlugin;
    private readonly app: App;

    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private tokenExpiry: number | null = null;
    private refreshPromise: Promise<OAuth2Tokens> | null = null;

    constructor(plugin: GoogleCalendarSyncPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    private get clientId(): string {
        return this.plugin.settings.clientId.trim();
    }

    private get redirectUri(): string {
        return this.plugin.settings.oauthRedirectUri.trim();
    }

    private getClientSecret(): string | null {
        const secretName = this.plugin.settings.clientSecretName?.trim();
        if (!secretName) return null;
        return this.app.secretStorage.getSecret(secretName);
    }

    private validateConfiguration(): void {
        if (!this.clientId) {
            throw new Error('OAuth Client ID is not configured.');
        }
        if (!this.redirectUri || !this.redirectUri.startsWith('https://')) {
            throw new Error('OAuth Redirect Bridge URL must be a valid HTTPS URL.');
        }
        if (!this.plugin.settings.clientSecretName) {
            throw new Error('OAuth Client Secret is not configured in SecretStorage.');
        }
        if (!this.getClientSecret()) {
            throw new Error('The selected OAuth Client Secret is empty or unavailable on this device.');
        }
    }

    async authorize(): Promise<void> {
        this.validateConfiguration();
        this.clearTemporaryAuthState();
        this.plugin.mobileAuthInitiated = false;

        const verifier = this.generateCodeVerifier();
        const challenge = await this.generateCodeChallenge(verifier);
        const state = this.generateRandomState();

        // Device-local storage avoids LiveSync moving an in-flight OAuth session
        // between desktop and mobile clients.
        this.app.saveLocalStorage(LOCAL_STATE_KEY, state);
        this.app.saveLocalStorage(LOCAL_VERIFIER_KEY, verifier);

        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: CALENDAR_SCOPE,
            access_type: 'offline',
            prompt: 'consent',
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state
        });

        const authUrl = `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;

        if (Platform.isMobile) {
            this.plugin.mobileAuthInitiated = true;
        }

        window.open(authUrl, '_blank', 'noopener,noreferrer');
        new Notice('Complete Google authentication in your browser. You will be returned to Obsidian automatically.');
    }

    public async handleProtocolCallback(params: Record<string, string>): Promise<void> {
        try {
            if (params.error) {
                throw new Error(`Google authentication error: ${params.error}`);
            }
            if (!params.code || !params.state) {
                throw new Error('Missing OAuth code or state in callback.');
            }

            const savedState = this.app.loadLocalStorage(LOCAL_STATE_KEY) as string | null;
            const verifier = this.app.loadLocalStorage(LOCAL_VERIFIER_KEY) as string | null;

            if (!savedState || savedState !== params.state) {
                throw new Error('Invalid OAuth state. Authentication was cancelled for security.');
            }
            if (!verifier) {
                throw new Error('PKCE verifier is missing. Start authentication again on this device.');
            }

            await this.exchangeAuthorizationCode(params.code, verifier);
            this.plugin.mobileAuthInitiated = false;
        } finally {
            this.clearTemporaryAuthState();
        }
    }

    private async exchangeAuthorizationCode(code: string, verifier: string): Promise<void> {
        this.validateConfiguration();
        const clientSecret = this.getClientSecret()!;

        const response = await requestUrl({
            url: GOOGLE_TOKEN_ENDPOINT,
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: this.clientId,
                client_secret: clientSecret,
                redirect_uri: this.redirectUri,
                grant_type: 'authorization_code',
                code_verifier: verifier
            }).toString()
        });

        if (response.status >= 400 || !response.json?.access_token) {
            throw new Error(`Google token exchange failed (HTTP ${response.status}).`);
        }

        const tokens: OAuth2Tokens = {
            access_token: response.json.access_token,
            refresh_token: response.json.refresh_token,
            scope: response.json.scope ?? CALENDAR_SCOPE,
            token_type: response.json.token_type ?? 'Bearer',
            expiry_date: Date.now() + Number(response.json.expires_in ?? 3600) * 1000
        };

        await this.saveTokens(tokens);
        LogUtils.debug('Google OAuth token exchange completed directly with Google');
    }

    async refreshAccessToken(): Promise<OAuth2Tokens> {
        if (!this.refreshToken) {
            const stored = this.app.secretStorage.getSecret(REFRESH_TOKEN_SECRET_ID);
            if (!stored) throw new Error('No refresh token available.');
            this.refreshToken = stored;
        }

        this.validateConfiguration();
        const clientSecret = this.getClientSecret()!;

        const response = await requestUrl({
            url: GOOGLE_TOKEN_ENDPOINT,
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                refresh_token: this.refreshToken,
                client_id: this.clientId,
                client_secret: clientSecret,
                grant_type: 'refresh_token'
            }).toString()
        });

        if (response.status >= 400 || !response.json?.access_token) {
            throw new Error(`Google token refresh failed (HTTP ${response.status}).`);
        }

        const tokens: OAuth2Tokens = {
            access_token: response.json.access_token,
            refresh_token: this.refreshToken,
            scope: response.json.scope ?? CALENDAR_SCOPE,
            token_type: response.json.token_type ?? 'Bearer',
            expiry_date: Date.now() + Number(response.json.expires_in ?? 3600) * 1000
        };

        await this.saveTokens(tokens);
        return tokens;
    }

    private async saveTokens(tokens: OAuth2Tokens): Promise<void> {
        this.accessToken = tokens.access_token;
        this.refreshToken = tokens.refresh_token ?? this.refreshToken;
        this.tokenExpiry = tokens.expiry_date;

        if (!this.refreshToken) {
            throw new Error('Google did not return a refresh token. Reconnect and grant offline access.');
        }

        // Refresh token is intentionally device-local and never enters data.json / LiveSync.
        this.app.secretStorage.setSecret(REFRESH_TOKEN_SECRET_ID, this.refreshToken);

        // Remove legacy token copies from plugin settings when migrating from upstream.
        if (this.plugin.settings.oauth2Tokens ||
            this.plugin.settings.encryptedOAuth2Tokens ||
            this.plugin.settings.tokensEncrypted) {
            this.plugin.settings.oauth2Tokens = undefined;
            this.plugin.settings.encryptedOAuth2Tokens = undefined;
            this.plugin.settings.tokensEncrypted = false;
            await this.plugin.saveSettings();
        }
    }

    async loadSavedTokens(): Promise<boolean> {
        try {
            const refreshToken = this.app.secretStorage.getSecret(REFRESH_TOKEN_SECRET_ID);
            if (!refreshToken) return false;

            this.refreshToken = refreshToken;
            await this.refreshAccessToken();
            return true;
        } catch (error) {
            LogUtils.error('Failed to restore Google authentication:', error);
            this.accessToken = null;
            this.refreshToken = null;
            this.tokenExpiry = null;
            return false;
        }
    }

    async getValidAccessToken(): Promise<string> {
        if (!this.accessToken || !this.tokenExpiry) {
            const restored = await this.loadSavedTokens();
            if (!restored || !this.accessToken) throw new Error('Not authenticated.');
        }

        // Refresh a minute early to avoid expiry during an API request.
        if (!this.tokenExpiry || Date.now() >= this.tokenExpiry - 60_000) {
            const tokens = await this.deduplicatedRefresh();
            return tokens.access_token;
        }

        return this.accessToken;
    }

    private async deduplicatedRefresh(): Promise<OAuth2Tokens> {
        if (this.refreshPromise) return this.refreshPromise;

        this.refreshPromise = this.refreshAccessToken().finally(() => {
            this.refreshPromise = null;
        });
        return this.refreshPromise;
    }

    async revokeAccess(): Promise<void> {
        const token = this.refreshToken
            ?? this.app.secretStorage.getSecret(REFRESH_TOKEN_SECRET_ID)
            ?? this.accessToken;

        if (token) {
            try {
                await requestUrl({
                    url: GOOGLE_REVOKE_ENDPOINT,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ token }).toString()
                });
            } catch (error) {
                LogUtils.warn('Google token revocation request failed:', error);
            }
        }

        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = null;
        this.app.secretStorage.setSecret(REFRESH_TOKEN_SECRET_ID, '');
        this.clearTemporaryAuthState();

        this.plugin.settings.oauth2Tokens = undefined;
        this.plugin.settings.encryptedOAuth2Tokens = undefined;
        this.plugin.settings.tokensEncrypted = false;
        await this.plugin.saveSettings();
    }

    async cleanup(): Promise<void> {
        // Do not clear PKCE state here. Obsidian/iOS may unload the plugin while
        // the system browser is handling OAuth. The pending state is cleared by
        // a new authorize() call, a completed callback, or revokeAccess().
        this.plugin.mobileAuthInitiated = false;
    }

    isAuthenticated(): boolean {
        return Boolean(
            this.refreshToken ||
            this.app.secretStorage.getSecret(REFRESH_TOKEN_SECRET_ID)
        );
    }

    private clearTemporaryAuthState(): void {
        this.app.saveLocalStorage(LOCAL_STATE_KEY, null);
        this.app.saveLocalStorage(LOCAL_VERIFIER_KEY, null);
    }

    private generateCodeVerifier(): string {
        const bytes = new Uint8Array(64);
        crypto.getRandomValues(bytes);
        return this.base64UrlEncode(bytes);
    }

    private generateRandomState(): string {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        return this.base64UrlEncode(bytes);
    }

    private async generateCodeChallenge(verifier: string): Promise<string> {
        const digest = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(verifier)
        );
        return this.base64UrlEncode(new Uint8Array(digest));
    }

    private base64UrlEncode(bytes: Uint8Array): string {
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }
}
