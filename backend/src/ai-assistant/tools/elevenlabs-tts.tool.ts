import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export function createElevenLabsTtsTool(apiKey: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'elevenlabs_tts',
    description:
      'Convert text to speech using ElevenLabs. Returns base64-encoded audio (MP3) along with content type and character count. Use this before upload_to_storage to generate audio.',
    schema: z.object({
      text: z.string().describe('The text to convert to speech.'),
      voice_id: z
        .string()
        .default('21m00Tcm4TlvDq8ikWAM')
        .describe(
          'ElevenLabs voice ID. Defaults to Rachel (21m00Tcm4TlvDq8ikWAM).',
        ),
      stability: z
        .number()
        .min(0)
        .max(1)
        .default(0.5)
        .describe('Voice stability (0-1). Default 0.5.'),
      similarity_boost: z
        .number()
        .min(0)
        .max(1)
        .default(0.75)
        .describe('Voice similarity boost (0-1). Default 0.75.'),
      style: z
        .number()
        .min(0)
        .max(1)
        .default(0)
        .describe('Voice style exaggeration (0-1). Default 0.'),
    }),
    func: async ({ text, voice_id, stability, similarity_boost, style }) => {
      try {
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': apiKey,
              'Content-Type': 'application/json',
              Accept: 'audio/mpeg',
            },
            body: JSON.stringify({
              text,
              model_id: 'eleven_multilingual_v2',
              voice_settings: {
                stability,
                similarity_boost,
                style,
              },
            }),
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          return JSON.stringify({
            error: `ElevenLabs API error ${response.status}: ${errorText}`,
          });
        }

        const audioBuffer = await response.arrayBuffer();
        const audio_base64 = Buffer.from(audioBuffer).toString('base64');

        return JSON.stringify({
          audio_base64,
          content_type: 'audio/mpeg',
          char_count: text.length,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  });
}
