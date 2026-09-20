/**
 * Cross-platform task ID generation for Obsidian desktop and mobile.
 *
 * Task IDs are synchronization identifiers, not secrets. They still use the
 * Web Crypto API so collision resistance does not depend on Math.random().
 */
export class IdUtils {
    private static readonly CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
    private static readonly ID_LENGTH = 16;

    static generateTimeBasedId(): string {
        const timestamp = Date.now().toString(36);
        const suffixLength = Math.max(this.ID_LENGTH - timestamp.length, 6);

        const cryptoApi = globalThis.crypto;
        if (!cryptoApi?.getRandomValues) {
            throw new Error('Secure random generation is unavailable on this device');
        }

        const randomValues = new Uint8Array(suffixLength);
        cryptoApi.getRandomValues(randomValues);

        let suffix = '';
        for (const value of randomValues) {
            suffix += this.CHARS[value % this.CHARS.length];
        }

        return (timestamp + suffix).slice(0, this.ID_LENGTH);
    }
}
