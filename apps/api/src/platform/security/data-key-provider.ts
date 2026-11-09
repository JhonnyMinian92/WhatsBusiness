export interface GeneratedDataKey {
  readonly plaintextKey: Uint8Array;
  readonly encryptedDataKey: Uint8Array;
  readonly keyReference: string;
}

export interface DataKeyProvider {
  generateDataKey(): Promise<GeneratedDataKey>;
  decryptDataKey(encryptedDataKey: Uint8Array, keyReference: string): Promise<Uint8Array>;
}
