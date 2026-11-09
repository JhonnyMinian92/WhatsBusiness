import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient
} from "@aws-sdk/client-kms";
import type { DataKeyProvider, GeneratedDataKey } from "./data-key-provider.js";

export class AwsKmsDataKeyProvider implements DataKeyProvider {
  private readonly client: KMSClient;

  constructor(
    private readonly keyId: string,
    region: string
  ) {
    this.client = new KMSClient({ region });
  }

  async generateDataKey(): Promise<GeneratedDataKey> {
    const response = await this.client.send(new GenerateDataKeyCommand({
      KeyId: this.keyId,
      KeySpec: "AES_256"
    }));
    if (!response.Plaintext || !response.CiphertextBlob) {
      throw new Error("AWS KMS did not return a complete data key.");
    }
    return {
      plaintextKey: Uint8Array.from(response.Plaintext),
      encryptedDataKey: Uint8Array.from(response.CiphertextBlob),
      keyReference: response.KeyId ?? this.keyId
    };
  }

  async decryptDataKey(encryptedDataKey: Uint8Array, keyReference: string): Promise<Uint8Array> {
    const response = await this.client.send(new DecryptCommand({
      KeyId: keyReference,
      CiphertextBlob: encryptedDataKey
    }));
    if (!response.Plaintext) {
      throw new Error("AWS KMS could not decrypt the data key.");
    }
    return Uint8Array.from(response.Plaintext);
  }

  async close(): Promise<void> {
    this.client.destroy();
  }
}
