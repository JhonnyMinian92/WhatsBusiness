import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {Injectable,ServiceUnavailableException} from "@nestjs/common";
export const DEVELOPER_WEBHOOK_SECRET_PROTECTOR=Symbol("DEVELOPER_WEBHOOK_SECRET_PROTECTOR");
export interface ProtectedDeveloperWebhookSecret{readonly version:1;readonly nonce:string;readonly ciphertext:string;readonly authTag:string;}
export interface DeveloperWebhookSecretProtector{protect(t:string,e:string,p:string):ProtectedDeveloperWebhookSecret;reveal(t:string,e:string,s:ProtectedDeveloperWebhookSecret):string;}
@Injectable()
export class EnvironmentDeveloperWebhookSecretProtector implements DeveloperWebhookSecretProtector{
 protect(t:string,e:string,p:string){const n=randomBytes(12),c=createCipheriv("aes-256-gcm",this.key(),n);c.setAAD(this.aad(t,e));const x=Buffer.concat([c.update(p,"utf8"),c.final()]);return{version:1 as const,nonce:n.toString("base64url"),ciphertext:x.toString("base64url"),authTag:c.getAuthTag().toString("base64url")};}
 reveal(t:string,e:string,s:ProtectedDeveloperWebhookSecret){if(s.version!==1)throw new ServiceUnavailableException("Unsupported webhook secret version.");try{const c=createDecipheriv("aes-256-gcm",this.key(),Buffer.from(s.nonce,"base64url"));c.setAAD(this.aad(t,e));c.setAuthTag(Buffer.from(s.authTag,"base64url"));return Buffer.concat([c.update(Buffer.from(s.ciphertext,"base64url")),c.final()]).toString("utf8");}catch{throw new ServiceUnavailableException("Webhook signing secret could not be recovered.");}}
 private key(){const v=process.env["DEVELOPER_WEBHOOK_SECRET_KEY"]?.trim();if(!v)throw new ServiceUnavailableException("DEVELOPER_WEBHOOK_SECRET_KEY is not configured.");const k=Buffer.from(v,"base64");if(k.length!==32||k.toString("base64").replace(/=+$/,"")!==v.replace(/=+$/,""))throw new ServiceUnavailableException("DEVELOPER_WEBHOOK_SECRET_KEY must be canonical base64 for 32 bytes.");return k;}
 private aad(t:string,e:string){return Buffer.from("whatsbusiness:developer-webhook:v1:"+t+":"+e);}
}
