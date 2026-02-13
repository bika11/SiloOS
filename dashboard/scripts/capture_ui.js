import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(async () => {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set a reasonable viewport
    await page.setViewport({ width: 375, height: 812 }); // iPhone X size

    console.log('Navigating to app...');
    try {
        await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

        console.log('Taking screenshot...');
        // Artifact path
        const artifactPath = 'C:\\Users\\anbdk\\.gemini\\antigravity\\brain\\972e94bb-c3d1-4870-a31e-868c4abd27c1\\ui_screenshot.png';
        await page.screenshot({ path: artifactPath });

        console.log(`Screenshot saved to ${artifactPath}`);

        // Also grab the page title and body text to confirm content
        const title = await page.title();
        const text = await page.$eval('body', el => el.innerText);
        console.log('Page Title:', title);
        console.log('Content Summary:', text.substring(0, 200).replace(/\n/g, ' '));

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
})();
