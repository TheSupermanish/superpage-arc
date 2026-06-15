/**
 * Deploy StreamPayPull (no-deposit, approval/pull streaming) to Arc Testnet.
 * Constructor binds the USDC facade it pulls against. Writes the address + ABI
 * to packages/backend/src/config/streampull-deployment.json.
 *
 * Usage: npx tsx scripts/deploy-arc-streampull.ts
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
if (!RAW_KEY) { console.error("No private key. Set DEPLOY_PRIVATE_KEY"); process.exit(1); }
const PRIVATE_KEY = (RAW_KEY.startsWith("0x") ? RAW_KEY : `0x${RAW_KEY}`) as `0x${string}`;

const USDC = (process.env.ARC_USDC || "0x3600000000000000000000000000000000000000") as `0x${string}`;

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

function loadArtifact(p: string) {
  return JSON.parse(readFileSync(resolve(__dirname, `../artifacts/contracts/${p}`), "utf-8"));
}

async function main() {
  console.log("=== Deploying StreamPayPull to Arc Testnet ===\n");
  const account = privateKeyToAccount(PRIVATE_KEY);
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http() });
  const pub = createPublicClient({ chain: arcTestnet, transport: http() });
  console.log("Deployer:", account.address, "| USDC:", USDC);

  const balance = await pub.getBalance({ address: account.address });
  console.log("Balance:", formatUnits(balance, 18), "USDC (native)");
  if (balance === 0n) { console.error("Fund the deployer at https://faucet.circle.com"); process.exit(1); }

  const artifact = loadArtifact("StreamPayPull.sol/StreamPayPull.json");
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args: [USDC],
  });
  console.log("tx:", hash);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const address = receipt.contractAddress!;
  console.log("StreamPayPull deployed:", address);

  const out = resolve(__dirname, "../../backend/src/config/streampull-deployment.json");
  writeFileSync(
    out,
    JSON.stringify(
      { address, chainId: arcTestnet.id, network: "arc-testnet", usdc: USDC, deployTx: hash, deployedAt: new Date().toISOString(), abi: artifact.abi },
      null,
      2
    ) + "\n"
  );
  console.log("Wrote:", out);
  console.log(`\nExplorer: https://testnet.arcscan.app/address/${address}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
