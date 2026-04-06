import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export function createUploadToStorageTool(
  replicateApiKey: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'upload_to_storage',
    description:
      'Upload a base64-encoded file to Replicate file storage and get a public URL back. Use this after elevenlabs_tts to host audio files before passing them to replicate_predict.',
    schema: z.object({
      audio_base64: z
        .string()
        .describe('Base64-encoded file content (e.g. from elevenlabs_tts).'),
      file_name: z
        .string()
        .describe(
          'Desired filename including extension, e.g. "voiceover.mp3".',
        ),
      content_type: z
        .string()
        .default('audio/mpeg')
        .describe('MIME type of the file. Default "audio/mpeg".'),
    }),
    func: async ({ audio_base64, file_name, content_type }) => {
      try {
        const fileBuffer = Buffer.from(audio_base64, 'base64');

        const formData = new FormData();
        const blob = new Blob([fileBuffer], { type: content_type });
        formData.append('content', blob, file_name);

        const response = await fetch('https://api.replicate.com/v1/files', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${replicateApiKey}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          return JSON.stringify({
            error: `Replicate Files API error ${response.status}: ${errorText}`,
          });
        }

        const result = (await response.json()) as any;

        return JSON.stringify({
          url: result.urls?.get ?? result.url ?? null,
          file_id: result.id ?? null,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  });
}
