import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly dimensions: number;
  private readonly baseURL = 'https://openrouter.ai/api/v1';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENROUTER_API_KEY') || '';
    this.modelName =
      this.configService.get<string>('EMBEDDING_MODEL') ||
      'openai/text-embedding-3-small';
    this.dimensions = parseInt(
      this.configService.get<string>('VECTOR_DIMENSIONS') || '1536',
      10,
    );

    if (!this.apiKey) {
      this.logger.warn(
        'OPENROUTER_API_KEY is not set. Embedding generation will be disabled.',
      );
    } else {
      this.logger.log(
        `Embedding Service initialized with model: ${this.modelName} (${this.dimensions} dimensions)`,
      );
    }
  }

  /**
   * Generate embedding vector for the given text using OpenRouter API
   * @param text The text to generate embedding for
   * @param retries Number of retry attempts on failure (default: 3)
   * @returns Promise<number[]> The embedding vector
   */
  async generateEmbedding(text: string, retries = 3): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY is not configured. Cannot generate embeddings.',
      );
    }

    if (!text || text.trim().length === 0) {
      this.logger.warn('Empty text provided for embedding generation');
      return new Array(this.dimensions).fill(0); // Return zero vector for empty text
    }

    // Truncate text if too long (most models have ~8k token limit)
    const truncatedText = text.length > 8000 ? text.substring(0, 8000) : text;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.logger.debug(
          `Generating embedding for text (length: ${truncatedText.length}, attempt: ${attempt}/${retries})`,
        );

        const response = await fetch(`${this.baseURL}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://microlaunch.net',
            'X-Title': 'Microfactory Scaffold',
          },
          body: JSON.stringify({
            model: this.modelName,
            input: truncatedText,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `OpenRouter API error (${response.status}): ${errorText}`,
          );
        }

        const data: EmbeddingResponse = await response.json();

        if (!data.data || data.data.length === 0) {
          throw new Error('No embedding data returned from API');
        }

        const embedding = data.data[0].embedding;

        // Validate embedding dimensions
        if (embedding.length !== this.dimensions) {
          this.logger.warn(
            `Expected ${this.dimensions} dimensions, got ${embedding.length}. This may cause issues.`,
          );
        }

        this.logger.debug(
          `Successfully generated embedding (${embedding.length} dimensions, ${data.usage.total_tokens} tokens used)`,
        );

        return embedding;
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `Embedding generation attempt ${attempt}/${retries} failed: ${error.message}`,
        );

        if (attempt < retries) {
          // Exponential backoff: 1s, 2s, 4s
          const backoffMs = Math.pow(2, attempt - 1) * 1000;
          this.logger.debug(`Retrying in ${backoffMs}ms...`);
          await this.sleep(backoffMs);
        }
      }
    }

    // All retries exhausted
    this.logger.error(
      `Failed to generate embedding after ${retries} attempts: ${lastError?.message}`,
    );
    throw new Error(`Embedding generation failed: ${lastError?.message}`);
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param texts Array of texts to generate embeddings for
   * @param batchSize Number of texts to process per API call (default: 10)
   * @returns Promise<number[][]> Array of embedding vectors
   */
  async generateEmbeddingsBatch(
    texts: string[],
    batchSize = 10,
  ): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY is not configured. Cannot generate embeddings.',
      );
    }

    const results: number[][] = [];

    // Process in batches to avoid rate limits
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      this.logger.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)} (${batch.length} items)`,
      );

      const batchPromises = batch.map((text) => this.generateEmbedding(text));
      const batchResults = await Promise.all(batchPromises);

      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + batchSize < texts.length) {
        await this.sleep(500); // 500ms delay between batches
      }
    }

    return results;
  }

  /**
   * Check if embedding service is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get the current embedding model configuration
   */
  getConfig() {
    return {
      model: this.modelName,
      dimensions: this.dimensions,
      configured: this.isConfigured(),
    };
  }

  /**
   * Helper function for sleep/delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
