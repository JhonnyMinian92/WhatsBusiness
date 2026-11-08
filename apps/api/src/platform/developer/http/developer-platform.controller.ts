import {BadRequestException,Body,Controller,Delete,Get,Headers,Param,Patch,Post,Query,Req,UseGuards} from "@nestjs/common";
import {OidcAuthGuard} from "../../identity/oidc-auth.guard.js";
import {requireTenantAccessContext,type TenantAuthenticatedRequest} from "../../identity/tenant-context.guard.js";
import {RequireTenantPermission} from "../../identity/authorization/authorization.guard.js";
import {DeveloperPlatformService} from "../application/developer-platform.service.js";
@Controller("v1/tenants/:tenantId/developer") @UseGuards(OidcAuthGuard)
export class DeveloperPlatformController{
 constructor(private readonly s:DeveloperPlatformService){}
 @Get("api-clients") @RequireTenantPermission("developer.api_clients.read","developer.api.clients.read")
 list(@Param("tenantId")t:string,@Req()r:TenantAuthenticatedRequest){return this.s.listApiClients(this.ctx(t,r));}
 @Post("api-clients") @RequireTenantPermission("developer.api_clients.manage","developer.api.clients.create")
 create(@Param("tenantId")t:string,@Body()b:unknown,@Headers("idempotency-key")k:string|undefined,@Req()r:TenantAuthenticatedRequest){return this.s.createApiClient(this.ctx(t,r),b,k);}
 @Post("api-clients/:clientId/rotate") @RequireTenantPermission("developer.api_clients.manage","developer.api.clients.rotate")
 rotate(@Param("tenantId")t:string,@Param("clientId")id:string,@Headers("idempotency-key")k:string|undefined,@Req()r:TenantAuthenticatedRequest){return this.s.rotateApiClient(this.ctx(t,r),id,k);}
 @Post("api-clients/:clientId/revoke") @RequireTenantPermission("developer.api_clients.manage","developer.api.clients.revoke")
 revoke(@Param("tenantId")t:string,@Param("clientId")id:string,@Headers("idempotency-key")k:string|undefined,@Req()r:TenantAuthenticatedRequest){return this.s.revokeApiClient(this.ctx(t,r),id,k);}
 @Get("webhook-endpoints") @RequireTenantPermission("developer.webhooks.read","developer.webhooks.read")
 endpoints(@Param("tenantId")t:string,@Req()r:TenantAuthenticatedRequest){return this.s.listWebhookEndpoints(this.ctx(t,r));}
 @Post("webhook-endpoints") @RequireTenantPermission("developer.webhooks.manage","developer.webhooks.create")
 createEndpoint(@Param("tenantId")t:string,@Body()b:unknown,@Headers("idempotency-key")k:string|undefined,@Req()r:TenantAuthenticatedRequest){return this.s.createWebhookEndpoint(this.ctx(t,r),b,k);}
 @Patch("webhook-endpoints/:endpointId") @RequireTenantPermission("developer.webhooks.manage","developer.webhooks.update")
 updateEndpoint(@Param("tenantId")t:string,@Param("endpointId")id:string,@Body()b:unknown,@Headers("idempotency-key")k:string|undefined,@Req()r:TenantAuthenticatedRequest){return this.s.updateWebhookEndpoint(this.ctx(t,r),id,b,k);}
 @Delete("webhook-endpoints/:endpointId") @RequireTenantPermission("developer.webhooks.manage","developer.webhooks.disable")
 disable(@Param("tenantId")t:string,@Param("endpointId")id:string,@Headers("idempotency-key")k:string|undefined,@Req()r:TenantAuthenticatedRequest){return this.s.disableWebhookEndpoint(this.ctx(t,r),id,k);}
 @Post("webhook-subscriptions") @RequireTenantPermission("developer.webhooks.manage","developer.webhooks.subscribe")
 subscriptions(@Param("tenantId")t:string,@Body()b:unknown,@Headers("idempotency-key")k:string|undefined,@Req()r:TenantAuthenticatedRequest){return this.s.subscribeWebhookEvents(this.ctx(t,r),b,k);}
 @Get("webhook-deliveries") @RequireTenantPermission("developer.webhooks.read","developer.webhooks.deliveries.read")
 deliveries(@Param("tenantId")t:string,@Query("pageSize")n:string|undefined,@Req()r:TenantAuthenticatedRequest){return this.s.listWebhookDeliveries(this.ctx(t,r),n);}
 @Post("webhook-deliveries/:deliveryId/retry") @RequireTenantPermission("developer.webhooks.retry","developer.webhooks.retry")
 retry(@Param("tenantId")t:string,@Param("deliveryId")id:string,@Headers("idempotency-key")k:string|undefined,@Req()r:TenantAuthenticatedRequest){return this.s.retryWebhookDelivery(this.ctx(t,r),id,k);}
 private ctx(t:string,r:TenantAuthenticatedRequest){const c=requireTenantAccessContext(r);if(c.tenantId!==t)throw new BadRequestException({code:"DEVELOPER_TENANT_CONTEXT_MISMATCH"});return c;}
}
