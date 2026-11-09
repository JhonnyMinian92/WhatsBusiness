import { ContactValidationError } from "./contact.js";

export type ContactAttributeFieldType = "text"|"long_text"|"number"|"decimal"|"boolean"|"date"|"datetime"|"single_select"|"multi_select"|"url";
export type ContactAttributeVisibility = "tenant"|"restricted";
export interface ContactAttributeValidation {
  readonly maxLength?: number; readonly minimum?: number; readonly maximum?: number;
  readonly maxScale?: number; readonly options?: readonly string[];
}
export interface ContactAttributeDefinitionRecord {
  readonly id:string; readonly tenantId:string; readonly fieldKey:string; readonly label:string;
  readonly fieldType:ContactAttributeFieldType; readonly required:boolean; readonly searchable:boolean;
  readonly visibility:ContactAttributeVisibility; readonly validation:ContactAttributeValidation;
  readonly version:number; readonly retiredAt:string|null; readonly createdAt:string; readonly updatedAt:string;
}
export interface ContactAttributeValueRecord {
  readonly id:string; readonly tenantId:string; readonly contactId:string; readonly fieldDefinitionId:string;
  readonly fieldKey:string; readonly label:string; readonly fieldType:ContactAttributeFieldType;
  readonly definitionVersion:number; readonly value:unknown; readonly valueVersion:number;
  readonly active:boolean; readonly visibility:ContactAttributeVisibility; readonly updatedAt:string;
}
export interface CreateContactAttributeDefinitionCommand {
  readonly fieldKey:string; readonly label:string; readonly fieldType:ContactAttributeFieldType;
  readonly required:boolean; readonly searchable:boolean; readonly visibility:ContactAttributeVisibility;
  readonly validation:ContactAttributeValidation;
}
export interface UpdateContactAttributeDefinitionCommand {
  readonly label?:string; readonly required?:boolean; readonly searchable?:boolean;
  readonly visibility?:ContactAttributeVisibility; readonly validation?:ContactAttributeValidation;
}
export interface SetContactAttributeValueCommand {
  readonly expectedDefinitionVersion:number; readonly expectedValueVersion:number; readonly value:unknown;
}
export const CONTACT_ATTRIBUTE_FIELD_TYPES = ["text","long_text","number","decimal","boolean","date","datetime","single_select","multi_select","url"] as const;

export function parseCreateContactAttributeDefinition(input:unknown):CreateContactAttributeDefinitionCommand {
 const r=record(input); keys(r,["fieldKey","label","fieldType","required","searchable","visibility","validation"]);
 const fieldKey=text(r.fieldKey,64,"FIELD_KEY");
 if(!/^[a-z][a-z0-9_]{1,63}$/.test(fieldKey)) fail("FIELD_KEY_INVALID");
 const fieldType=oneOf(r.fieldType,CONTACT_ATTRIBUTE_FIELD_TYPES,"FIELD_TYPE");
 return Object.freeze({fieldKey,label:text(r.label,120,"LABEL"),fieldType,
  required:bool(r.required??false,"REQUIRED"),searchable:bool(r.searchable??false,"SEARCHABLE"),
  visibility:oneOf(r.visibility??"tenant",["tenant","restricted"] as const,"VISIBILITY"),
  validation:parseValidation(r.validation,fieldType)});
}
export function parseUpdateContactAttributeDefinition(input:unknown,fieldType:ContactAttributeFieldType):UpdateContactAttributeDefinitionCommand {
 const r=record(input); keys(r,["label","required","searchable","visibility","validation"]);
 if(!Object.keys(r).length) fail("PATCH_EMPTY");
 const out:{label?:string;required?:boolean;searchable?:boolean;visibility?:ContactAttributeVisibility;validation?:ContactAttributeValidation}={};
 if("label" in r) out.label=text(r.label,120,"LABEL");
 if("required" in r) out.required=bool(r.required,"REQUIRED");
 if("searchable" in r) out.searchable=bool(r.searchable,"SEARCHABLE");
 if("visibility" in r) out.visibility=oneOf(r.visibility,["tenant","restricted"] as const,"VISIBILITY");
 if("validation" in r) out.validation=parseValidation(r.validation,fieldType);
 return Object.freeze(out);
}
export function parseSetContactAttributeValue(input:unknown):SetContactAttributeValueCommand {
 const r=record(input); keys(r,["expectedDefinitionVersion","expectedValueVersion","value"]);
 return Object.freeze({expectedDefinitionVersion:integer(r.expectedDefinitionVersion,1,"DEFINITION_VERSION"),
  expectedValueVersion:integer(r.expectedValueVersion,0,"VALUE_VERSION"),value:r.value});
}
export function validateContactAttributeValue(definition:Pick<ContactAttributeDefinitionRecord,"fieldType"|"required"|"validation">,value:unknown):unknown {
 if(value===null){if(definition.required) fail("VALUE_REQUIRED");return null;}
 const v=definition.validation;
 switch(definition.fieldType){
  case "text": case "long_text":
   if(typeof value!=="string") fail("VALUE_TYPE_INVALID");
   if(value.length>(v.maxLength??(definition.fieldType==="text"?512:10000))) fail("VALUE_LENGTH_INVALID");
   return value.normalize("NFC");
  case "number":
   if(typeof value!=="number"||!Number.isFinite(value)) fail("VALUE_TYPE_INVALID");
   if((v.minimum!==undefined&&value<v.minimum)||(v.maximum!==undefined&&value>v.maximum)) fail("VALUE_RANGE_INVALID");
   return value;
  case "decimal":
   if(typeof value!=="string"||! /^-?(?:0|[1-9][0-9]{0,19})(?:\\.[0-9]{1,12})?$/.test(value)) fail("VALUE_DECIMAL_INVALID");
   if((value.split(".")[1]?.length??0)>(v.maxScale??4)) fail("VALUE_SCALE_INVALID");
   return value;
  case "boolean": if(typeof value!=="boolean") fail("VALUE_TYPE_INVALID"); return value;
  case "date":{
   if(typeof value!=="string"||!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) fail("VALUE_DATE_INVALID");
   const date=new Date(value+"T00:00:00.000Z");
   if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value) fail("VALUE_DATE_INVALID");
   return value;
  }
  case "datetime":{
   if(typeof value!=="string"||!/^\\d{4}-\\d{2}-\\d{2}T.*(?:Z|[+-]\\d{2}:\\d{2})$/.test(value)) fail("VALUE_DATETIME_INVALID");
   const date=new Date(value); if(!Number.isFinite(date.getTime())) fail("VALUE_DATETIME_INVALID"); return date.toISOString();
  }
  case "single_select": if(typeof value!=="string"||!v.options?.includes(value)) fail("VALUE_OPTION_INVALID"); return value;
  case "multi_select":
   if(!Array.isArray(value)||value.some(x=>typeof x!=="string")||new Set(value).size!==value.length||value.some(x=>!v.options?.includes(x))) fail("VALUE_OPTION_INVALID");
   return Object.freeze([...value]);
  case "url":{
   if(typeof value!=="string"||value.length>2048) fail("VALUE_URL_INVALID");
   let u:URL; try{u=new URL(value);}catch{fail("VALUE_URL_INVALID");}
   if((u.protocol!=="https:"&&u.protocol!=="http:")||u.username||u.password) fail("VALUE_URL_INVALID");
   return u.toString();
  }
 }
}
function parseValidation(input:unknown,type:ContactAttributeFieldType):ContactAttributeValidation {
 const r=record(input??{}); keys(r,["maxLength","minimum","maximum","maxScale","options"]);
 const maxLength=r.maxLength===undefined?undefined:integer(r.maxLength,1,"MAX_LENGTH");
 const minimum=r.minimum===undefined?undefined:number(r.minimum,"MINIMUM");
 const maximum=r.maximum===undefined?undefined:number(r.maximum,"MAXIMUM");
 const maxScale=r.maxScale===undefined?undefined:integer(r.maxScale,0,"MAX_SCALE");
 if(minimum!==undefined&&maximum!==undefined&&minimum>maximum) fail("VALIDATION_RANGE_INVALID");
 if(maxLength!==undefined&&!["text","long_text"].includes(type)) fail("LENGTH_RULE_NOT_ALLOWED");
 if((minimum!==undefined||maximum!==undefined)&&type!=="number") fail("NUMERIC_RULE_NOT_ALLOWED");
 if(maxScale!==undefined&&(type!=="decimal"||maxScale>12)) fail("SCALE_RULE_NOT_ALLOWED");
 let options:readonly string[]|undefined;
 if(r.options!==undefined){
  if(!Array.isArray(r.options)||!r.options.length||r.options.length>100||r.options.some(x=>typeof x!=="string")) fail("OPTIONS_INVALID");
  const normalized=r.options.map(x=>(x as string).trim().normalize("NFC"));
  if(normalized.some(x=>!x||x.length>120)||new Set(normalized).size!==normalized.length) fail("OPTIONS_INVALID");
  options=Object.freeze(normalized);
 }
 if(["single_select","multi_select"].includes(type)&&!options) fail("OPTIONS_REQUIRED");
 if(!["single_select","multi_select"].includes(type)&&options) fail("OPTIONS_NOT_ALLOWED");
 return Object.freeze({...(maxLength===undefined?{}:{maxLength}),...(minimum===undefined?{}:{minimum}),
  ...(maximum===undefined?{}:{maximum}),...(maxScale===undefined?{}:{maxScale}),...(options===undefined?{}:{options})});
}
function record(x:unknown):Record<string,unknown>{
 if(!x||typeof x!=="object"||Array.isArray(x)) fail("BODY_INVALID");
 const p=Object.getPrototypeOf(x); if(p!==Object.prototype&&p!==null) fail("BODY_INVALID"); return x as Record<string,unknown>;
}
function keys(r:Record<string,unknown>,allowed:readonly string[]):void{if(Object.keys(r).some(k=>!allowed.includes(k)))fail("PROPERTY_NOT_ALLOWED");}
function text(x:unknown,max:number,key:string):string{
 if(typeof x!=="string") fail(key+"_INVALID"); const s=x.trim().normalize("NFC");
 if(!s||s.length>max||/[\\u0000-\\u001f\\u007f]/.test(s)) fail(key+"_INVALID"); return s;
}
function bool(x:unknown,key:string):boolean{if(typeof x!=="boolean")fail(key+"_INVALID");return x;}
function integer(x:unknown,min:number,key:string):number{if(typeof x!=="number"||!Number.isSafeInteger(x)||x<min)fail(key+"_INVALID");return x;}
function number(x:unknown,key:string):number{if(typeof x!=="number"||!Number.isFinite(x))fail(key+"_INVALID");return x;}
function oneOf<const T extends readonly string[]>(x:unknown,values:T,key:string):T[number]{if(typeof x!=="string"||!values.includes(x))fail(key+"_INVALID");return x as T[number];}
function fail(code:string):never{throw new ContactValidationError("CRM_CONTACT_ATTRIBUTE_"+code);}
