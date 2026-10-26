#![no_std]
//! PensionBridge registry contract.
//!
//! Stores only hashes and the minimal state needed for authorization,
//! uniqueness, expiry, revocation and public verification. No documents,
//! amounts, names or other confidential data ever reach the chain.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, BytesN, Env,
    Symbol,
};

/// Attestation kinds, also used as bits in an issuer's permission mask.
pub const KIND_PROVIDER_DECLARATION: u32 = 1;
pub const KIND_INDEPENDENT_REVIEW: u32 = 2;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAuthorizedIssuer = 3,
    NotAuthorizedApprover = 4,
    RecordExists = 5,
    NotFound = 6,
    NotOriginalIssuer = 7,
    AlreadyRevoked = 8,
    InvalidExpiry = 9,
    InvalidKind = 10,
    SupersededRecordMissing = 11,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attestation {
    pub issuer: Address,
    pub kind: u32,
    pub payload_hash: BytesN<32>,
    pub document_hash: BytesN<32>,
    pub issued_at: u64,
    /// 0 means no expiry.
    pub expires_at: u64,
    /// 0 means not revoked. Revocation never deletes the record.
    pub revoked_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Approval {
    pub anchored_by: Address,
    pub payload_hash: BytesN<32>,
    pub anchored_at: u64,
    pub supersedes: Option<BytesN<32>>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Record {
    Attestation(Attestation),
    Approval(Approval),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AttestationStatus {
    /// One of `active`, `revoked`, `expired`.
    pub status: Symbol,
    pub expires_at: u64,
    pub revoked_at: u64,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Issuer(Address),
    Approver(Address),
    Record(BytesN<32>),
}

#[contract]
pub struct PensionBridge;

fn admin(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)
}

fn bump_instance(env: &Env) {
    let max = env.storage().max_ttl();
    env.storage().instance().extend_ttl(max / 2, max);
}

fn put_record(env: &Env, id: &BytesN<32>, record: &Record) {
    let key = DataKey::Record(id.clone());
    let max = env.storage().max_ttl();
    env.storage().persistent().set(&key, record);
    env.storage().persistent().extend_ttl(&key, max / 2, max);
}

fn get_record_inner(env: &Env, id: &BytesN<32>) -> Option<Record> {
    env.storage().persistent().get(&DataKey::Record(id.clone()))
}

#[contractimpl]
impl PensionBridge {
    pub fn init(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        bump_instance(&env);
        Ok(())
    }

    /// Grants an issuer permission to register the attestation kinds in `kinds_mask`.
    /// A mask of 0 removes the issuer.
    pub fn set_issuer(env: Env, issuer: Address, kinds_mask: u32) -> Result<(), Error> {
        admin(&env)?.require_auth();
        if kinds_mask & !(KIND_PROVIDER_DECLARATION | KIND_INDEPENDENT_REVIEW) != 0 {
            return Err(Error::InvalidKind);
        }
        let key = DataKey::Issuer(issuer);
        if kinds_mask == 0 {
            env.storage().instance().remove(&key);
        } else {
            env.storage().instance().set(&key, &kinds_mask);
        }
        bump_instance(&env);
        Ok(())
    }

    pub fn set_approver(env: Env, approver: Address, allowed: bool) -> Result<(), Error> {
        admin(&env)?.require_auth();
        let key = DataKey::Approver(approver);
        if allowed {
            env.storage().instance().set(&key, &true);
        } else {
            env.storage().instance().remove(&key);
        }
        bump_instance(&env);
        Ok(())
    }

    pub fn issuer_kinds(env: Env, issuer: Address) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Issuer(issuer))
            .unwrap_or(0)
    }

    pub fn is_approver(env: Env, approver: Address) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Approver(approver))
            .unwrap_or(false)
    }

    pub fn register_attestation(
        env: Env,
        issuer: Address,
        id: BytesN<32>,
        kind: u32,
        payload_hash: BytesN<32>,
        document_hash: BytesN<32>,
        expires_at: u64,
    ) -> Result<(), Error> {
        issuer.require_auth();
        if kind != KIND_PROVIDER_DECLARATION && kind != KIND_INDEPENDENT_REVIEW {
            return Err(Error::InvalidKind);
        }
        if Self::issuer_kinds(env.clone(), issuer.clone()) & kind == 0 {
            return Err(Error::NotAuthorizedIssuer);
        }
        if get_record_inner(&env, &id).is_some() {
            return Err(Error::RecordExists);
        }
        let now = env.ledger().timestamp();
        if expires_at != 0 && expires_at <= now {
            return Err(Error::InvalidExpiry);
        }
        let record = Record::Attestation(Attestation {
            issuer,
            kind,
            payload_hash,
            document_hash,
            issued_at: now,
            expires_at,
            revoked_at: 0,
        });
        put_record(&env, &id, &record);
        bump_instance(&env);
        Ok(())
    }

    pub fn revoke_attestation(env: Env, issuer: Address, id: BytesN<32>) -> Result<(), Error> {
        issuer.require_auth();
        let mut att = match get_record_inner(&env, &id) {
            Some(Record::Attestation(a)) => a,
            _ => return Err(Error::NotFound),
        };
        if att.issuer != issuer {
            return Err(Error::NotOriginalIssuer);
        }
        if att.revoked_at != 0 {
            return Err(Error::AlreadyRevoked);
        }
        att.revoked_at = env.ledger().timestamp();
        put_record(&env, &id, &Record::Attestation(att));
        Ok(())
    }

    pub fn register_approval(
        env: Env,
        approver: Address,
        id: BytesN<32>,
        payload_hash: BytesN<32>,
        supersedes: Option<BytesN<32>>,
    ) -> Result<(), Error> {
        approver.require_auth();
        if !Self::is_approver(env.clone(), approver.clone()) {
            return Err(Error::NotAuthorizedApprover);
        }
        if get_record_inner(&env, &id).is_some() {
            return Err(Error::RecordExists);
        }
        if let Some(prev) = &supersedes {
            match get_record_inner(&env, prev) {
                Some(Record::Approval(_)) => {}
                _ => return Err(Error::SupersededRecordMissing),
            }
        }
        let record = Record::Approval(Approval {
            anchored_by: approver,
            payload_hash,
            anchored_at: env.ledger().timestamp(),
            supersedes,
        });
        put_record(&env, &id, &record);
        bump_instance(&env);
        Ok(())
    }

    pub fn get_record(env: Env, id: BytesN<32>) -> Option<Record> {
        get_record_inner(&env, &id)
    }

    pub fn get_attestation_status(env: Env, id: BytesN<32>) -> Result<AttestationStatus, Error> {
        let att = match get_record_inner(&env, &id) {
            Some(Record::Attestation(a)) => a,
            _ => return Err(Error::NotFound),
        };
        let now = env.ledger().timestamp();
        let status = if att.revoked_at != 0 {
            symbol_short!("revoked")
        } else if att.expires_at != 0 && att.expires_at <= now {
            symbol_short!("expired")
        } else {
            symbol_short!("active")
        };
        Ok(AttestationStatus {
            status,
            expires_at: att.expires_at,
            revoked_at: att.revoked_at,
        })
    }
}

#[cfg(test)]
mod test;
