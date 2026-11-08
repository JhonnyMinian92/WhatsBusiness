import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { OidcAuthGuard } from "../identity/oidc-auth.guard.js";
import {
  requireTenantAccessContext,
  type TenantAuthenticatedRequest,
} from "../identity/tenant-context.guard.js";
import { RequireTenantPermission } from "../identity/authorization/authorization.guard.js";
import { MetaWebhookDeadLetterQueryService } from "./application/meta-webhook-dead-letter.query.js";

@Controller("v1/tenants/:tenantId/webhooks/dead-letters")
@UseGuards(OidcAuthGuard)
export class MetaWebhookDeadLetterController {
  constructor(private readonly deadLetters: MetaWebhookDeadLetterQueryService) {}

  @Get()
  @RequireTenantPermission("webhooks.dead_letters.read", "meta.webhooks.dead_letters.read")
  list(
    @Param("tenantId") tenantId: string,
    @Query("limit") limit: string | undefined,
    @Query("beforeCreatedAt") beforeCreatedAt: string | undefined,
    @Query("beforeId") beforeId: string | undefined,
    @Req() request: TenantAuthenticatedRequest,
  ) {
    if (!isUuid(tenantId)) throw new BadRequestException("tenantId must be a valid UUID.");
    const subject = requireTenantAccessContext(request);
    if (subject.tenantId !== tenantId) {
      throw new BadRequestException("Tenant route and authorization context do not match.");
    }
    if ((beforeCreatedAt === undefined) !== (beforeId === undefined)) {
      throw new BadRequestException("beforeCreatedAt and beforeId must be supplied together.");
    }
    const parsedLimit = limit === undefined ? 50 : Number(limit);
    if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException("limit must be an integer between 1 and 100.");
    }
    return this.deadLetters.list(subject, {
      limit: parsedLimit,
      ...(beforeCreatedAt && beforeId
        ? { before: { createdAt: beforeCreatedAt, id: beforeId } }
        : {}),
    });
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
