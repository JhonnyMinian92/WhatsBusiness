import {Injectable,ServiceUnavailableException} from "@nestjs/common";
export const DEVELOPER_API_KEY_PEPPER_PROVIDER=Symbol("DEVELOPER_API_KEY_PEPPER_PROVIDER");
export interface DeveloperApiKeyPepperProvider{getPepper():Buffer;}
@Injectable()
export class EnvironmentDeveloperApiKeyPepperProvider implements DeveloperApiKeyPepperProvider{
 getPepper(){const v=process.env["DEVELOPER_API_KEY_PEPPER"]?.trim();if(!v)throw new ServiceUnavailableException("DEVELOPER_API_KEY_PEPPER is not configured.");const p=Buffer.from(v,"base64");if(p.length!==32||p.toString("base64").replace(/=+$/,"")!==v.replace(/=+$/,""))throw new ServiceUnavailableException("DEVELOPER_API_KEY_PEPPER must be canonical base64 for 32 bytes.");return p;}
}