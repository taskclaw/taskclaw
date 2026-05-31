import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const STORAGE_BUCKETS = ['knowledge-attachments', 'skill-attachments'];

/**
 * S3-compatible object storage (Epic 3) — replaces Supabase Storage with MinIO.
 *
 * Mirrors the small surface the app used: upload / getPublicUrl / download / remove.
 * Targets MinIO via path-style addressing; works against real S3 by changing env.
 *
 * Env: S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY,
 *      S3_PUBLIC_URL (base used to build public object URLs),
 *      S3_FORCE_PATH_STYLE (default true for MinIO).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly publicBase: string;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('S3_ENDPOINT') ?? 'http://minio:9000';
    this.publicBase =
      this.config.get<string>('S3_PUBLIC_URL') ?? endpoint;
    this.client = new S3Client({
      endpoint,
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY') ?? 'minioadmin',
        secretAccessKey:
          this.config.get<string>('S3_SECRET_KEY') ?? 'minioadmin',
      },
      forcePathStyle:
        (this.config.get<string>('S3_FORCE_PATH_STYLE') ?? 'true') !== 'false',
    });
  }

  /** Ensure the known buckets exist (replaces the Supabase entrypoint bucket bootstrap). */
  async onModuleInit(): Promise<void> {
    for (const bucket of STORAGE_BUCKETS) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
          // public-read policy so getPublicUrl works like Supabase public buckets
          await this.client.send(
            new PutBucketPolicyCommand({
              Bucket: bucket,
              Policy: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                  {
                    Effect: 'Allow',
                    Principal: { AWS: ['*'] },
                    Action: ['s3:GetObject'],
                    Resource: [`arn:aws:s3:::${bucket}/*`],
                  },
                ],
              }),
            }),
          );
          this.logger.log(`Created storage bucket: ${bucket}`);
        } catch (e: any) {
          this.logger.warn(
            `Could not ensure bucket ${bucket}: ${e?.message ?? e}`,
          );
        }
      }
    }
  }

  async upload(
    bucket: string,
    path: string,
    body: Buffer,
    contentType?: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: path,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Stable public URL (buckets are public-read). */
  getPublicUrl(bucket: string, path: string): string {
    const base = this.publicBase.replace(/\/$/, '');
    return `${base}/${bucket}/${path}`;
  }

  /** Presigned GET URL (when public access is not desired). */
  async getSignedUrl(
    bucket: string,
    path: string,
    expiresIn = 3600,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: bucket, Key: path }),
      { expiresIn },
    );
  }

  async download(bucket: string, path: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: path }),
    );
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    if (!paths.length) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: paths.map((Key) => ({ Key })) },
      }),
    );
  }
}
