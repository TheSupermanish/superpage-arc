import { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    mezoTestnet: {
      type: "http",
      url: "https://rpc.test.mezo.org",
      accounts: process.env.DEPLOY_PRIVATE_KEY ? [process.env.DEPLOY_PRIVATE_KEY] : [],
      chainId: 31611,
    },
    mezoMainnet: {
      type: "http",
      url: "https://mezo.drpc.org",
      accounts: process.env.DEPLOY_PRIVATE_KEY ? [process.env.DEPLOY_PRIVATE_KEY] : [],
      chainId: 31612,
    },
  },
};

export default config;
