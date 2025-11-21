import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../.env.local');

if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    console.warn('Warning: .env.local file not found at', envPath);
}

const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error('Error: GOOGLE_API_KEY or GEMINI_API_KEY not found in environment variables.');
    process.exit(1);
}

async function listModels() {
    console.log('Fetching available models...');
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }
        const data = await response.json();
        
        if (data.models) {
            console.log('\nAvailable Models:');
            const models = data.models
                .filter((m: any) => m.name.includes('gemini'))
                .map((m: any) => ({
                    name: m.name,
                    displayName: m.displayName,
                    supportedGenerationMethods: m.supportedGenerationMethods
                }));
            
            models.forEach((m: any) => {
                console.log(`- ${m.name.replace('models/', '')} (${m.displayName})`);
                // console.log(`  Methods: ${m.supportedGenerationMethods.join(', ')}`);
            });

            // Recommend a model
            const flashModels = models.filter((m: any) => m.name.includes('flash'));
            const proModels = models.filter((m: any) => m.name.includes('pro'));
            
            console.log('\n--- Recommendation ---');
            if (flashModels.length > 0) {
                console.log('Best Flash Model (Fast/Cost-effective):', flashModels[0].name.replace('models/', ''));
            }
            if (proModels.length > 0) {
                console.log('Best Pro Model (High Intelligence):', proModels[0].name.replace('models/', ''));
            }
        } else {
            console.log('No models found in response:', data);
        }
    } catch (error) {
        console.error('Failed to fetch models:', error);
    }
}

listModels();
