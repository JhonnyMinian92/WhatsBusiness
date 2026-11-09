import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { PostgresTenantJobRecordReader } from "./postgres-tenant-job-record.reader.js";
import { PostgresTenantJobRecordWriter } from "./postgres-tenant-job-record.writer.js";
import { TenantScopedCache, CACHE_STORE, type CacheStore } from "./tenant-scoped-cache.js";
import {
  TenantScopedObjectStorage,
  OBJECT_STORAGE,
  type ObjectStorage,
} from "./tenant-scoped-object-storage.js";
import {
  TENANT_JOB_RECORD_READER,
  TenantJobContextResolver,
  TenantJobExecutor,
} from "./tenant-job-context.js";
import { S3CompatibleObjectStorage } from "./infrastructure/s3-compatible-object-storage.js";
import { ValkeyCacheStore } from "./infrastructure/valkey-cache-store.js";

@Module({
  imports: [DatabaseModule],
  providers: [
    PostgresTenantJobRecordReader,
    PostgresTenantJobRecordWriter,
    {
      provide: TENANT_JOB_RECORD_READER,
      useExisting: PostgresTenantJobRecordReader,
    },
    {
      provide: CACHE_STORE,
      useFactory: (): CacheStore => ValkeyCacheStore.fromEnvironment(process.env),
    },
    {
      provide: TenantScopedCache,
      useFactory: (store: CacheStore): TenantScopedCache => new TenantScopedCache(store),
      inject: [CACHE_STORE],
    },
    {
      provide: OBJECT_STORAGE,
      useFactory: (): ObjectStorage => S3CompatibleObjectStorage.fromEnvironment(process.env),
    },
    {
      provide: TenantScopedObjectStorage,
      useFactory: (storage: ObjectStorage): TenantScopedObjectStorage =>
        new TenantScopedObjectStorage(storage),
      inject: [OBJECT_STORAGE],
    },
    TenantJobContextResolver,
    TenantJobExecutor,
  ],
  exports: [
    TenantJobContextResolver,
    TenantJobExecutor,
    PostgresTenantJobRecordWriter,
    TenantScopedCache,
    TenantScopedObjectStorage,
  ],
})
export class IsolationModule {}
