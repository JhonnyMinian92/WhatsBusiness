import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { OidcAuthGuard } from "../identity/oidc-auth.guard.js";
import {
  requireTenantAccessContext,
  type TenantAuthenticatedRequest,
} from "../identity/tenant-context.guard.js";
import { RequireTenantPermission } from "../identity/authorization/authorization.guard.js";
import {
  TENANT_JOB_REPLAY_PURPOSE,
  TenantJobReplayService,
  type TenantJobReplayReasonCode,
} from "./application/tenant-job-replay.service.js";

interface RequestReplayBody {
  readonly reasonCode: TenantJobReplayReasonCode;
  readonly idempotencyKey: string;
}

interface DecideReplayBody {
  readonly decision: "approved" | "rejected";
}

@Controller("v1/tenants/:tenantId/jobs")
@UseGuards(OidcAuthGuard)
export class TenantJobReplayController {
  constructor(private readonly replays: TenantJobReplayService) {}

  @Post(":jobId/replay-requests")
  @RequireTenantPermission("jobs.replay.request", TENANT_JOB_REPLAY_PURPOSE)
  requestReplay(
    @Param("jobId") jobId: string,
    @Body() body: RequestReplayBody,
    @Req() request: TenantAuthenticatedRequest,
  ) {
    this.assertUuid(jobId, "jobId");
    if (
      !body
      || typeof body.reasonCode !== "string"
      || typeof body.idempotencyKey !== "string"
    ) {
      throw new BadRequestException("reasonCode and idempotencyKey are required.");
    }
    return this.replays.requestReplay({
      subject: requireTenantAccessContext(request),
      sourceJobId: jobId,
      reasonCode: body.reasonCode,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Get("replay-requests/:approvalId")
  @RequireTenantPermission("jobs.replay.request", TENANT_JOB_REPLAY_PURPOSE)
  getReplayRequest(
    @Param("approvalId") approvalId: string,
    @Req() request: TenantAuthenticatedRequest,
  ) {
    this.assertUuid(approvalId, "approvalId");
    return this.replays.getReplayRequest(
      requireTenantAccessContext(request),
      approvalId,
    );
  }

  @Post("replay-requests/:approvalId/decision")
  @RequireTenantPermission("approvals.decide", TENANT_JOB_REPLAY_PURPOSE)
  decideReplay(
    @Param("approvalId") approvalId: string,
    @Body() body: DecideReplayBody,
    @Req() request: TenantAuthenticatedRequest,
  ) {
    this.assertUuid(approvalId, "approvalId");
    if (!body || (body.decision !== "approved" && body.decision !== "rejected")) {
      throw new BadRequestException("decision must be approved or rejected.");
    }
    if (!request.oidcClaims) {
      throw new BadRequestException("Verified OIDC claims are required.");
    }
    return this.replays.decideReplay({
      subject: requireTenantAccessContext(request),
      claims: request.oidcClaims,
      approvalId,
      decision: body.decision,
    });
  }

  @Post("replay-requests/:approvalId/execute")
  @RequireTenantPermission("jobs.replay.request", TENANT_JOB_REPLAY_PURPOSE)
  executeReplay(
    @Param("approvalId") approvalId: string,
    @Req() request: TenantAuthenticatedRequest,
  ) {
    this.assertUuid(approvalId, "approvalId");
    return this.replays.executeReplay(
      requireTenantAccessContext(request),
      approvalId,
    );
  }

  private assertUuid(value: string, field: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new BadRequestException(field + " must be a valid UUID.");
    }
  }
}
