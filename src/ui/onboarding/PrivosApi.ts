import fs from 'fs';
import path from 'path';

/**
 * Uploads a file (or raw string content as file) to a PrivOS room via REST API.
 * Uses X-User-Id and X-Auth-Token for authentication.
 * 
 * @param content The file content as a Buffer or string.
 * @param filename The name of the file to save as.
 * @param mimeType The MIME type of the file.
 * @param roomId The target room ID in PrivOS.
 * @returns The message object returned by PrivOS, which includes the file URL.
 */
export async function uploadFileToPrivos(
    content: Buffer | string,
    filename: string,
    mimeType: string,
    roomId: string
): Promise<any> {
    const privosUrl = process.env.PRIVOS_URL;
    const userId = process.env.PRIVOS_USER_ID;
    const authToken = process.env.PRIVOS_AUTH_TOKEN;

    if (!privosUrl || !userId || !authToken) {
        throw new Error('Missing PRIVOS_URL, PRIVOS_USER_ID, or PRIVOS_AUTH_TOKEN in environment variables.');
    }

    const form = new FormData();
    const blob = new Blob([typeof content === 'string' ? content : new Uint8Array(content)], { type: mimeType });
    form.set('file', blob, filename);
    form.set('msg', `Tài liệu tải lên: ${filename}`);

    const uploadUrl = `${privosUrl}/api/v1/rooms.upload/${roomId}`;

    // Node.js >= 18 natively supports fetch and FormData
    const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'X-User-Id': userId,
            'X-Auth-Token': authToken,
            // fetch will automatically generate Content-Type: multipart/form-data with boundary
        },
        body: form as any
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Upload failed with status ${res.status}: ${errText}`);
    }

    return await res.json();
}
