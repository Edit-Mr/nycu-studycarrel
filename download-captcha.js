import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CAPTCHA_API = 'https://idm.nycu.ust.edu.tw/ajax/captcha_refresh/';
const BASE_URL = 'https://idm.nycu.ust.edu.tw';
const OUTPUT_DIR = path.join(__dirname, 'captcha_images');

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function downloadCaptcha(index) {
    try {
        // Fetch the captcha metadata
        const response = await fetch(CAPTCHA_API);
        const data = await response.json();
        
        console.log(`[${index}] Fetched metadata:`, data);
        
        // Download the image
        const imageUrl = BASE_URL + data.img;
        const imageResponse = await fetch(imageUrl);
        
        if (!imageResponse.ok) {
            throw new Error(`Failed to download image: ${imageResponse.statusText}`);
        }
        
        const buffer = await imageResponse.arrayBuffer();
        const filename = `captcha_${String(index).padStart(3, '0')}_${data.hashkey}.png`;
        const filepath = path.join(OUTPUT_DIR, filename);
        
        fs.writeFileSync(filepath, Buffer.from(buffer));
        console.log(`[${index}] Downloaded: ${filename}`);
        
        return { success: true, filename, hashkey: data.hashkey };
    } catch (error) {
        console.error(`[${index}] Error:`, error.message);
        return { success: false, error: error.message };
    }
}

async function downloadMultipleCaptchas(count) {
    console.log(`Starting download of ${count} captcha images...`);
    const results = [];
    
    for (let i = 1; i <= count; i++) {
        const result = await downloadCaptcha(i);
        results.push(result);
        
        // Add a small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n=== Download Complete ===`);
    console.log(`Total: ${count}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${failed}`);
    console.log(`Images saved to: ${OUTPUT_DIR}`);
    
    return results;
}

// Download 100 captcha images
downloadMultipleCaptchas(100);
