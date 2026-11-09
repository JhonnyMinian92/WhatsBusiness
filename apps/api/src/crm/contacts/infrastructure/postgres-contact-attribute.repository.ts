import type {PoolClient,QueryResult,QueryResultRow} from "pg";
import type {ContactAttributeDefinitionRecord,ContactAttributeValueRecord,CreateContactAttributeDefinitionCommand,UpdateContactAttributeDefinitionCommand} from "../domain/contact-attribute.js";
interface DefinitionRow {id:string;tenant_id:string;field_key:string;label:string;field_type:ContactAttributeDefinitionRecord["fieldType"];required:boolean;searchable:boolean;visibility:ContactAttributeDefinitionRecord["visibility"];validation:ContactAttributeDefinitionRecord["validation"];version:number;retired_at:Date|string|null;created_at:Date|string;updated_at:Date|string;}
interface ValueRow {id:string;tenant_id:string;contact_id:string;field_definition_id:string;field_key:string;label:string;field_type:ContactAttributeValueRecord["fieldType"];definition_version:number;value_json:unknown;value_version:number;is_active:boolean;visibility:ContactAttributeValueRecord["visibility"];updated_at:Date|string;}
/** PostgreSQL adapter; transaction, tenant RLS and authorization belong to the application layer. */
export class PostgresContactAttributeRepository {
 async listDefinitions(c:PoolClient,tenant:string,retired:boolean):Promise<readonly ContactAttributeDefinitionRecord[]>{
  const r=await c.query<DefinitionRow>("SELECT id::text,tenant_id::text,field_key,label,field_type,required,searchable,visibility,validation,version,retired_at,created_at,updated_at FROM crm.contact_attribute_definitions WHERE tenant_id=$1 AND ($2::boolean OR retired_at IS NULL) ORDER BY field_key",[tenant,retired]);return Object.freeze(r.rows.map(definition));
 }
 async findDefinitionById(c:PoolClient,tenant:string,id:string):Promise<ContactAttributeDefinitionRecord|null>{
  const r=await c.query<DefinitionRow>("SELECT id::text,tenant_id::text,field_key,label,field_type,required,searchable,visibility,validation,version,retired_at,created_at,updated_at FROM crm.contact_attribute_definitions WHERE tenant_id=$1 AND id=$2",[tenant,id]);return r.rows[0]?definition(r.rows[0]):null;
 }
 async findDefinitionByKey(c:PoolClient,tenant:string,key:string):Promise<ContactAttributeDefinitionRecord|null>{
  const r=await c.query<DefinitionRow>("SELECT id::text,tenant_id::text,field_key,label,field_type,required,searchable,visibility,validation,version,retired_at,created_at,updated_at FROM crm.contact_attribute_definitions WHERE tenant_id=$1 AND field_key=$2",[tenant,key]);return r.rows[0]?definition(r.rows[0]):null;
 }
 async createDefinition(c:PoolClient,tenant:string,actor:string,cmd:CreateContactAttributeDefinitionCommand):Promise<ContactAttributeDefinitionRecord>{
  const r=await c.query<DefinitionRow>("INSERT INTO crm.contact_attribute_definitions (tenant_id,field_key,label,field_type,required,searchable,visibility,validation,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$9) RETURNING id::text,tenant_id::text,field_key,label,field_type,required,searchable,visibility,validation,version,retired_at,created_at,updated_at",[tenant,cmd.fieldKey,cmd.label,cmd.fieldType,cmd.required,cmd.searchable,cmd.visibility,JSON.stringify(cmd.validation),actor]);return definition(required(r));
 }
 async updateDefinition(c:PoolClient,tenant:string,actor:string,id:string,version:number,cmd:UpdateContactAttributeDefinitionCommand):Promise<ContactAttributeDefinitionRecord|null>{
  const r=await c.query<DefinitionRow>([
   "UPDATE crm.contact_attribute_definitions SET",
   "label=CASE WHEN $4::boolean THEN $5 ELSE label END,required=CASE WHEN $6::boolean THEN $7 ELSE required END,",
   "searchable=CASE WHEN $8::boolean THEN $9 ELSE searchable END,visibility=CASE WHEN $10::boolean THEN $11 ELSE visibility END,",
   "validation=CASE WHEN $12::boolean THEN $13::jsonb ELSE validation END,version=version+1,updated_by=$3",
   "WHERE tenant_id=$1 AND id=$2 AND version=$14 AND retired_at IS NULL",
   "RETURNING id::text,tenant_id::text,field_key,label,field_type,required,searchable,visibility,validation,version,retired_at,created_at,updated_at"
  ].join(" "),[tenant,id,actor,Object.hasOwn(cmd,"label"),cmd.label??null,Object.hasOwn(cmd,"required"),cmd.required??null,Object.hasOwn(cmd,"searchable"),cmd.searchable??null,Object.hasOwn(cmd,"visibility"),cmd.visibility??null,Object.hasOwn(cmd,"validation"),cmd.validation?JSON.stringify(cmd.validation):null,version]);return r.rows[0]?definition(r.rows[0]):null;
 }
 async listValues(c:PoolClient,tenant:string,contact:string):Promise<readonly ContactAttributeValueRecord[]>{
  const r=await c.query<ValueRow>([
   "SELECT v.id::text,v.tenant_id::text,v.contact_id::text,v.field_definition_id::text,d.field_key,d.label,d.field_type,",
   "v.definition_version,v.value_json,v.value_version,v.is_active,d.visibility,v.updated_at FROM crm.contact_attribute_values v",
   "JOIN crm.contact_attribute_definitions d ON d.tenant_id=v.tenant_id AND d.id=v.field_definition_id",
   "WHERE v.tenant_id=$1 AND v.contact_id=$2 AND v.is_active=true AND d.retired_at IS NULL ORDER BY d.field_key"
  ].join(" "),[tenant,contact]);return Object.freeze(r.rows.map(value));
 }
 async findValue(c:PoolClient,tenant:string,contact:string,definitionId:string):Promise<ContactAttributeValueRecord|null>{
  const r=await c.query<ValueRow>([
   "SELECT v.id::text,v.tenant_id::text,v.contact_id::text,v.field_definition_id::text,d.field_key,d.label,d.field_type,",
   "v.definition_version,v.value_json,v.value_version,v.is_active,d.visibility,v.updated_at FROM crm.contact_attribute_values v",
   "JOIN crm.contact_attribute_definitions d ON d.tenant_id=v.tenant_id AND d.id=v.field_definition_id",
   "WHERE v.tenant_id=$1 AND v.contact_id=$2 AND v.field_definition_id=$3"
  ].join(" "),[tenant,contact,definitionId]);return r.rows[0]?value(r.rows[0]):null;
 }
 async setValue(c:PoolClient,tenant:string,actor:string,contact:string,def:ContactAttributeDefinitionRecord,raw:unknown,active:boolean,expected:number):Promise<ContactAttributeValueRecord|null>{
  if(expected===0){
   const r=await c.query<ValueRow>([
    "INSERT INTO crm.contact_attribute_values (tenant_id,contact_id,field_definition_id,definition_version,value_json,value_version,is_active,created_by,updated_by)",
    "VALUES ($1,$2,$3,$4,$5::jsonb,1,$6,$7,$7) ON CONFLICT (tenant_id,contact_id,field_definition_id) DO NOTHING",
    "RETURNING id::text,tenant_id::text,contact_id::text,field_definition_id::text,$8::text AS field_key,$9::text AS label,$10::text AS field_type,definition_version,value_json,value_version,is_active,$11::text AS visibility,updated_at"
   ].join(" "),[tenant,contact,def.id,def.version,JSON.stringify(raw),active,actor,def.fieldKey,def.label,def.fieldType,def.visibility]);return r.rows[0]?value(r.rows[0]):null;
  }
  const r=await c.query<ValueRow>([
   "UPDATE crm.contact_attribute_values SET definition_version=$4,value_json=$5::jsonb,is_active=$6,value_version=value_version+1,updated_by=$7",
   "WHERE tenant_id=$1 AND contact_id=$2 AND field_definition_id=$3 AND value_version=$8",
   "RETURNING id::text,tenant_id::text,contact_id::text,field_definition_id::text,$9::text AS field_key,$10::text AS label,$11::text AS field_type,definition_version,value_json,value_version,is_active,$12::text AS visibility,updated_at"
  ].join(" "),[tenant,contact,def.id,def.version,JSON.stringify(raw),active,actor,expected,def.fieldKey,def.label,def.fieldType,def.visibility]);return r.rows[0]?value(r.rows[0]):null;
 }
}
function required<T extends QueryResultRow>(r:QueryResult<T>):T{if(!r.rows[0])throw new Error("CRM_CONTACT_ATTRIBUTE_INSERT_RETURNED_NO_ROW");return r.rows[0];}
function iso(x:Date|string):string{const d=x instanceof Date?x:new Date(x);if(!Number.isFinite(d.getTime()))throw new Error("CRM_CONTACT_ATTRIBUTE_TIMESTAMP_INVALID");return d.toISOString();}
function definition(r:DefinitionRow):ContactAttributeDefinitionRecord{return Object.freeze({id:r.id,tenantId:r.tenant_id,fieldKey:r.field_key,label:r.label,fieldType:r.field_type,required:r.required,searchable:r.searchable,visibility:r.visibility,validation:Object.freeze(r.validation??{}),version:r.version,retiredAt:r.retired_at===null?null:iso(r.retired_at),createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)});}
function value(r:ValueRow):ContactAttributeValueRecord{return Object.freeze({id:r.id,tenantId:r.tenant_id,contactId:r.contact_id,fieldDefinitionId:r.field_definition_id,fieldKey:r.field_key,label:r.label,fieldType:r.field_type,definitionVersion:r.definition_version,value:r.value_json,valueVersion:r.value_version,active:r.is_active,visibility:r.visibility,updatedAt:iso(r.updated_at)});}
