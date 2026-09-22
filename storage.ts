// Storage strategies for Keystone's `image` and `file` fields.
// see https://keystonejs.com/docs/config/config#storage-images-and-files
//
// STORAGE_DRIVER picks which one backs a field:
//   - 'local' (default): writes to disk under ./uploads, served by
//     server.ts's static middleware. Good for local dev — nothing to
//     provision, files survive a restart via the docker-compose bind-mount.
//   - 's3': any S3-compatible object store — AWS S3, Cloudflare R2, MinIO —
//     via the AWS SDK. S3_ENDPOINT is what makes this work for more than
//     AWS: set it to your R2 endpoint (https://<account_id>.r2.cloudflarestorage.com)
//     or a local MinIO container; leave it unset and the SDK talks to AWS.

import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { BaseKeystoneTypeInfo, StorageStrategy } from '@keystone-6/core/types'

export type StorageKind = 'images' | 'files'

/** Lifetime of the presigned GET URLs handed to clients for the `s3` driver. */
export const SIGNED_URL_EXPIRY_SECONDS = 3600

const LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR ?? './uploads'

function createLocalStorageStrategy<TypeInfo extends BaseKeystoneTypeInfo>(
  kind: StorageKind,
): StorageStrategy<TypeInfo> {
  const dir = path.join(LOCAL_STORAGE_DIR, kind)

  return {
    async put(key, stream: Readable): Promise<void> {
      await mkdir(dir, { recursive: true })
      const chunks: Buffer[] = []
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer)
      }
      await writeFile(path.join(dir, key), Buffer.concat(chunks))
    },

    async delete(key): Promise<void> {
      await rm(path.join(dir, key), { force: true })
    },

    url(key): string {
      return `/uploads/${kind}/${key}`
    },
  }
}

type S3Config = {
  bucketName: string
  region: string
  accessKeyId?: string
  secretAccessKey?: string
  /** S3-compatible endpoint override — R2, MinIO, or unset for real AWS S3. */
  endpoint?: string
}

/** Read at call time, not module load, so tests and each process pick up their own env. */
function getS3Config(): S3Config {
  const bucketName = process.env.S3_BUCKET_NAME
  const region = process.env.S3_REGION ?? 'auto'

  if (!bucketName) throw new Error('S3_BUCKET_NAME is required when STORAGE_DRIVER=s3')

  return {
    bucketName,
    region,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    endpoint: process.env.S3_ENDPOINT,
  }
}

let cachedClient: S3Client | undefined

function getClient({ region, accessKeyId, secretAccessKey, endpoint }: S3Config): S3Client {
  cachedClient ??= new S3Client({
    region,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    // forcePathStyle: R2/MinIO serve `host/bucket/key`, not AWS's virtual-host
    // `bucket.host/key` addressing.
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  })
  return cachedClient
}

function createS3StorageStrategy<TypeInfo extends BaseKeystoneTypeInfo>(
  kind: StorageKind,
): StorageStrategy<TypeInfo> {
  return {
    async put(key, stream: Readable, meta): Promise<void> {
      const config = getS3Config()
      // `Upload`, not PutObjectCommand: the input is a stream of unknown
      // length, which PutObject can't take without buffering it in memory.
      await new Upload({
        client: getClient(config),
        params: {
          Bucket: config.bucketName,
          Key: `${kind}/${key}`,
          Body: stream,
          ContentType: meta.contentType,
        },
      }).done()
    },

    async delete(key): Promise<void> {
      const config = getS3Config()
      await getClient(config).send(
        new DeleteObjectCommand({ Bucket: config.bucketName, Key: `${kind}/${key}` }),
      )
    },

    url(key): Promise<string> {
      const config = getS3Config()
      // Presigned GET: uploads aren't public by default.
      return getSignedUrl(
        getClient(config),
        new GetObjectCommand({ Bucket: config.bucketName, Key: `${kind}/${key}` }),
        { expiresIn: SIGNED_URL_EXPIRY_SECONDS },
      )
    },
  }
}

export function createStorageStrategy<TypeInfo extends BaseKeystoneTypeInfo>(
  kind: StorageKind,
): StorageStrategy<TypeInfo> {
  const driver = process.env.STORAGE_DRIVER ?? 'local'
  return driver === 's3' ? createS3StorageStrategy(kind) : createLocalStorageStrategy(kind)
}
