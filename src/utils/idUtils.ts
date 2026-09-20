/**
 * Generates opaque identifiers for hidden task markers.
 *
 * Task IDs are correlation identifiers, not secrets. Keep them lowercase
 * alphanumeric so existing parser/metadata formats remain compatible.
 */
export class IdUtils {
    private static readonly ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
    private static readonly ID_LENGTH = 16;

    static generateTaskId(): string {
        const cryptoApi = globalThis.crypto;

        if (cryptoApi?.getRandomValues) {
            const bytes = new Uint8Array(this.ID_LENGTH);
            cryptoApi.getRandomValues(bytes);

            let id = '';
            for (const value of bytes) {
                id += this.ALPHABET[value % this.ALPHABET.length];
            }
            return id;
        }

        // Web Crypto is available in supported Obsidian desktop/mobile builds.
        // Keep a non-secret uniqueness fallback for unusual test environments.
        const timestamp = Date.now().toString(36);
        let random = '';
        while (random.length < this.ID_LENGTH) {
            random += Math.random().toString(36).slice(2);
        }

        return (timestamp + random)
            .slice(0, this.ID_LENGTH)
            .padEnd(this.ID_LENGTH, '0');
    }
}
