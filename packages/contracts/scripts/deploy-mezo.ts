/**
 * Deploy SuperPage contracts to Mezo Testnet (matsnet).
 *
 * Deploys:
 *   - MockUSDC      (optional — Mezo's native MUSD is the default x402 token)
 *   - IdentityRegistry, ReputationRegistry, ValidationRegistry (ERC-8004)
 *
 * Usage: npx tsx scripts/deploy-mezo.ts [--skip-musdc]
 *
 * Prerequisites:
 *   - Set DEPLOY_PRIVATE_KEY in contracts/.env (EOA)
 *   - Fund the address with testnet BTC from https://faucet.test.mezo.org
 */
import { createWalletClient, createPublicClient, http, defineChain, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";
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

const SKIP_MUSDC = process.argv.includes("--skip-musdc");

const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet (matsnet)",
  nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
  rpcUrls: { default: { http: ["https://rpc.test.mezo.org"] } },
  blockExplorers: { default: { name: "Mezo Testnet Explorer", url: "https://explorer.test.mezo.org" } },
  testnet: true,
});

function loadArtifact(contractPath: string) {
  const artifactPath = resolve(__dirname, `../artifacts/contracts/${contractPath}`);
  return JSON.parse(readFileSync(artifactPath, "utf-8"));
}

async function main() {
  console.log("=== Deploying SuperPage Contracts to Mezo Testnet (chainId: 31611) ===\n");

  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log("Deployer:", account.address);

  const walletClient = createWalletClient({ account, chain: mezoTestnet, transport: http() });
  const publicClient = createPublicClient({ chain: mezoTestnet, transport: http() });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Balance:", formatUnits(balance, 18), "BTC");

  if (balance === 0n) {
    console.error("\nNo BTC balance! Get testnet BTC from:");
    console.error("  https://faucet.test.mezo.org");
    process.exit(1);
  }

  let musdcAddress: `0x${string}` | undefined;
  if (!SKIP_MUSDC) {
    console.log("\n[1/4] Deploying MockUSDC...");
    const musdcArtifact = loadArtifact("MockUSDC.sol/MockUSDC.json");
    const musdcHash = await walletClient.deployContract({
      abi: musdcArtifact.abi,
      bytecode: musdcArtifact.bytecode as `0x${string}`,
    });
    console.log("  tx:", musdcHash);
    const musdcReceipt = await publicClient.waitForTransactionReceipt({ hash: musdcHash });
    musdcAddress = musdcReceipt.contractAddress!;
    console.log("  MockUSDC deployed:", musdcAddress);

    const mintAmount = BigInt(1_000_000) * BigInt(10 ** 6);
    console.log("  Minting 1,000,000 mUSDC to deployer...");
    const mintHash = await walletClient.writeContract({
      address: musdcAddress,
      abi: musdcArtifact.abi,
      functionName: "mint",
      args: [account.address, mintAmount],
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });
  } else {
    console.log("\n[1/4] Skipping MockUSDC (--skip-musdc). Using native MUSD instead.");
  }

  console.log("\n[2/4] Deploying IdentityRegistry...");
  const identityArtifact = loadArtifact("erc8004/IdentityRegistry.sol/IdentityRegistry.json");
  const identityHash = await walletClient.deployContract({
    abi: identityArtifact.abi,
    bytecode: identityArtifact.bytecode as `0x${string}`,
  });
  console.log("  tx:", identityHash);
  const identityReceipt = await publicClient.waitForTransactionReceipt({ hash: identityHash });
  const identityAddress = identityReceipt.contractAddress!;
  console.log("  IdentityRegistry deployed:", identityAddress);

  console.log("\n[3/4] Deploying ReputationRegistry...");
  const reputationArtifact = loadArtifact("erc8004/ReputationRegistry.sol/ReputationRegistry.json");
  const reputationHash = await walletClient.deployContract({
    abi: reputationArtifact.abi,
    bytecode: reputationArtifact.bytecode as `0x${string}`,
    args: [identityAddress],
  });
  console.log("  tx:", reputationHash);
  const reputationReceipt = await publicClient.waitForTransactionReceipt({ hash: reputationHash });
  const reputationAddress = reputationReceipt.contractAddress!;
  console.log("  ReputationRegistry deployed:", reputationAddress);

  console.log("\n[4/4] Deploying ValidationRegistry...");
  const validationArtifact = loadArtifact("erc8004/ValidationRegistry.sol/ValidationRegistry.json");
  const validationHash = await walletClient.deployContract({
    abi: validationArtifact.abi,
    bytecode: validationArtifact.bytecode as `0x${string}`,
    args: [identityAddress],
  });
  console.log("  tx:", validationHash);
  const validationReceipt = await publicClient.waitForTransactionReceipt({ hash: validationHash });
  const validationAddress = validationReceipt.contractAddress!;
  console.log("  ValidationRegistry deployed:", validationAddress);

  const explorer = "https://explorer.test.mezo.org/address";
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYED TO MEZO TESTNET (chainId: 31611)");
  console.log("=".repeat(60));
  if (musdcAddress) console.log(`  MockUSDC:           ${musdcAddress}`);
  console.log(`  IdentityRegistry:   ${identityAddress}`);
  console.log(`  ReputationRegistry: ${reputationAddress}`);
  console.log(`  ValidationRegistry: ${validationAddress}`);
  console.log(`\nExplorer:`);
  if (musdcAddress) console.log(`  ${explorer}/${musdcAddress}`);
  console.log(`  ${explorer}/${identityAddress}`);
  console.log(`  ${explorer}/${reputationAddress}`);
  console.log(`  ${explorer}/${validationAddress}`);
  console.log(`\nMUSD (native, already deployed):  0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`);
  console.log(`\n--- Next steps ---`);
  console.log(`1. Set X402_CHAIN=mezo-testnet in backend/.env and mcp-client/.env`);
  console.log(`2. Set X402_CURRENCY=MUSD (default, no MockUSDC needed)`);
  console.log(`3. Set NEXT_PUBLIC_X402_CHAIN=mezo-testnet in frontend/.env.local`);
  console.log(`4. Update ERC8004 contract addresses in backend/src/erc8004/config.ts`);
  console.log(`5. Update ERC8004 contract addresses in ai-agent/src/erc8004/client.ts`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
