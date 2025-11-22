/**
 * Test the enhanced chatbot search capabilities
 * 
 * This script verifies that the searchPhotos tool can handle:
 * - Jersey number searches
 * - Lighting filters
 * - Color temperature filters
 * - Time of day filters
 * - Composition filters
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const API_URL = 'http://localhost:5173/api/chat';

async function testChatbot(message: string) {
  console.log(`\n🧪 Testing: "${message}"`);
  console.log('─'.repeat(60));

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: message
          }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error:', error);
      return;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let toolCalls: any[] = [];

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('0:')) {
            // Text chunk
            const text = line.slice(2).trim();
            if (text) {
              fullResponse += text;
            }
          } else if (line.startsWith('9:')) {
            // Tool invocation
            try {
              const data = JSON.parse(line.slice(2));
              if (data.toolInvocations) {
                toolCalls = data.toolInvocations;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    }

    console.log('✅ Response:', fullResponse || '(streaming response)');
    
    if (toolCalls.length > 0) {
      console.log('\n🔧 Tool Calls:');
      toolCalls.forEach((call, i) => {
        console.log(`  ${i + 1}. ${call.toolName}`);
        if (call.args) {
          console.log('     Args:', JSON.stringify(call.args, null, 2));
        }
        if (call.result?.photos) {
          console.log(`     ✅ Found ${call.result.photos.length} photos`);
        }
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

async function runTests() {
  console.log('\n🚀 Testing Enhanced Chatbot Search Capabilities\n');

  // Test 1: Jersey number search
  await testChatbot('show me photos of player #1');

  // Test 2: Golden hour search
  await testChatbot('find golden hour volleyball photos');

  // Test 3: Lighting search
  await testChatbot('show me photos with dramatic lighting');

  // Test 4: Composition search
  await testChatbot('find photos using rule of thirds');

  // Test 5: Combined search
  await testChatbot('show me backlit spikes at golden hour');

  console.log('\n✅ All tests complete!\n');
}

runTests().catch(console.error);
