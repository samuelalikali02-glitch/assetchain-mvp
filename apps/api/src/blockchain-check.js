import {
  JsonRpcProvider,
  Wallet,
  Contract
} from "ethers";

const rpcUrl = process.env.SEPOLIA_RPC_URL;
const privateKey = process.env.PLATFORM_PRIVATE_KEY;
const address = process.env.ASSETCHAIN_CONTRACT_ADDRESS;

if (!rpcUrl || !privateKey || !address) {
  throw new Error("Missing blockchain environment configuration.");
}

const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);

const abi = [
  "function anchorEvidence(bytes32 passportKey, bytes32 evidenceHash, bytes32 evidenceType) external returns (uint256 version)",
  "function getAnchorCount(bytes32 passportKey) external view returns (uint256)",
  "event EvidenceAnchored(bytes32 indexed passportKey, bytes32 indexed evidenceHash, bytes32 indexed evidenceType, address anchoredBy, uint64 timestamp, uint256 version)"
];

const contract = new Contract(address, abi, wallet);

const network = await provider.getNetwork();
const code = await provider.getCode(address);

if (network.chainId !== 11155111n) {
  throw new Error("Connected network is not Sepolia.");
}

if (code === "0x") {
  throw new Error("No contract deployed at the configured address.");
}

console.log("Blockchain service check passed.");
console.log("Network: Sepolia");
console.log("Platform wallet:", wallet.address);
console.log("Contract:", address);
console.log("Contract deployed: Yes");
