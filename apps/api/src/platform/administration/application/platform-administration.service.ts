import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  PlanDefinitionPolicy,
  PlatformAdministrationPolicyViolation,
  SupportGrantPolicy,
  TenantLifecyclePolicy,
  UsageEntryPolicy,
  type TenantLifecycleStatus,
} from "../domain/platform-administration.policy.js";
import {
  PLATFORM_ADMINISTRATION_PORT,
  type AssignTenantPlanCommand,
  type AuthorizeSupportAccessCommand,
  type CreateOrganizationCommand,
  type CreateSupportGrantCommand,
  type PlatformAdministrationPort,
  type ProvisionTenantCommand,
  type PublishPlanVersionCommand,
  type RecordUsageCommand,
  type RevokeSupportGrantCommand,
  type TenantLifecycleCommand,
} from "./platform-administration.port.js";

@Injectable()
export class PlatformAdministrationService {
  private readonly lifecycle = new TenantLifecyclePolicy();
  private readonly planPolicy = new PlanDefinitionPolicy();
  private readonly supportPolicy = new SupportGrantPolicy();
  private readonly usagePolicy = new UsageEntryPolicy();

  constructor(
    @Inject(PLATFORM_ADMINISTRATION_PORT) private readonly repository: PlatformAdministrationPort,
    private readonly supportGrantMaxDurationMinutes = 60,
  ) {
    if (!Number.isSafeInteger(supportGrantMaxDurationMinutes)
      || supportGrantMaxDurationMinutes < 1 || supportGrantMaxDurationMinutes > 60) {
      throw new Error("PLATFORM_SUPPORT_MAX_GRANT_MINUTES must be between 1 and 60.");
    }
  }

  createOrganization(command: CreateOrganizationCommand) {
    this.assertCorrelationId(command.correlationId);
    if (!["customer", "internal", "agency", "reseller", "provider"].includes(command.organizationType)
      || command.name.trim().length < 2 || command.name.trim().length > 128) {
      throw new BadRequestException({ code: "ORGANIZATION_PROFILE_INVALID", detail: "El tipo o nombre de organización no es válido." });
    }
    return this.repository.createOrganization(command);
  }

  provisionTenant(command: ProvisionTenantCommand) {
    this.assertCorrelationId(command.correlationId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.organizationId)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.ownerUserId)
      || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(command.slug)
      || command.displayName.trim().length < 2 || command.displayName.trim().length > 128
      || !/^[a-z][a-z0-9_-]{1,63}$/.test(command.planKey)
      || !Number.isSafeInteger(command.planVersion) || command.planVersion < 1
      || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(command.locale ?? "es-EC")
      || !/^[A-Za-z_]+\/[A-Za-z_]+$/.test(command.timezone ?? "America/Guayaquil")
      || !/^[A-Z]{3}$/.test(command.currency ?? "USD")) {
      throw new BadRequestException({ code: "TENANT_PROFILE_INVALID", detail: "El perfil del tenant, plan o localización no es válido." });
    }
    this.lifecycle.assertTransition("pending_provisioning", "active");
    return this.repository.provisionTenant(command);
  }

  suspendTenant(command: TenantLifecycleCommand) {
    this.validateLifecycleCommand(command);
    this.lifecycle.assertTransition("active", "suspended");
    return this.repository.suspendTenant(command);
  }

  reactivateTenant(command: TenantLifecycleCommand) {
    this.validateLifecycleCommand(command);
    this.lifecycle.assertTransition("suspended", "active");
    return this.repository.reactivateTenant(command);
  }

  publishPlanVersion(command: PublishPlanVersionCommand) {
    this.assertCorrelationId(command.correlationId);
    this.validatePolicy(() => this.planPolicy.validate(command.plan));
    return this.repository.publishPlanVersion(command);
  }

  assignTenantPlan(command: AssignTenantPlanCommand) {
    this.assertCorrelationId(command.correlationId);
    return this.repository.assignTenantPlan(command);
  }

  recordUsage(command: RecordUsageCommand) {
    this.assertCorrelationId(command.correlationId);
    this.validatePolicy(() => this.usagePolicy.validate(command));
    return this.repository.recordUsage(command);
  }

  createSupportGrant(command: CreateSupportGrantCommand) {
    this.assertCorrelationId(command.correlationId);
    this.validatePolicy(() => this.supportPolicy.validate(command, this.supportGrantMaxDurationMinutes));
    return this.repository.createSupportGrant(command);
  }

  authorizeSupportAccess(command: AuthorizeSupportAccessCommand) {
    this.assertCorrelationId(command.correlationId);
    if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*){1,7}$/.test(command.scope)
      || !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*){2,7}$/.test(command.purpose)
      || !/^[a-z][a-z0-9_]{1,63}$/.test(command.resourceType)
      || command.resourceId.trim().length < 1 || command.resourceId.length > 255) {
      throw new BadRequestException({ code: "SUPPORT_ACCESS_REQUEST_INVALID", detail: "El alcance o recurso solicitado no es válido." });
    }
    return this.repository.authorizeSupportAccess(command);
  }

  revokeSupportGrant(command: RevokeSupportGrantCommand) {
    this.assertCorrelationId(command.correlationId);
    return this.repository.revokeSupportGrant(command);
  }

  private validateLifecycleCommand(command: TenantLifecycleCommand): void {
    this.assertCorrelationId(command.correlationId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.tenantId)
      || !/^[A-Z][A-Z0-9_]{1,95}$/.test(command.reasonCode)) {
      throw new BadRequestException({ code: "TENANT_LIFECYCLE_COMMAND_INVALID", detail: "El tenant o código de motivo no es válido." });
    }
  }

  private assertCorrelationId(value: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value)) {
      throw new BadRequestException({ code: "CORRELATION_ID_INVALID", detail: "El identificador de correlación no es válido." });
    }
  }

  private validatePolicy(action: () => void): void {
    try {
      action();
    } catch (error) {
      if (error instanceof PlatformAdministrationPolicyViolation) {
        throw new BadRequestException({ code: error.code, detail: error.message });
      }
      throw error;
    }
  }
}
