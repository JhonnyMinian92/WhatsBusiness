import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from "@nestjs/common";
import {DatabaseService} from "../../../platform/database/database.module.js";
import {AppendOnlyAuditRepository} from "../../../platform/identity/audit/append-only-audit.repository.js";
import type {TenantAccessContext} from "../../../platform/identity/tenant-access-context.js";
import type {PermissionKey} from "../../../platform/identity/authorization/permission-catalog.js";
import {ContactValidationError,isContactUuid} from "../domain/contact.js";
import {parseCreateContactAttributeDefinition,parseSetContactAttributeValue,parseUpdateContactAttributeDefinition,validateContactAttributeValue,type ContactAttributeDefinitionRecord,type ContactAttributeValueRecord} from "../domain/contact-attribute.js";
import {PostgresContactRepository} from "../infrastructure/postgres-contact.repository.js";
import {PostgresContactAttributeRepository} from "../infrastructure/postgres-contact-attribute.repository.js";
import {assertIdempotencyKey,assertSameIdempotencyRequest,hashContactCommand} from "./contact-command-support.js";

@Injectable()
export class ContactAttributeService {
 constructor(private readonly database:DatabaseService,private readonly contacts:PostgresContactRepository,private readonly attributes:PostgresContactAttributeRepository,private readonly audit:AppendOnlyAuditRepository){}
 async listDefinitions(subject:TenantAccessContext,includeRetired=false):Promise<readonly ContactAttributeDefinitionRecord[]>{
  this.permission(subject,"crm.contacts.custom_fields.read");
  return this.database.withTenantContextAtVersion(subject.actorId,subject.tenantId,subject.authzVersion,async c=>{
   const all=await this.attributes.listDefinitions(c,subject.tenantId,includeRetired);
   return Object.freeze(all.filter(d=>this.canRead(subject,d)));
  });
 }
 async createDefinition(subject:TenantAccessContext,input:unknown,key:string):Promise<ContactAttributeDefinitionRecord>{
  this.permission(subject,"crm.contacts.custom_fields.manage");
  const cmd=this.validation(()=>parseCreateContactAttributeDefinition(input));
  if(cmd.visibility==="restricted")this.permission(subject,"crm.contacts.custom_fields.read_restricted");
  assertIdempotencyKey(key);const hash=hashContactCommand(cmd);
  return this.database.withTenantContextAtVersion(subject.actorId,subject.tenantId,subject.authzVersion,async c=>{
   const r=await this.contacts.reserveCommand<ContactAttributeDefinitionRecord>(c,{tenantId:subject.tenantId,actorId:subject.actorId,operation:"create_contact_attribute",idempotencyKey:key,requestHash:hash});
   if(r.kind==="existing"){assertSameIdempotencyRequest(r.requestHash,hash);if(!r.response)throw new ConflictException({code:"CRM_CONTACT_ATTRIBUTE_IDEMPOTENCY_INCOMPLETE"});return r.response;}
   let d:ContactAttributeDefinitionRecord;
   try{d=await this.attributes.createDefinition(c,subject.tenantId,subject.actorId,cmd);}catch(e){if(pgCode(e)==="23505")throw new ConflictException({code:"CRM_CONTACT_ATTRIBUTE_KEY_ALREADY_EXISTS"});throw e;}
   await this.audit.append(c,{tenantId:subject.tenantId,actorUserId:subject.actorId,actionKey:"crm.contacts.custom_fields.create",resourceType:"contact_attribute_definition",resourceId:d.id,purpose:subject.purpose,outcome:"allowed",correlationId:subject.correlationId,requestHash:hash});
   await this.contacts.completeCommand(c,r.id,d);return d;
  });
 }
 async updateDefinition(subject:TenantAccessContext,id:string,expected:number,input:unknown,key:string):Promise<ContactAttributeDefinitionRecord>{
  this.permission(subject,"crm.contacts.custom_fields.manage");
  if(!isContactUuid(id))throw new BadRequestException({code:"CRM_CONTACT_ATTRIBUTE_ID_INVALID"});
  if(!Number.isSafeInteger(expected)||expected<1)throw new BadRequestException({code:"CRM_CONTACT_ATTRIBUTE_VERSION_INVALID"});
  assertIdempotencyKey(key);const hash=hashContactCommand({id,expected,input});
  return this.database.withTenantContextAtVersion(subject.actorId,subject.tenantId,subject.authzVersion,async c=>{
   const current=await this.attributes.findDefinitionById(c,subject.tenantId,id);
   if(!current)throw new NotFoundException({code:"CRM_CONTACT_ATTRIBUTE_NOT_FOUND"});
   if(!this.canRead(subject,current))throw new ForbiddenException({code:"CRM_CONTACT_ATTRIBUTE_RESTRICTED"});
   const cmd=this.validation(()=>parseUpdateContactAttributeDefinition(input,current.fieldType));
   if(cmd.visibility==="restricted")this.permission(subject,"crm.contacts.custom_fields.read_restricted");
   const reservation=await this.contacts.reserveCommand<ContactAttributeDefinitionRecord>(c,{tenantId:subject.tenantId,actorId:subject.actorId,operation:"update_contact_attribute",idempotencyKey:key,requestHash:hash});
   if(reservation.kind==="existing"){assertSameIdempotencyRequest(reservation.requestHash,hash);if(!reservation.response)throw new ConflictException({code:"CRM_CONTACT_ATTRIBUTE_IDEMPOTENCY_INCOMPLETE"});return reservation.response;}
   const d=await this.attributes.updateDefinition(c,subject.tenantId,subject.actorId,id,expected,cmd);
   if(!d)throw new ConflictException({code:"CRM_CONTACT_ATTRIBUTE_VERSION_CONFLICT"});
   await this.audit.append(c,{tenantId:subject.tenantId,actorUserId:subject.actorId,actionKey:"crm.contacts.custom_fields.update",resourceType:"contact_attribute_definition",resourceId:d.id,purpose:subject.purpose,outcome:"allowed",correlationId:subject.correlationId,requestHash:hash});
   await this.contacts.completeCommand(c,reservation.id,d);return d;
  });
 }
 async listValues(subject:TenantAccessContext,contactId:string):Promise<readonly ContactAttributeValueRecord[]>{
  this.permission(subject,"crm.contacts.custom_fields.read");this.contactId(contactId);
  return this.database.withTenantContextAtVersion(subject.actorId,subject.tenantId,subject.authzVersion,async c=>{
   if(!await this.contacts.findById(c,subject.tenantId,contactId))throw new NotFoundException({code:"CRM_CONTACT_NOT_FOUND"});
   const all=await this.attributes.listValues(c,subject.tenantId,contactId);
   return Object.freeze(all.filter(v=>v.visibility==="tenant"||subject.permissionKeys.includes("crm.contacts.custom_fields.read_restricted")));
  });
 }
 async setValue(subject:TenantAccessContext,contactId:string,fieldKey:string,input:unknown,key:string):Promise<ContactAttributeValueRecord>{
  this.permission(subject,"crm.contacts.custom_fields.write");this.contactId(contactId);
  if(!/^[a-z][a-z0-9_]{1,63}$/.test(fieldKey))throw new BadRequestException({code:"CRM_CONTACT_ATTRIBUTE_FIELD_KEY_INVALID"});
  const cmd=this.validation(()=>parseSetContactAttributeValue(input));assertIdempotencyKey(key);
  const hash=hashContactCommand({contactId,fieldKey,cmd});
  return this.database.withTenantContextAtVersion(subject.actorId,subject.tenantId,subject.authzVersion,async c=>{
   const contact=await this.contacts.findById(c,subject.tenantId,contactId);
   if(!contact)throw new NotFoundException({code:"CRM_CONTACT_NOT_FOUND"});
   if(contact.status!=="active")throw new ConflictException({code:"CRM_CONTACT_NOT_ACTIVE"});
   const def=await this.attributes.findDefinitionByKey(c,subject.tenantId,fieldKey);
   if(!def||def.retiredAt!==null)throw new NotFoundException({code:"CRM_CONTACT_ATTRIBUTE_NOT_FOUND"});
   if(def.visibility==="restricted"){
    this.permission(subject,"crm.contacts.custom_fields.read_restricted");
    this.permission(subject,"crm.contacts.custom_fields.write_restricted");
   }
   if(def.version!==cmd.expectedDefinitionVersion)throw new ConflictException({code:"CRM_CONTACT_ATTRIBUTE_DEFINITION_VERSION_CONFLICT"});
   const v=this.validation(()=>validateContactAttributeValue(def,cmd.value));
   const reservation=await this.contacts.reserveCommand<ContactAttributeValueRecord>(c,{tenantId:subject.tenantId,actorId:subject.actorId,operation:"set_contact_attribute",idempotencyKey:key,requestHash:hash});
   if(reservation.kind==="existing"){assertSameIdempotencyRequest(reservation.requestHash,hash);if(!reservation.response)throw new ConflictException({code:"CRM_CONTACT_ATTRIBUTE_IDEMPOTENCY_INCOMPLETE"});return reservation.response;}
   const old=await this.attributes.findValue(c,subject.tenantId,contactId,def.id);
   if((old?.valueVersion??0)!==cmd.expectedValueVersion)throw new ConflictException({code:"CRM_CONTACT_ATTRIBUTE_VALUE_VERSION_CONFLICT"});
   const updated=await this.attributes.setValue(c,subject.tenantId,subject.actorId,contactId,def,v,v!==null,cmd.expectedValueVersion);
   if(!updated)throw new ConflictException({code:"CRM_CONTACT_ATTRIBUTE_VALUE_VERSION_CONFLICT"});
   await this.audit.append(c,{tenantId:subject.tenantId,actorUserId:subject.actorId,actionKey:"crm.contacts.custom_fields.set",resourceType:"contact_attribute_value",resourceId:updated.id,purpose:subject.purpose,outcome:"allowed",correlationId:subject.correlationId,requestHash:hash});
   await this.contacts.completeCommand(c,reservation.id,updated);return updated;
  });
 }
 private canRead(s:TenantAccessContext,d:ContactAttributeDefinitionRecord):boolean{return d.visibility==="tenant"||s.permissionKeys.includes("crm.contacts.custom_fields.read_restricted");}
 private permission(s:TenantAccessContext,p:PermissionKey):void{if(!s.permissionKeys.includes(p))throw new ForbiddenException({code:"CRM_CONTACT_ATTRIBUTE_PERMISSION_REQUIRED"});}
 private contactId(id:string):void{if(!isContactUuid(id))throw new BadRequestException({code:"CRM_CONTACT_ID_INVALID"});}
 private validation<T>(fn:()=>T):T{try{return fn();}catch(e){if(e instanceof ContactValidationError)throw new BadRequestException({code:e.code,detail:"El campo personalizado no cumple su esquema tipado."});throw e;}}
}
function pgCode(e:unknown):string|null{return typeof e==="object"&&e!==null&&"code"in e?String((e as {code:unknown}).code):null;}
