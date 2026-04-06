import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export function createReplicatePredictTool(
  apiKey: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'replicate_predict',
    description:
      'Start a Replicate SadTalker prediction to generate a talking-head lip-sync video from an audio file and a face image. Cost: ~$0.05/video (110x cheaper than fabric-1.0). Returns a prediction_id to poll with replicate_poll.',
    schema: z.object({
      audio_url: z
        .string()
        .describe('Public URL of the audio file (from upload_to_storage or ElevenLabs).'),
      image_url: z
        .string()
        .describe('Public URL of the face image to animate.'),
      still_mode: z
        .boolean()
        .optional()
        .default(true)
        .describe('Still mode: fewer head movements. Default true.'),
      use_enhancer: z
        .boolean()
        .optional()
        .default(false)
        .describe('Use GFPGAN face enhancer for higher quality. Slower. Default false.'),
    }),
    func: async ({ audio_url, image_url, still_mode, use_enhancer }) => {
      try {
        const response = await fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            version: 'a519cc0cfebaaeade068b23899165a11ec76aaa1d2b313d40d214f204ec957a3',
            input: {
              source_image: image_url,
              driven_audio: audio_url,
              preprocess: 'crop',
              still_mode: still_mode ?? true,
              use_enhancer: use_enhancer ?? false,
              size_of_image: 256,
              pose_style: 0,
              facerender: 'facevid2vid',
              expression_scale: 1.0,
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return JSON.stringify({
            error: `Replicate API error ${response.status}: ${errorText}`,
          });
        }

        const result = (await response.json()) as any;

        return JSON.stringify({
          prediction_id: result.id ?? null,
          status: result.status ?? 'unknown',
          urls: result.urls ?? null,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  });
}
