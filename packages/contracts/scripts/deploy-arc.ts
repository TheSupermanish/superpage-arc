/**
 * Deploy StreamPay (pay-per-second streaming payment channels) to Arc Testnet.
 *
 * Writes the deployed address + ABI to
 * packages/backend/src/config/streampay-deployment.json so the backend and
 * frontend can pick it up without manual wiring.
 *
 * Usage: npx hardhat run scripts/deploy-arc.ts --network arcTestnet
 *        (or: npx tsx scripts/deploy-arc.ts)
 *
 * Prerequisites:
 *   - Set DEPLOY_PRIVATE_KEY in contracts/.env or backend/.env
 *   - Fund the address with testnet USDC (Arc's native gas token)
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
  console.log("=== Deploying StreamPay to Arc Testnet (chainId: 5042002) ===\n");

  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log("Deployer:", account.address);

  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http() });
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Balance:", formatUnits(balance, 18), "USDC (native)");

  if (balance === 0n) {
    console.error("\nNo native USDC balance! Fund the deployer with Arc testnet USDC:");
    console.error(`  ${account.address}`);
    console.error("  https://faucet.circle.com (Arc Testnet)");
    process.exit(1);
  }

  console.log("\n[1/1] Deploying StreamPay...");
  const artifact = loadArtifact("StreamPay.sol/StreamPay.json");
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
  });
  console.log("  tx:", hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const streamPayAddress = receipt.contractAddress!;
  console.log("  StreamPay deployed:", streamPayAddress);

  // Write address + ABI where the backend config can find it
  const deploymentPath = resolve(__dirname, "../../backend/src/config/streampay-deployment.json");
  writeFileSync(
    deploymentPath,
    JSON.stringify(
      {
        address: streamPayAddress,
        chainId: arcTestnet.id,
        network: "arc-testnet",
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
  console.log(`  StreamPay: ${streamPayAddress}`);
  console.log(`\nExplorer:`);
  console.log(`  https://testnet.arcscan.app/address/${streamPayAddress}`);
  console.log(`\n--- Next steps ---`);
  console.log(`1. Set STREAMPAY_ADDRESS=${streamPayAddress} in backend/.env (optional, json fallback works)`);
  console.log(`2. Set NEXT_PUBLIC_STREAMPAY_ADDRESS=${streamPayAddress} in frontend/.env.local`);
  console.log(`   (or update STREAMPAY_FALLBACK_ADDRESS in frontend/lib/streampay.ts)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
