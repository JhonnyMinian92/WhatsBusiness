import {BadRequestException,Body,Controller,Get,Headers,Param,Patch,Post,Put,Query,Req,Res,UseGuards} from "@nestjs/common";
import type {Response} from "express";
import {OidcAuthGuard} from "../../../platform/identity/oidc-auth.guard.js";
import {requireTenantAccessContext,type TenantAuthenticatedRequest} from "../../../platform/identity/tenant-context.guard.js";
import {RequireTenantPermission} from "../../../platform/identity/authorization/authorization.guard.js";
import {ContactAttributeService} from "../application/contact-attribute.service.js";

@Controller("v1/tenants/:tenantId") @UseGuards(OidcAuthGuard)
export class ContactAttributeController {
 constructor(private readonly service:ContactAttributeService){}
 @Get("contact-field-definitions") @RequireTenantPermission("crm.contacts.custom_fields.read","crm.contacts.custom_fields.read")
 listDefinitions(@Param("tenantId") tenant:string,@Query("includeRetired") retired:string|undefined,@Req() req:TenantAuthenticatedRequest){
  if(retired!==undefined&&retired!=="true"&&retired!=="false")throw new BadRequestException({code:"CRM_CONTACT_ATTRIBUTE_INCLUDE_RETIRED_INVALID"});
  return this.service.listDefinitions(this.subject(tenant,req),retired==="true");
 }
 @Post("contact-field-definitions") @RequireTenantPermission("crm.contacts.custom_fields.manage","crm.contacts.custom_fields.manage")
 async createDefinition(@Param("tenantId") tenant:string,@Headers("idempotency-key") key:string|undefined,@Body() body:unknown,@Req() req:TenantAuthenticatedRequest,@Res({passthrough:true}) res:Response){
  const d=await this.service.createDefinition(this.subject(tenant,req),body,key??"");res.setHeader("ETag",this.etag(d.version));return d;
 }
 @Patch("contact-field-definitions/:fieldId") @RequireTenantPermission("crm.contacts.custom_fields.manage","crm.contacts.custom_fields.manage")
 async updateDefinition(@Param("tenantId") tenant:string,@Param("fieldId") id:string,@Headers("idempotency-key") key:string|undefined,@Headers("if-match") tag:string|undefined,@Body() body:unknown,@Req() req:TenantAuthenticatedRequest,@Res({passthrough:true}) res:Response){
  const d=await this.service.updateDefinition(this.subject(tenant,req),id,this.version(tag),body,key??"");res.setHeader("ETag",this.etag(d.version));return d;
 }
 @Get("contacts/:contactId/attributes") @RequireTenantPermission("crm.contacts.custom_fields.read","crm.contacts.custom_fields.read")
 listValues(@Param("tenantId") tenant:string,@Param("contactId") id:string,@Req() req:TenantAuthenticatedRequest){return this.service.listValues(this.subject(tenant,req),id);}
 @Put("contacts/:contactId/attributes/:fieldKey") @RequireTenantPermission("crm.contacts.custom_fields.write","crm.contacts.custom_fields.write")
 setValue(@Param("tenantId") tenant:string,@Param("contactId") id:string,@Param("fieldKey") field:string,@Headers("idempotency-key") key:string|undefined,@Body() body:unknown,@Req() req:TenantAuthenticatedRequest){
  return this.service.setValue(this.subject(tenant,req),id,field,body,key??"");
 }
 private subject(tenant:string,req:TenantAuthenticatedRequest){const s=requireTenantAccessContext(req);if(s.tenantId!==tenant)throw new BadRequestException({code:"CRM_TENANT_CONTEXT_MISMATCH"});return s;}
 private version(tag:string|undefined):number{const m=tag&&/^"field-([1-9][0-9]*)"$/.exec(tag);const n=m?Number(m[1]):NaN;if(!Number.isSafeInteger(n)||n<1)throw new BadRequestException({code:"CRM_CONTACT_ATTRIBUTE_IF_MATCH_REQUIRED"});return n;}
 private etag(n:number):string{return '"field-'+n+'"';}
}
