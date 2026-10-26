-- PensionBridge Africa schema. Idempotent: safe to run repeatedly.
create extension if not exists pgcrypto;

create table if not exists institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  institution_type text not null,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,
  institution_id uuid not null references institutions(id),
  role text not null check (role in ('provider', 'fund_manager', 'compliance_reviewer', 'committee_member')),
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Issuers an institution is willing to rely on, and for which scopes (FR-014).
create table if not exists trusted_issuers (
  institution_id uuid not null references institutions(id),
  issuer_wallet text not null,
  attestation_type text not null,
  primary key (institution_id, issuer_wallet, attestation_type)
);

create table if not exists products (
  id text primary key,
  name text not null,
  issuer text not null,
  ticker text,
  underlying_exposure text not null,
  legal_structure text not null,
  custody_summary text not null,
  eligibility_notes text not null,
  source_urls jsonb not null default '[]',
  -- per-field confidence: verified | unverified | illustrative
  data_confidence jsonb not null default '{}',
  is_illustrative boolean not null default false,
  provider_institution_id uuid references institutions(id),
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id),
  document_type text not null,
  version integer not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null,
  storage_key text not null unique,
  sha256_hash text not null,
  uploaded_by text not null,
  created_at timestamptz not null default now(),
  unique (product_id, document_type, version)
);

-- Private document storage. Only served through access-controlled routes.
create table if not exists document_blobs (
  storage_key text primary key,
  bytes bytea not null
);

create table if not exists eligibility_reviews (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  product_id text not null references products(id),
  status text not null default 'not_cleared',
  reviewer_id uuid references users(id),
  updated_at timestamptz not null default now(),
  unique (institution_id, product_id)
);

create table if not exists eligibility_items (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references eligibility_reviews(id),
  requirement_code text not null,
  status text not null default 'missing' check (status in ('missing', 'submitted', 'reviewed', 'exception')),
  evidence_document_id uuid references documents(id),
  review_notes text,
  updated_by text,
  updated_at timestamptz not null default now(),
  unique (review_id, requirement_code)
);

create table if not exists attestations (
  id uuid primary key default gen_random_uuid(),
  public_record_id text not null unique,
  product_id text not null references products(id),
  document_id uuid not null references documents(id),
  document_hash text not null,
  attestation_type text not null check (attestation_type in ('provider_declaration', 'independent_review')),
  review_scope text not null,
  claim text not null,
  issuer_wallet text not null,
  issuer_institution_id uuid not null references institutions(id),
  issued_at timestamptz not null,
  expires_at timestamptz,
  status text not null check (status in ('anchoring_pending', 'retry_required', 'active', 'revoked')),
  canonical_payload text not null,
  payload_hash text not null,
  tx_hash text,
  revoked_at timestamptz,
  revoke_tx_hash text,
  created_at timestamptz not null default now()
);

create table if not exists investment_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  institution_id uuid not null references institutions(id),
  product_id text not null references products(id),
  amount text not null,
  currency text not null,
  status text not null check (status in ('draft', 'compliance_review', 'committee_review', 'approved', 'rejected', 'anchoring_pending', 'blockchain_verified')),
  submitted_by text not null,
  compliance_cleared_by text,
  compliance_cleared_at timestamptz,
  compliance_notes text,
  relied_attestation_ids jsonb not null default '[]',
  decision_rationale text,
  supersedes_request_id uuid references investment_requests(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists approval_records (
  id uuid primary key default gen_random_uuid(),
  public_record_id text not null unique,
  request_id uuid not null references investment_requests(id),
  version integer not null,
  canonical_payload text not null,
  payload_hash text not null,
  decision text not null check (decision in ('approved', 'rejected')),
  approvers jsonb not null,
  created_at timestamptz not null default now(),
  tx_hash text,
  chain_status text not null default 'not_anchored' check (chain_status in ('not_anchored', 'anchoring_pending', 'retry_required', 'confirmed')),
  supersedes_record_id uuid references approval_records(id),
  unique (request_id, version)
);

create table if not exists audit_events (
  id bigserial primary key,
  actor_wallet text,
  institution_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'
);

create table if not exists chain_transactions (
  id uuid primary key default gen_random_uuid(),
  record_id text not null,
  operation_type text not null check (operation_type in ('register_attestation', 'revoke_attestation', 'register_approval')),
  network text not null,
  source_wallet text not null,
  tx_hash text not null unique,
  unsigned_xdr text not null,
  status text not null check (status in ('prepared', 'submitted', 'confirmed', 'failed', 'unknown', 'superseded')),
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chain_transactions_record on chain_transactions (record_id, operation_type);

-- Minimal public verification metadata, kept apart from private institutional data.
create table if not exists public_records (
  public_record_id text primary key,
  record_type text not null check (record_type in ('attestation', 'approval')),
  network text not null,
  tx_hash text,
  anchored_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Freshness of Freighter login challenges (replay protection).
create table if not exists auth_nonces (
  nonce text primary key,
  wallet_address text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Marketplace presentation metadata.
alter table products add column if not exists issuer_short text;
alter table products add column if not exists asset_class text;
alter table products add column if not exists tags jsonb not null default '[]';

-- Fund manager's investment rationale. Internal only: not part of the hashed approval record.
alter table investment_requests add column if not exists rationale text;

-- Supporting documents attached to an investment request. Private to the institution.
create table if not exists request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references investment_requests(id),
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null,
  sha256_hash text not null,
  bytes bytea not null,
  uploaded_by text not null,
  created_at timestamptz not null default now()
);
