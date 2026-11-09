export interface NewDataDeletionRequest {
  readonly provider: "META";
  readonly providerUserReferenceHash: string;
  readonly confirmationCodeHash: string;
  readonly issuedAt: Date | null;
}

export interface DataDeletionRepository {
  create(request: NewDataDeletionRequest): Promise<{ requestId: string }>;
  findByConfirmationHash(hash: string): Promise<{
    requestId: string;
    status: string;
    createdAt: Date;
    completedAt: Date | null;
  } | null>;
}
