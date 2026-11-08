import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { TenantAccessContext } from "../../../platform/identity/tenant-access-context.js";
import type { PermissionKey } from "../../../platform/identity/authorization/permission-catalog.js";
import { AppendOnlyAuditRepository } from "../../../platform/identity/audit/append-only-audit.repository.js";
import { DatabaseService } from "../../../platform/database/database.module.js";
import {
  ContactDuplicateCandidateDetector,
  ContactDuplicateDetectionError,
  type ContactDuplicateCandidate,
  type ContactDedupeProfile,
} from "../domain/contact-duplicate-candidate.js";
import {
  ContactDuplicateCandidateQueryError,
  parseContactDuplicateCandidateQuery,
} from "../domain/contact-duplicate-candidate-query.js";
import { PostgresContactRepository } from "../infrastructure/postgres-contact.repository.js";
import { PostgresContactIdentityRepository } from "../infrastructure/postgres-contact-identity.repository.js";
import { PostgresContactDuplicateCandidateRepository } from "../infrastructure/postgres-contact-duplicate-candidate.repository.js";
import { hashContactCommand } from "./contact-command-support.js";

const MAX_CANDIDATE_BATCH = 10_000;

export interface ContactDuplicateCandidatePage {
  readonly items: readonly ContactDuplicateCandidate[];
}

/** Tenant-scoped application service; matching never mutates or merges contacts. */
@Injectable()
export class ContactDuplicateCandidateService {
  constructor(
    private readonly database: DatabaseService,
    private readonly contacts: PostgresContactRepository,
    private readonly identities: PostgresContactIdentityRepository,
    private readonly candidateContacts: PostgresContactDuplicateCandidateRepository,
    private readonly detector: ContactDuplicateCandidateDetector,
    private readonly audit: AppendOnlyAuditRepository,
  ) {}

  async findCandidates(
    subject: TenantAccessContext,
    input: unknown,
  ): Promise<ContactDuplicateCandidatePage> {
    this.assertPermission(subject, "crm.contacts.identities.read");
    let query;
    try {
      query = parseContactDuplicateCandidateQuery(input);
    } catch (error) {
      if (error instanceof ContactDuplicateCandidateQueryError) {
        throw new BadRequestException({
          code: error.code,
          detail: "La consulta de candidatos no cumple el contrato.",
        });
      }
      throw error;
    }

    return this.database.withTenantContextAtVersion(
      subject.actorId,
      subject.tenantId,
      subject.authzVersion,
      async client => {
        const sourceContact = await this.contacts.findById(
          client, subject.tenantId, query.sourceContactId,
        );
        if (!sourceContact) {
          throw new NotFoundException({
            code: "CRM_CONTACT_NOT_FOUND",
            detail: "El contacto de origen no existe o no es visible.",
          });
        }

        const candidateIds = await this.candidateContacts.findCandidateContactIds(
          client, subject.tenantId, sourceContact.id,
        );
        if (candidateIds.length > MAX_CANDIDATE_BATCH) {
          throw new ServiceUnavailableException({
            code: "CRM_DUPLICATE_CANDIDATE_SET_TOO_LARGE",
            detail: "La resolución excede el límite seguro; refine o particione el origen antes de reintentar.",
          });
        }

        const sourceIdentityMap = await this.identities.listForContacts(
          client, subject.tenantId, [sourceContact.id],
        );
        const candidateRecords = await this.contacts.findManyByIds(
          client, subject.tenantId, candidateIds,
        );
        const candidateIdentityMap = await this.identities.listForContacts(
          client, subject.tenantId, candidateRecords.map(contact => contact.id),
        );

        const source: ContactDedupeProfile = Object.freeze({
          contact: sourceContact,
          identities: sourceIdentityMap.get(sourceContact.id) ?? Object.freeze([]),
        });
        const candidates: ContactDedupeProfile[] = candidateRecords.map(contact => Object.freeze({
          contact,
          identities: candidateIdentityMap.get(contact.id) ?? Object.freeze([]),
        }));

        let items: readonly ContactDuplicateCandidate[];
        try {
          items = this.detector.findCandidates(source, candidates, {
            minimumScore: 70,
            limit: query.limit,
          });
        } catch (error) {
          if (error instanceof ContactDuplicateDetectionError) {
            throw new ServiceUnavailableException({
              code: error.code,
              detail: "No se pudo completar la resolución de identidad con seguridad.",
            });
          }
          throw error;
        }

        await this.audit.append(client, {
          tenantId: subject.tenantId,
          actorUserId: subject.actorId,
          actionKey: "crm.contacts.duplicates.candidates",
          resourceType: "contact",
          resourceId: sourceContact.id,
          purpose: subject.purpose,
          outcome: "allowed",
          correlationId: subject.correlationId,
          requestHash: hashContactCommand({ sourceContactId: sourceContact.id, limit: query.limit }),
        });

        return Object.freeze({ items });
      },
    );
  }

  private assertPermission(subject: TenantAccessContext, permission: PermissionKey): void {
    if (!subject.permissionKeys.includes(permission)) {
      throw new ForbiddenException({
        code: "CRM_CONTACT_IDENTITY_PERMISSION_REQUIRED",
        detail: "No tienes permiso para consultar señales de identidad CRM.",
      });
    }
  }
}
