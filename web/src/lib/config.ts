// Public network/contract configuration. Safe to expose to the browser.
export const NETWORK = "testnet" as const;
export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
export const RPC_URL = process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? "";
export const EXPLORER = "https://stellar.expert/explorer/testnet";

if (process.env.NEXT_PUBLIC_STELLAR_NETWORK && process.env.NEXT_PUBLIC_STELLAR_NETWORK !== NETWORK) {
  // Hard stop: this build only ever talks to Testnet.
  throw new Error("PensionBridge MVP is Testnet-only; refusing to start with a non-testnet network config");
}

export const txLink = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const contractLink = () => `${EXPLORER}/contract/${CONTRACT_ID}`;
export const accountLink = (a: string) => `${EXPLORER}/account/${a}`;
