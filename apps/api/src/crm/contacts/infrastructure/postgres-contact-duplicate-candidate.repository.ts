import type { PoolClient } from "pg";

/**
 * Finds only contacts backed by a strong identity/provenance signal. Name-only
 * similarity is intentionally excluded from SQL prefiltering because it is
 * weak and would require a tenant-wide scan. The domain detector combines
 * normalized-name evidence only after a stronger candidate was found.
 */
export class PostgresContactDuplicateCandidateRepository {
  async findCandidateContactIds(
    client: PoolClient,
    tenantId: string,
    sourceContactId: string,
  ): Promise<readonly string[]> {
    const result = await client.query<{ contact_id: string }>(
      [
        "WITH source_contact AS (",
        "  SELECT id, contact_type, source_type, source_reference",
        "  FROM crm.contacts WHERE tenant_id = $1 AND id = $2",
        "), source_identities AS (",
        "  SELECT provider, product, channel, identifier_type, external_id, verified_at",
        "  FROM crm.contact_identities WHERE tenant_id = $1 AND contact_id = $2",
        "), matched_contact_ids AS (",
        "  SELECT candidate_identity.contact_id",
        "  FROM crm.contact_identities candidate_identity",
        "  JOIN source_identities source_identity",
        "    ON candidate_identity.provider = source_identity.provider",
        "   AND candidate_identity.product = source_identity.product",
        "   AND candidate_identity.channel = source_identity.channel",
        "   AND candidate_identity.identifier_type = source_identity.identifier_type",
        "   AND candidate_identity.external_id = source_identity.external_id",
        "  WHERE candidate_identity.tenant_id = $1 AND candidate_identity.contact_id <> $2",
        "  UNION",
        "  SELECT candidate_identity.contact_id",
        "  FROM crm.contact_identities candidate_identity",
        "  JOIN source_identities source_identity",
        "    ON candidate_identity.provider = source_identity.provider",
        "   AND candidate_identity.identifier_type = 'phone_e164'",
        "   AND source_identity.identifier_type = 'phone_e164'",
        "   AND candidate_identity.external_id = source_identity.external_id",
        "   AND candidate_identity.verified_at IS NOT NULL",
        "   AND source_identity.verified_at IS NOT NULL",
        "  WHERE candidate_identity.tenant_id = $1 AND candidate_identity.contact_id <> $2",
        "  UNION",
        "  SELECT candidate_contact.id AS contact_id",
        "  FROM crm.contacts candidate_contact",
        "  CROSS JOIN source_contact source",
        "  WHERE candidate_contact.tenant_id = $1",
        "    AND candidate_contact.id <> source.id",
        "    AND candidate_contact.contact_type = source.contact_type",
        "    AND candidate_contact.source_type = source.source_type",
        "    AND source.source_reference IS NOT NULL",
        "    AND candidate_contact.source_reference = source.source_reference",
        "), eligible_candidates AS (",
        "  SELECT DISTINCT candidate_contact.id AS contact_id",
        "  FROM matched_contact_ids matched",
        "  JOIN crm.contacts candidate_contact",
        "    ON candidate_contact.tenant_id = $1 AND candidate_contact.id = matched.contact_id",
        "  CROSS JOIN source_contact source",
        "  WHERE candidate_contact.status = 'active'",
        "    AND candidate_contact.contact_type = source.contact_type",
        "    AND candidate_contact.id <> source.id",
        ")",
        "SELECT contact_id::text AS contact_id",
        "FROM eligible_candidates",
        "ORDER BY contact_id",
        "LIMIT 10001",
      ].join("\n"),
      [tenantId, sourceContactId],
    );
    return Object.freeze(result.rows.map(row => row.contact_id));
  }
}
