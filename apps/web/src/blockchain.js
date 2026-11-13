import {
  BrowserProvider,
  Contract,
  keccak256,
  toUtf8Bytes,
  encodeBytes32String
} from "ethers";

export const CONTRACT_ADDRESS =
  "0x3b7f78526043e4814ec47ec08bc65e49237e6e31";

export const CONTRACT_ABI = [
  "function anchorEvidence(bytes32 passportKey, bytes32 evidenceHash, bytes32 evidenceType) external returns (uint256 version)",
  "function getAnchorCount(bytes32 passportKey) external view returns (uint256)",
  "function getAnchor(bytes32 passportKey, uint256 index) external view returns (bytes32 evidenceHash, bytes32 evidenceType, address anchoredBy, uint64 timestamp)",
  "event EvidenceAnchored(bytes32 indexed passportKey, bytes32 indexed evidenceHash, bytes32 indexed evidenceType, address anchoredBy, uint64 timestamp, uint256 version)"
];

export async function connectAssetChainWallet() {
  if (!window.ethereum) {
    throw new Error("No browser wallet detected. Unlock your Trust Wallet extension.");
  }

  await window.ethereum.request({ method: "eth_requestAccounts" });

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }]
    });
  } catch (error) {
    if (error.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0xaa36a7",
          chainName: "Sepolia",
          nativeCurrency: {
            name: "Sepolia ETH",
            symbol: "ETH",
            decimals: 18
          },
          rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
          blockExplorerUrls: ["https://sepolia.etherscan.io"]
        }]
      });
    } else {
      throw error;
    }
  }

  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const network = await provider.getNetwork();

  if (network.chainId !== 11155111n) {
    throw new Error("Please connect to Ethereum Sepolia.");
  }

  const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  return {
    provider,
    signer,
    contract,
    address: await signer.getAddress()
  };
}

export async function anchorAssetEvidence(passportId, hash, type) {
  const { contract } = await connectAssetChainWallet();

  const cleanHash = hash.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHash)) {
    throw new Error("Invalid SHA-256 evidence fingerprint.");
  }

  const passportKey = keccak256(toUtf8Bytes(passportId));
  const evidenceHash = "0x" + cleanHash;
  const evidenceType = encodeBytes32String(type);

  // Prevent the same evidence from being anchored twice
  // under the same passport and evidence category.
  const existingCount = await contract.getAnchorCount(passportKey);

  for (let i = 0n; i < existingCount; i++) {
    const existing = await contract.getAnchor(passportKey, i);

    if (
      existing.evidenceHash.toLowerCase() === evidenceHash.toLowerCase() &&
      existing.evidenceType.toLowerCase() === evidenceType.toLowerCase()
    ) {
      throw new Error(
        `This ${type} fingerprint is already anchored to this passport. No new transaction was sent.`
      );
    }
  }

  const tx = await contract.anchorEvidence(
    passportKey,
    evidenceHash,
    evidenceType
  );

  const receipt = await tx.wait();
  const count = await contract.getAnchorCount(passportKey);

  return {
    transactionHash: receipt.hash,
    version: count.toString(),
    passportKey
  };
}

export async function verifyAssetEvidence(passportId) {
  const { contract } = await connectAssetChainWallet();
  const passportKey = keccak256(toUtf8Bytes(passportId));
  const count = await contract.getAnchorCount(passportKey);

  const records = [];

  for (let i = 0n; i < count; i++) {
    const item = await contract.getAnchor(passportKey, i);

    records.push({
      evidenceHash: item.evidenceHash,
      evidenceType: item.evidenceType,
      anchoredBy: item.anchoredBy,
      timestamp: Number(item.timestamp),
      version: (i + 1n).toString()
    });
  }

  return records;
}

