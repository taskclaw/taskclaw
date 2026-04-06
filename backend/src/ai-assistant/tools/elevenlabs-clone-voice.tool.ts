import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export function createElevenLabsCloneVoiceTool(
  apiKey: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'elevenlabs_clone_voice',
    description:
      'Clone a voice using ElevenLabs Instant Voice Cloning. Provide a public URL to an audio sample (MP3/WAV, 30s-3min recommended). Returns the cloned voice_id to use with elevenlabs_tts. Requires the create_instant_voice_clone permission on the API key.',
    schema: z.object({
      name: z.string().describe('Name for the cloned voice (e.g., "Fernando")'),
      description: z
        .string()
        .optional()
        .describe('Optional description of the voice'),
      audio_url: z
        .string()
        .describe(
          'Public URL of the voice sample audio file (MP3 or WAV). Will be fetched and uploaded to ElevenLabs.',
        ),
    }),
    func: async ({ name, description, audio_url }) => {
      try {
        // Fetch the audio file from the URL
        const audioResponse = await fetch(audio_url, {
          headers: {
            // If it's a Replicate file URL, add auth
            ...(audio_url.includes('api.replicate.com')
              ? { Authorization: `Bearer ${apiKey}` }
              : {}),
          },
        });

        if (!audioResponse.ok) {
          return JSON.stringify({
            error: `Failed to fetch audio from URL: ${audioResponse.status} ${audioResponse.statusText}`,
          });
        }

        const audioBuffer = await audioResponse.arrayBuffer();
        const audioBytes = Buffer.from(audioBuffer);

        // Build multipart form data manually
        const boundary = `----ElevenLabsBoundary${Date.now()}`;
        const CRLF = '\r\n';

        const namePart =
          `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="name"${CRLF}${CRLF}` +
          `${name}${CRLF}`;

        const descPart = description
          ? `--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="description"${CRLF}${CRLF}` +
            `${description}${CRLF}`
          : '';

        // Detect content type from URL
        const isWav =
          audio_url.toLowerCase().includes('.wav') ||
          audio_url.toLowerCase().includes('wav');
        const contentType = isWav ? 'audio/wav' : 'audio/mpeg';
        const ext = isWav ? 'wav' : 'mp3';

        const fileHeader =
          `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="files"; filename="voice_sample.${ext}"${CRLF}` +
          `Content-Type: ${contentType}${CRLF}${CRLF}`;

        const footer = `${CRLF}--${boundary}--${CRLF}`;

        const body = Buffer.concat([
          Buffer.from(namePart),
          Buffer.from(descPart),
          Buffer.from(fileHeader),
          audioBytes,
          Buffer.from(footer),
        ]);

        const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body,
        });

        if (!response.ok) {
          const errorText = await response.text();
          // Check for permission error specifically
          if (
            response.status === 401 ||
            errorText.includes('missing_permissions') ||
            errorText.includes('create_instant_voice_clone')
          ) {
            return JSON.stringify({
              error:
                'Voice cloning requires the create_instant_voice_clone permission. Please regenerate your ElevenLabs API key with this permission enabled at elevenlabs.io/app/settings/api-keys.',
              status: response.status,
            });
          }
          return JSON.stringify({
            error: `ElevenLabs voice clone error ${response.status}: ${errorText}`,
          });
        }

        const result = (await response.json()) as { voice_id: string };
        return JSON.stringify({
          voice_id: result.voice_id,
          name,
          message: `Voice "${name}" cloned successfully. Use voice_id "${result.voice_id}" with elevenlabs_tts.`,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  });
}
