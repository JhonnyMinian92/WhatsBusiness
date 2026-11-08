import {Injectable,TooManyRequestsException,UnauthorizedException} from "@nestjs/common";
import type {CanActivate,ExecutionContext} from "@nestjs/common";
import type {Response} from "express";
import type {OidcAuthenticatedRequest} from "../../identity/oidc-auth.guard.js";
import {OidcAuthGuard} from "../../identity/oidc-auth.guard.js";
import {parseDeveloperApiBearerToken} from "../domain/developer-api-credential.js";
import {DeveloperApiRateLimitError,DeveloperPlatformService} from "./developer-platform.service.js";
import type {DeveloperApiKeyPepperProvider} from "../infrastructure/developer-api-key-pepper.js";
export interface DeveloperApiClientPrincipal{readonly clientId:string;readonly tenantId:string;readonly ownerUserId:string;readonly scopes:readonly string[];}
export interface OidcOrApiClientRequest extends OidcAuthenticatedRequest{developerApiClientContext?:DeveloperApiClientPrincipal;}
@Injectable()
export class OidcOrApiClientGuard implements CanActivate{
 constructor(private readonly oidc:OidcAuthGuard,private readonly platform:DeveloperPlatformService,private readonly pepper:DeveloperApiKeyPepperProvider){}
 async canActivate(context:ExecutionContext):Promise<boolean>{
  const req=context.switchToHttp().getRequest<OidcOrApiClientRequest>(),res=context.switchToHttp().getResponse<Response>(),h=req.headers.authorization;
  if(typeof h!=="string"||!h.startsWith("Bearer "))return this.oidc.canActivate(context);
  const token=h.slice(7).trim();if(!token.startsWith("wb_live_"))return this.oidc.canActivate(context);
  const pepper=this.pepper.getPepper();let parsed:ReturnType<typeof parseDeveloperApiBearerToken>;
  try{parsed=parseDeveloperApiBearerToken(token,pepper);}catch{throw new UnauthorizedException("Developer API credential is invalid.");}
  try{const p=await this.platform.authenticateDeveloperApiClient(parsed.keyId,parsed.secretDigest);if(!p||p.scopes.length===0)throw new UnauthorizedException("Developer API credential is invalid, expired or revoked.");req.developerApiClientContext=Object.freeze({...p,scopes:Object.freeze([...p.scopes])});return true;}
  catch(e){if(e instanceof DeveloperApiRateLimitError){res.setHeader("Retry-After",String(e.retryAfterSeconds));throw new TooManyRequestsException({code:"DEVELOPER_API_RATE_LIMITED",retryAfterSeconds:e.retryAfterSeconds});}throw e;}
 }
}
