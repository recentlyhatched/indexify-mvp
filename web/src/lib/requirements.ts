// Configurable due-diligence checklist (FR-005). Shared by server and UI.

export type AttestationType = "provider_declaration" | "independent_review";

export type Requirement = {
  code: string;
  title: string;
  description: string;
  documentType: string;
  attestation: { type: AttestationType; scopes: string[] } | null;
  legalReview?: boolean;
};

export const DOCUMENT_TYPES: Record<string, string> = {
  prospectus: "Prospectus / offering memorandum",
  custody_letter: "Custody & transfer-agent confirmation",
  fact_sheet: "Product fact sheet",
};

export const REVIEW_SCOPES: Record<AttestationType, Record<string, string>> = {
  provider_declaration: {
    legal_structure: "Legal structure & investor rights described accurately",
    product_documentation: "Documentation pack is complete and current",
  },
  independent_review: {
    kenyan_pension_eligibility: "Kenyan pension eligibility review performed",
    custody_review: "Custody arrangements reviewed",
  },
};

export const ATTESTATION_TYPE_LABEL: Record<AttestationType, string> = {
  provider_declaration: "Provider declaration",
  independent_review: "Independent review attestation",
};

export const REQUIREMENTS: Requirement[] = [
  {
    code: "legal_ownership",
    title: "Legal ownership & investor rights",
    description: "Who legally owns the fund shares, and what rights does the token holder actually have?",
    documentType: "prospectus",
    attestation: { type: "provider_declaration", scopes: ["legal_structure"] },
  },
  {
    code: "kenyan_eligibility",
    title: "Kenyan pension eligibility",
    description: "Can this scheme hold the instrument under its investment policy and applicable RBA guidelines? Requires human legal review.",
    documentType: "prospectus",
    attestation: { type: "independent_review", scopes: ["kenyan_pension_eligibility"] },
    legalReview: true,
  },
  {
    code: "custody",
    title: "Custody arrangements",
    description: "Custodian, transfer agent and how holdings are recorded and safeguarded.",
    documentType: "custody_letter",
    attestation: null,
  },
  {
    code: "liquidity",
    title: "Liquidity & redemption",
    description: "Dealing frequency, redemption terms, settlement and any gates or suspensions.",
    documentType: "prospectus",
    attestation: null,
  },
  {
    code: "documentation",
    title: "Required documentation",
    description: "Current fact sheet and documentation pack on file.",
    documentType: "fact_sheet",
    attestation: { type: "provider_declaration", scopes: ["product_documentation"] },
  },
];

export const REVIEW_STATUS_LABEL: Record<string, string> = {
  evidence_complete: "Evidence complete",
  needs_legal_review: "Needs legal review",
  not_cleared: "Not cleared",
};

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  compliance_review: "Compliance review",
  committee_review: "Committee review",
  approved: "Internally approved",
  rejected: "Rejected",
  anchoring_pending: "Anchoring pending",
  blockchain_verified: "Blockchain verified",
};

export const ROLE_LABEL: Record<string, string> = {
  provider: "Asset provider",
  fund_manager: "Fund manager",
  compliance_reviewer: "Compliance reviewer",
  committee_member: "Investment committee",
};
