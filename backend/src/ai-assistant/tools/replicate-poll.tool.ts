import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export function createReplicatePollTool(apiKey: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'replicate_poll',
    description:
      'Poll the status of a Replicate prediction by its ID. Call this repeatedly after replicate_predict until status is "succeeded" or "failed". When succeeded, output contains the video URL (string for SadTalker, array[0] for other models).',
    schema: z.object({
      prediction_id: z
        .string()
        .describe('The prediction ID returned by replicate_predict.'),
    }),
    func: async ({ prediction_id }) => {
      try {
        const response = await fetch(
          `https://api.replicate.com/v1/predictions/${prediction_id}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          return JSON.stringify({
            error: `Replicate API error ${response.status}: ${errorText}`,
          });
        }

        const result = (await response.json()) as any;

        return JSON.stringify({
          status: result.status ?? 'unknown',
          output: result.output ?? null,
          error: result.error ?? null,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  });
}
