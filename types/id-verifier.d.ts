/**
 * id-verifier (https://github.com/universal-verify/id-verifier) ships no
 * type declarations and its own bundled example is stale relative to the
 * real exports — this covers only what lib/kyc/wallet.ts and
 * components/app/WalletVerifyButton.tsx actually call, verified against
 * node_modules/id-verifier/scripts/id-verifier.js and constants.js directly.
 */
declare module "id-verifier" {
  export const DocumentType: {
    PHOTO_ID: string;
    EU_PERSONAL_ID: string;
    JAPAN_MY_NUMBER_CARD: string;
    MOBILE_DRIVERS_LICENSE: string;
  };

  export const Claim: {
    AGE: string;
    AGE_OVER_18: string;
    AGE_OVER_21: string;
    BIRTH_DATE: string;
    BIRTH_YEAR: string;
    FAMILY_NAME: string;
    GIVEN_NAME: string;
    SEX: string;
    HEIGHT: string;
    WEIGHT: string;
    EYE_COLOR: string;
    HAIR_COLOR: string;
    ADDRESS: string;
    CITY: string;
    STATE: string;
    POSTAL_CODE: string;
    COUNTRY: string;
    NATIONALITY: string;
    PLACE_OF_BIRTH: string;
    DOCUMENT_NUMBER: string;
    ISSUING_AUTHORITY: string;
    ISSUING_COUNTRY: string;
    ISSUING_JURISDICTION: string;
    ISSUE_DATE: string;
    EXPIRY_DATE: string;
    DRIVING_PRIVILEGES: string;
    PORTRAIT: string;
    SIGNATURE: string;
  };

  /** Opaque — built for navigator.credentials.get() / requestCredentials(), never inspected directly. */
  export type CredentialsRequest = Record<string, unknown>;

  export interface RawCredentialResponse {
    id: string;
    type: string;
    data?: unknown;
    protocol: string;
    timestamp: string;
  }

  export interface ProcessedDocument {
    claims: Record<string, unknown>;
    valid: boolean;
    trusted: boolean;
    document: unknown;
    invalidReasons?: string[];
    issuer?: {
      issuer_id: string;
      entity_type: string;
      entity_metadata?: Record<string, unknown>;
      display?: { name?: string; logo?: string; description?: string };
      signature: string;
      certificate: { data: unknown; format: string; trust_lists: string[] };
    };
  }

  export interface WalletVerificationResult {
    claims: Record<string, unknown>;
    valid: boolean;
    trusted: boolean;
    processedDocuments: ProcessedDocument[];
    sessionTranscript: unknown;
  }

  export function generateNonce(): string;
  export function generateJWK(): Promise<JsonWebKey>;

  export function createCredentialsRequest(options: {
    documentTypes?: string[];
    claims?: string[];
    nonce: string;
    jwk: JsonWebKey;
  }): CredentialsRequest;

  /** Browser-only — throws immediately if called where `window` is undefined. */
  export function requestCredentials(
    requestParams: CredentialsRequest,
    options?: { timeout?: number },
  ): Promise<RawCredentialResponse>;

  export function processCredentials(
    credentials: RawCredentialResponse,
    params: {
      trustLists?: string[];
      origin?: string;
      nonce?: string;
      jwk?: JsonWebKey;
    },
  ): Promise<WalletVerificationResult>;

  export function setTestDataUsage(allow: boolean): void;
}
