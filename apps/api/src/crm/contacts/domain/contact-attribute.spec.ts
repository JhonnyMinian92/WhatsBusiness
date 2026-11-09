import assert from "node:assert/strict";
import test from "node:test";
import {parseCreateContactAttributeDefinition,parseSetContactAttributeValue,parseUpdateContactAttributeDefinition,validateContactAttributeValue} from "./contact-attribute.js";

test("parses tenant custom field schemas and select options",()=>{
 const d=parseCreateContactAttributeDefinition({fieldKey:"industry",label:"Industria",fieldType:"single_select",searchable:true,validation:{options:["retail","services"]}});
 assert.equal(d.fieldKey,"industry"); assert.deepEqual(d.validation.options,["retail","services"]);
});
test("rejects extra properties, missing select options and mismatched rules",()=>{
 assert.throws(()=>parseCreateContactAttributeDefinition({fieldKey:"industry",label:"Industria",fieldType:"text",sql:"DROP TABLE"}));
 assert.throws(()=>parseCreateContactAttributeDefinition({fieldKey:"industry",label:"Industria",fieldType:"single_select"}));
 assert.throws(()=>parseCreateContactAttributeDefinition({fieldKey:"industry",label:"Industria",fieldType:"text",validation:{maximum:10}}));
});
test("validates numeric, decimal and controlled vocabulary values",()=>{
 const n=parseCreateContactAttributeDefinition({fieldKey:"score",label:"Score",fieldType:"number",validation:{minimum:0,maximum:100}});
 assert.equal(validateContactAttributeValue(n,80),80); assert.throws(()=>validateContactAttributeValue(n,101));
 const d=parseCreateContactAttributeDefinition({fieldKey:"revenue",label:"Revenue",fieldType:"decimal",validation:{maxScale:2}});
 assert.equal(validateContactAttributeValue(d,"123.45"),"123.45"); assert.throws(()=>validateContactAttributeValue(d,"123.456"));
 const s=parseCreateContactAttributeDefinition({fieldKey:"industry",label:"Industry",fieldType:"single_select",validation:{options:["retail"]}});
 assert.equal(validateContactAttributeValue(s,"retail"),"retail"); assert.throws(()=>validateContactAttributeValue(s,"unknown"));
});
test("allows null only for optional fields and keeps type immutable",()=>{
 const d=parseCreateContactAttributeDefinition({fieldKey:"industry",label:"Industry",fieldType:"text"});
 assert.equal(validateContactAttributeValue(d,null),null); assert.throws(()=>validateContactAttributeValue({...d,required:true},null));
 assert.throws(()=>parseUpdateContactAttributeDefinition({fieldType:"number"},"text"));
});
test("requires positive definition version and nonnegative value version",()=>{
 assert.deepEqual(parseSetContactAttributeValue({expectedDefinitionVersion:2,expectedValueVersion:0,value:"x"}),{expectedDefinitionVersion:2,expectedValueVersion:0,value:"x"});
 assert.throws(()=>parseSetContactAttributeValue({expectedDefinitionVersion:0,expectedValueVersion:0,value:"x"}));
});
