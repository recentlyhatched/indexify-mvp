"use client";
import { getNetworkDetails, isConnected, requestAccess, signTransaction } from "@stellar/freighter-api";
import { NETWORK_PASSPHRASE } from "./config";

export class WalletError extends Error {}
export class FreighterMissing extends WalletError {}

/** The extension can answer slowly right after page load, so ask twice before giving up. */
async function freighterPresent() {
  if ((await isConnected()).isConnected) return true;
  await new Promise((r) => setTimeout(r, 600));
  return (await isConnected()).isConnected;
}

/** Connects Freighter and refuses anything other than Testnet. Never touches keys. */
export async function connectFreighter(): Promise<string> {
  if (!(await freighterPresent())) throw new FreighterMissing("Freighter wasn't detected in this browser.");
  const access = await requestAccess();
  if (access.error || !access.address) throw new WalletError(access.error?.message ?? "Wallet access was not granted");
  await assertTestnet();
  return access.address;
}

export async function assertTestnet() {
  const net = await getNetworkDetails();
  if (net.error) throw new WalletError(net.error.message);
  if (net.networkPassphrase !== NETWORK_PASSPHRASE) {
    throw new WalletError(`Freighter is on ${net.network || "another network"}. Switch Freighter to Testnet — PensionBridge never uses Mainnet.`);
  }
}

export async function signXdr(xdr: string, address: string): Promise<string> {
  await assertTestnet();
  const res = await signTransaction(xdr, { networkPassphrase: NETWORK_PASSPHRASE, address });
  if (res.error || !res.signedTxXdr) throw new WalletError(res.error?.message ?? "Signing was cancelled");
  if (res.signerAddress && res.signerAddress !== address) {
    throw new WalletError("Freighter signed with a different account than the one you are signed in with. Switch accounts in Freighter.");
  }
  return res.signedTxXdr;
}

export async function api<T = unknown>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body instanceof FormData ? undefined : { "content-type": "application/json" },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}
