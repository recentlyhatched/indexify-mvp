#![cfg(test)]
use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};

struct Setup {
    env: Env,
    client: PensionBridgeClient<'static>,
    provider: Address,
    reviewer: Address,
    committee: Address,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);
    let id = env.register(PensionBridge, ());
    let client = PensionBridgeClient::new(&env, &id);
    let admin = Address::generate(&env);
    let provider = Address::generate(&env);
    let reviewer = Address::generate(&env);
    let committee = Address::generate(&env);
    client.init(&admin);
    client.set_issuer(&provider, &KIND_PROVIDER_DECLARATION);
    client.set_issuer(&reviewer, &KIND_INDEPENDENT_REVIEW);
    client.set_approver(&committee, &true);
    Setup { env, client, provider, reviewer, committee }
}

fn h(env: &Env, b: u8) -> BytesN<32> {
    BytesN::from_array(env, &[b; 32])
}

#[test]
fn attestation_lifecycle() {
    let s = setup();
    let id = h(&s.env, 1);
    s.client.register_attestation(&s.provider, &id, &KIND_PROVIDER_DECLARATION, &h(&s.env, 2), &h(&s.env, 3), &2_000);
    assert_eq!(s.client.get_attestation_status(&id).status, symbol_short!("active"));

    // Duplicate IDs are rejected.
    let dup = s.client.try_register_attestation(&s.provider, &id, &KIND_PROVIDER_DECLARATION, &h(&s.env, 9), &h(&s.env, 3), &0);
    assert_eq!(dup, Err(Ok(Error::RecordExists)));

    // Only the original issuer can revoke.
    let other = s.client.try_revoke_attestation(&s.reviewer, &id);
    assert_eq!(other, Err(Ok(Error::NotOriginalIssuer)));

    s.client.revoke_attestation(&s.provider, &id);
    let st = s.client.get_attestation_status(&id);
    assert_eq!(st.status, symbol_short!("revoked"));
    // The historical record remains.
    match s.client.get_record(&id) {
        Some(Record::Attestation(a)) => assert_eq!(a.payload_hash, h(&s.env, 2)),
        _ => panic!("record missing"),
    }
    assert_eq!(s.client.try_revoke_attestation(&s.provider, &id), Err(Ok(Error::AlreadyRevoked)));
}

#[test]
fn expiry() {
    let s = setup();
    let id = h(&s.env, 1);
    s.client.register_attestation(&s.reviewer, &id, &KIND_INDEPENDENT_REVIEW, &h(&s.env, 2), &h(&s.env, 3), &1_500);
    s.env.ledger().set_timestamp(1_600);
    assert_eq!(s.client.get_attestation_status(&id).status, symbol_short!("expired"));
    let past = s.client.try_register_attestation(&s.reviewer, &h(&s.env, 4), &KIND_INDEPENDENT_REVIEW, &h(&s.env, 2), &h(&s.env, 3), &1_000);
    assert_eq!(past, Err(Ok(Error::InvalidExpiry)));
}

#[test]
fn providers_cannot_issue_independent_reviews() {
    let s = setup();
    let r = s.client.try_register_attestation(&s.provider, &h(&s.env, 1), &KIND_INDEPENDENT_REVIEW, &h(&s.env, 2), &h(&s.env, 3), &0);
    assert_eq!(r, Err(Ok(Error::NotAuthorizedIssuer)));
    let unknown = Address::generate(&s.env);
    let r = s.client.try_register_attestation(&unknown, &h(&s.env, 1), &KIND_PROVIDER_DECLARATION, &h(&s.env, 2), &h(&s.env, 3), &0);
    assert_eq!(r, Err(Ok(Error::NotAuthorizedIssuer)));
}

#[test]
fn approvals_are_immutable_and_authorized() {
    let s = setup();
    let id = h(&s.env, 7);
    s.client.register_approval(&s.committee, &id, &h(&s.env, 8), &None);
    assert_eq!(s.client.try_register_approval(&s.committee, &id, &h(&s.env, 9), &None), Err(Ok(Error::RecordExists)));
    assert_eq!(
        s.client.try_register_approval(&s.provider, &h(&s.env, 10), &h(&s.env, 9), &None),
        Err(Ok(Error::NotAuthorizedApprover))
    );
    assert_eq!(
        s.client.try_register_approval(&s.committee, &h(&s.env, 11), &h(&s.env, 9), &Some(h(&s.env, 99))),
        Err(Ok(Error::SupersededRecordMissing))
    );
    s.client.register_approval(&s.committee, &h(&s.env, 12), &h(&s.env, 13), &Some(id.clone()));
    match s.client.get_record(&id) {
        Some(Record::Approval(a)) => assert_eq!(a.payload_hash, h(&s.env, 8)),
        _ => panic!("record missing"),
    }
    assert_eq!(s.client.get_record(&h(&s.env, 200)), None);
}
