import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { OidcAuthenticatedRequest } from "./oidc-auth.guard.js";
import { OidcAuthGuard } from "./oidc-auth.guard.js";
import { IdentityService } from "./identity.service.js";

@Controller("v1")
@UseGuards(OidcAuthGuard)
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get("me")
  currentPrincipal(@Req() request: OidcAuthenticatedRequest) {
    return this.identity.currentPrincipal(this.claims(request));
  }

  @Get("tenants")
  accessibleTenants(
    @Req() request: OidcAuthenticatedRequest,
    @Query("cursor") cursor?: string,
    @Query("pageSize") pageSizeValue?: string,
  ) {
    const pageSize = pageSizeValue === undefined ? 25 : Number(pageSizeValue);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new BadRequestException("pageSize must be an integer between 1 and 100.");
    }
    return this.identity.accessibleTenants(this.claims(request), cursor, pageSize);
  }

  @Get("tenants/:tenantId/context")
  tenantContext(
    @Req() request: OidcAuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.identity.tenantContext(this.claims(request), tenantId);
  }

  private claims(request: OidcAuthenticatedRequest) {
    if (!request.oidcClaims) {
      throw new BadRequestException("OIDC principal was not attached by the authentication guard.");
    }
    return request.oidcClaims;
  }
}
