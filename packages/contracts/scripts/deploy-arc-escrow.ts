/**
 * Deploy ValidationEscrow (validation-gated agent escrow) to Arc Testnet.
 *
 * The constructor binds the escrow to the ERC-8004 Validation Registry so that
 * release() can read on-chain validation status. Writes the address + ABI to
 * packages/backend/src/config/escrow-deployment.json for the backend to pick up.
 *
 * Usage: npx tsx scripts/deploy-arc-escrow.ts
 * Prereqs: DEPLOY_PRIVATE_KEY (or WALLET_PRIVATE_KEY) funded with Arc USDC.
 */
import { createWalletClient, createPublicClient, http, defineChain, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../../backend/.env") });

const RAW_KEY = process.env.DEPLOY_PRIVATE_KEY || process.env.WALLET_PRIVATE_KEY || process.env.ETH_PRIVATE_KEY;
if (!RAW_KEY) {
  console.error("No private key found. Set DEPLOY_PRIVATE_KEY in contracts/.env");
  process.exit(1);
}
const PRIVATE_KEY = (RAW_KEY.startsWith("0x") ? RAW_KEY : `0x${RAW_KEY}`) as `0x${string}`;

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

function loadArtifact(contractPath: string) {
  return JSON.parse(readFileSync(resolve(__dirname, `../artifacts/contracts/${contractPath}`), "utf-8"));
}

function validationRegistryAddress(): `0x${string}` {
  if (process.env.ERC8004_VALIDATION_REGISTRY) return process.env.ERC8004_VALIDATION_REGISTRY as `0x${string}`;
  const dep = JSON.parse(
    readFileSync(resolve(__dirname, "../../backend/src/config/erc8004-deployment.json"), "utf-8")
  );
  if (!dep.validationRegistry) throw new Error("validationRegistry not found in erc8004-deployment.json");
  return dep.validationRegistry as `0x${string}`;
}

async function main() {
  console.log("=== Deploying ValidationEscrow to Arc Testnet (chainId: 5042002) ===\n");

  const account = privateKeyToAccount(PRIVATE_KEY);
  const registry = validationRegistryAddress();
  console.log("Deployer:", account.address);
  console.log("Validation Registry:", registry);

  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http() });
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Balance:", formatUnits(balance, 18), "USDC (native)");
  if (balance === 0n) {
    console.error("\nNo native USDC balance! Fund the deployer at https://faucet.circle.com (Arc Testnet)");
    process.exit(1);
  }

  console.log("\n[1/1] Deploying ValidationEscrow...");
  const artifact = loadArtifact("ValidationEscrow.sol/ValidationEscrow.json");
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args: [registry],
  });
  console.log("  tx:", hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const escrowAddress = receipt.contractAddress!;
  console.log("  ValidationEscrow deployed:", escrowAddress);

  const deploymentPath = resolve(__dirname, "../../backend/src/config/escrow-deployment.json");
  writeFileSync(
    deploymentPath,
    JSON.stringify(
      {
        address: escrowAddress,
        chainId: arcTestnet.id,
        network: "arc-testnet",
        validationRegistry: registry,
        deployTx: hash,
        deployedAt: new Date().toISOString(),
        abi: artifact.abi,
      },
      null,
      2
    ) + "\n"
  );
  console.log("  Wrote:", deploymentPath);

  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYED TO ARC TESTNET (chainId: 5042002)");
  console.log("=".repeat(60));
  console.log(`  ValidationEscrow: ${escrowAddress}`);
  console.log(`  Explorer: https://testnet.arcscan.app/address/${escrowAddress}`);
  console.log(`\nSet ESCROW_ADDRESS=${escrowAddress} in backend/.env (optional, json fallback works)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
