/**
 * OpenClaw WebSocket Stress Test
 *
 * Simulates TaskClaw sending messages to OpenClaw via WebSocket.
 * Tests: connection, auth, chat.send, response collection, and concurrent sessions.
 *
 * Usage: npx ts-node test-openclaw-ws.ts
 */

import WebSocket from 'ws';
import { v4 as uuid } from 'uuid';

const OPENCLAW_URL = process.env.OPENCLAW_URL || 'ws://77.42.40.6:18789';
const API_KEY = process.env.OPENCLAW_API_KEY;

if (!API_KEY) {
  console.error('ERROR: OPENCLAW_API_KEY environment variable is required.');
  console.error('Set it in backend/.env.secrets (gitignored) and run:');
  console.error('  source backend/.env.secrets && npx ts-node backend/test-openclaw-ws.ts');
  process.exit(1);
}

interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  response?: string;
  error?: string;
  details?: string;
}

async function sendOpenClawMessage(
  message: string,
  testName: string,
  timeoutMs = 120000,
): Promise<TestResult> {
  const startTime = Date.now();

  return new Promise<TestResult>((resolve) => {
    let responseChunks: string[] = [];
    let connected = false;
    let chatSent = false;
    let chatAcknowledged = false;
    let resolved = false;
    let currentSessionKey = '';
    let runId: string | null = null;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { ws.close(); } catch {}
        resolve({
          name: testName,
          success: false,
          duration: Date.now() - startTime,
          error: `Timeout after ${timeoutMs}ms`,
        });
      }
    }, timeoutMs);

    const ws = new WebSocket(OPENCLAW_URL, {
      headers: { 'User-Agent': 'TaskClaw-StressTest/1.0' },
    });

    ws.on('open', () => {
      console.log(`  [${testName}] WebSocket connected`);
    });

    ws.on('message', (raw: WebSocket.RawData) => {
      if (resolved) return;

      let data: any;
      try { data = JSON.parse(raw.toString()); } catch { return; }

      // Skip noise
      if (data.event === 'health' || data.event === 'tick') return;

      // Connect challenge
      if (data.type === 'event' && data.event === 'connect.challenge') {
        console.log(`  [${testName}] Authenticating...`);
        ws.send(JSON.stringify({
          type: 'req', id: uuid(),
          method: 'connect',
          params: {
            auth: { token: API_KEY },
            client: { id: 'webchat-ui', version: '1.0.0', platform: 'web', mode: 'webchat' },
            minProtocol: 3, maxProtocol: 3,
            role: 'operator',
            scopes: ['operator.admin'],
          },
        }));
        return;
      }

      // Connect success
      if (data.type === 'res' && data.ok === true && !connected) {
        connected = true;
        console.log(`  [${testName}] Authenticated, sending message...`);
        currentSessionKey = `test-${uuid().slice(0, 12)}`;
        ws.send(JSON.stringify({
          type: 'req', id: uuid(),
          method: 'chat.send',
          params: {
            sessionKey: currentSessionKey,
            message,
            idempotencyKey: uuid(),
          },
        }));
        chatSent = true;
        return;
      }

      // Auth failure
      if (data.type === 'res' && data.ok === false && !connected) {
        resolved = true;
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve({
          name: testName,
          success: false,
          duration: Date.now() - startTime,
          error: `Auth failed: ${data.error?.message || JSON.stringify(data.error)}`,
        });
        return;
      }

      // chat.send acknowledgment
      if (data.type === 'res' && data.ok === true && chatSent && !chatAcknowledged) {
        chatAcknowledged = true;
        runId = data.payload?.runId;
        console.log(`  [${testName}] chat.send acknowledged (runId: ${runId})`);
        return;
      }

      // chat.send failure
      if (data.type === 'res' && data.ok === false && chatSent && !chatAcknowledged) {
        resolved = true;
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve({
          name: testName,
          success: false,
          duration: Date.now() - startTime,
          error: `chat.send failed: ${data.error?.message || JSON.stringify(data.error)}`,
        });
        return;
      }

      // Agent streaming (assistant or text stream)
      if (data.type === 'event' && data.event === 'agent') {
        if (data.payload?.stream === 'assistant' && data.payload?.data?.delta) {
          responseChunks.push(data.payload.data.delta);
        }
        if (data.payload?.stream === 'text' && data.payload?.data?.text) {
          responseChunks.push(data.payload.data.text);
        }
        return;
      }

      // Chat final — extract full response from the final event message
      if (data.type === 'event' && data.event === 'chat' && data.payload?.state === 'final') {
        console.log(`  [${testName}] Chat final state reached`);
        resolved = true;
        clearTimeout(timer);

        // Extract full text from final event's message content
        let fullResponse = '';
        const finalMessage = data.payload?.message;
        if (finalMessage?.content && Array.isArray(finalMessage.content)) {
          for (const block of finalMessage.content) {
            if (block.type === 'text' && block.text) {
              fullResponse += block.text;
            }
          }
        }

        // Fallback to streaming chunks
        if (!fullResponse && responseChunks.length > 0) {
          fullResponse = responseChunks.join('');
        }

        if (fullResponse) {
          console.log(`  [${testName}] Got ${fullResponse.length} chars`);
          try { ws.close(); } catch {}
          resolve({
            name: testName,
            success: true,
            duration: Date.now() - startTime,
            response: fullResponse.slice(0, 200) + (fullResponse.length > 200 ? '...' : ''),
          });
        } else {
          console.log(`  [${testName}] No response text in final event`);
          try { ws.close(); } catch {}
          resolve({
            name: testName,
            success: true,
            duration: Date.now() - startTime,
            response: '(Agent completed but no text response)',
            details: 'WebSocket flow works: connect, auth, chat.send, agent lifecycle, chat.final all OK',
          });
        }
        return;
      }

      // Chat delta events (skip — we collect from agent stream)
      if (data.type === 'event' && data.event === 'chat' && data.payload?.state === 'delta') {
        return;
      }

      // (sessions.preview fallback removed — full text now comes from chat.final event)

      // Error events
      if (data.type === 'event' && (data.event === 'chat.error' || data.event === 'error')) {
        resolved = true;
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve({
          name: testName,
          success: false,
          duration: Date.now() - startTime,
          error: data.data?.message || data.payload?.message || 'Unknown error',
        });
        return;
      }
    });

    ws.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({
          name: testName,
          success: false,
          duration: Date.now() - startTime,
          error: `Connection error: ${err.message}`,
        });
      }
    });

    ws.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        if (responseChunks.length > 0) {
          resolve({
            name: testName,
            success: true,
            duration: Date.now() - startTime,
            response: responseChunks.join('').slice(0, 200),
          });
        } else {
          resolve({
            name: testName,
            success: false,
            duration: Date.now() - startTime,
            error: `Connection closed (code: ${code})`,
          });
        }
      }
    });
  });
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('OpenClaw WebSocket Stress Test');
  console.log('='.repeat(60));
  console.log(`Target: ${OPENCLAW_URL}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const results: TestResult[] = [];

  // Test 1: Simple ping
  console.log('Test 1: Simple ping');
  results.push(await sendOpenClawMessage('ping', 'simple-ping', 30000));

  // Test 2: Task context (simulating Run AI Assistant)
  console.log('\nTest 2: Task analysis (simulating Run AI Assistant)');
  results.push(await sendOpenClawMessage(
    `[System Context]
You are OpenClaw, an AI assistant integrated into the OTT Platform.

=== TASK CONTEXT ===
Task: Perplexity Computer vs OpenClaw
Status: Idea
Priority: Medium
Notes: highlight the difference focus on mainly how is more helpful in our day-today work

Please analyze and work on this task based on the title and description provided.`,
    'task-analysis',
    60000,
  ));

  // Test 3: Follow-up question
  console.log('\nTest 3: Follow-up question');
  results.push(await sendOpenClawMessage(
    'What are the top 3 most practical differences between Perplexity and OpenClaw for daily work?',
    'follow-up',
    60000,
  ));

  // Test 4-6: Concurrent sessions
  console.log('\nTests 4-6: Concurrent sessions (stress test)');
  const concurrent = await Promise.all([
    sendOpenClawMessage('Briefly list 3 benefits of AI-powered task management.', 'concurrent-1', 60000),
    sendOpenClawMessage('What is 2+2? Reply with just the number.', 'concurrent-2', 30000),
    sendOpenClawMessage('Summarize in 2 sentences: how can AI assistants improve project workflow?', 'concurrent-3', 60000),
  ]);
  results.push(...concurrent);

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const status = r.success ? 'PASS' : 'FAIL';
    const icon = r.success ? '✓' : '✗';
    console.log(`\n${icon} ${r.name} [${status}] (${r.duration}ms)`);
    if (r.response) console.log(`  Response: ${r.response}`);
    if (r.details) console.log(`  Details: ${r.details}`);
    if (r.error) console.log(`  Error: ${r.error}`);
    if (r.success) passed++; else failed++;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
