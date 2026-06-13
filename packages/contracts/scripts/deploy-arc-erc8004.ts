/**
 * Deploy the ERC-8004 Trustless Agents registries to Arc Testnet.
 *
 * Deploys IdentityRegistry, then ReputationRegistry and ValidationRegistry
 * (both constructed with the identity address). Writes all three addresses
 * to packages/backend/src/config/erc8004-deployment.json so the backend
 * picks them up without manual env wiring.
 *
 * Usage: npx tsx scripts/deploy-arc-erc8004.ts
 *
 * Prerequisites:
 *   - DEPLOY_PRIVATE_KEY set in contracts/.env or backend/.env
 *   - Deployer funded with Arc testnet USDC (the native gas token)
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
  const artifactPath = resolve(__dirname, `../artifacts/contracts/${contractPath}`);
  return JSON.parse(readFileSync(artifactPath, "utf-8"));
}

async function main() {
  console.log("=== Deploying ERC-8004 registries to Arc Testnet (chainId: 5042002) ===\n");

  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log("Deployer:", account.address);

  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http() });
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Balance:", formatUnits(balance, 18), "USDC (native)\n");

  if (balance === 0n) {
    console.error("No native USDC balance! Fund the deployer with Arc testnet USDC:");
    console.error(`  ${account.address}`);
    console.error("  https://faucet.circle.com (Arc Testnet)");
    process.exit(1);
  }

  console.log("[1/3] Deploying IdentityRegistry...");
  const identityArtifact = loadArtifact("erc8004/IdentityRegistry.sol/IdentityRegistry.json");
  const identityHash = await walletClient.deployContract({
    abi: identityArtifact.abi,
    bytecode: identityArtifact.bytecode as `0x${string}`,
  });
  console.log("  tx:", identityHash);
  const identityAddress = (await publicClient.waitForTransactionReceipt({ hash: identityHash })).contractAddress!;
  console.log("  IdentityRegistry:", identityAddress);

  console.log("\n[2/3] Deploying ReputationRegistry...");
  const reputationArtifact = loadArtifact("erc8004/ReputationRegistry.sol/ReputationRegistry.json");
  const reputationHash = await walletClient.deployContract({
    abi: reputationArtifact.abi,
    bytecode: reputationArtifact.bytecode as `0x${string}`,
    args: [identityAddress],
  });
  console.log("  tx:", reputationHash);
  const reputationAddress = (await publicClient.waitForTransactionReceipt({ hash: reputationHash })).contractAddress!;
  console.log("  ReputationRegistry:", reputationAddress);

  console.log("\n[3/3] Deploying ValidationRegistry...");
  const validationArtifact = loadArtifact("erc8004/ValidationRegistry.sol/ValidationRegistry.json");
  const validationHash = await walletClient.deployContract({
    abi: validationArtifact.abi,
    bytecode: validationArtifact.bytecode as `0x${string}`,
    args: [identityAddress],
  });
  console.log("  tx:", validationHash);
  const validationAddress = (await publicClient.waitForTransactionReceipt({ hash: validationHash })).contractAddress!;
  console.log("  ValidationRegistry:", validationAddress);

  const deploymentPath = resolve(__dirname, "../../backend/src/config/erc8004-deployment.json");
  writeFileSync(
    deploymentPath,
    JSON.stringify(
      {
        chainId: arcTestnet.id,
        network: "arc-testnet",
        identityRegistry: identityAddress,
        reputationRegistry: reputationAddress,
        validationRegistry: validationAddress,
        deployedAt: new Date().toISOString(),
      },
      null,
      2
    ) + "\n"
  );
  console.log("\n  Wrote:", deploymentPath);

  const explorer = "https://testnet.arcscan.app/address";
  console.log("\n" + "=".repeat(60));
  console.log("ERC-8004 DEPLOYED TO ARC TESTNET (chainId: 5042002)");
  console.log("=".repeat(60));
  console.log(`  IdentityRegistry:   ${identityAddress}`);
  console.log(`  ReputationRegistry: ${reputationAddress}`);
  console.log(`  ValidationRegistry: ${validationAddress}`);
  console.log(`\nExplorer:`);
  console.log(`  ${explorer}/${identityAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
