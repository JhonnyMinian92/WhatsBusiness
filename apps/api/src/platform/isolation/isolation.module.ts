import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { PostgresTenantJobRecordReader } from "./postgres-tenant-job-record.reader.js";
import {
  TENANT_JOB_RECORD_READER,
  TenantJobContextResolver,
  TenantJobExecutor,
} from "./tenant-job-context.js";

@Module({
  imports: [DatabaseModule],
  providers: [
    PostgresTenantJobRecordReader,
    {
      provide: TENANT_JOB_RECORD_READER,
      useExisting: PostgresTenantJobRecordReader,
    },
    TenantJobContextResolver,
    TenantJobExecutor,
  ],
  exports: [TenantJobContextResolver, TenantJobExecutor],
})
export class IsolationModule {}
