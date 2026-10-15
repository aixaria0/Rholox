/** Closed validator for the keywords used in the canonical v1 schema. */
export declare function validateRevTransferPackage(value: unknown): string[];
export declare function canonicalAssurance(value: unknown): string;
export declare function assuranceDigest(value: unknown): Promise<string>;
export declare function rawAssuranceDigest(bytes: string): Promise<string>;
export declare function assurancePayloadDigest(pkg: any): Promise<string>;
export declare function assuranceReproductionDigest(pkg: any): Promise<string>;
