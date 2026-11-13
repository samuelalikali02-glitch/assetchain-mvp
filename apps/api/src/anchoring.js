import {
  JsonRpcProvider,
  Wallet,
  Contract,
  keccak256,
  toUtf8Bytes,
  encodeBytes32String
} from "ethers";

import {
  createHash,
  randomUUID
} from "node:crypto";

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync
} from "node:fs";

const dataDir = new URL("../data/", import.meta.url);
const queuePath = new URL("../data/blockchain-events.json", import.meta.url);
const tempPath = new URL("../data/blockchain-events.tmp", import.meta.url);

mkdirSync(dataDir, { recursive: true });

const rpcUrl = process.env.SEPOLIA_RPC_URL;
const privateKey = process.env.PLATFORM_PRIVATE_KEY;
const contractAddress = process.env.ASSETCHAIN_CONTRACT_ADDRESS;

if (!rpcUrl || !privateKey || !contractAddress) {
  throw new Error("Missing blockchain environment configuration.");
}

const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);

const abi = [
  "function anchorEvidence(bytes32 passportKey, bytes32 evidenceHash, bytes32 evidenceType) external returns (uint256 version)",
  "function getAnchorCount(bytes32 passportKey) view returns (uint256)",
  {
    type: "function",
    name: "getAnchor",
    stateMutability: "view",
    inputs: [
      { name: "passportKey", type: "bytes32" },
      { name: "index", type: "uint256" }
    ],
    outputs: [{
      name: "anchor",
      type: "tuple",
      components: [
        { name: "evidenceHash", type: "bytes32" },
        { name: "evidenceType", type: "bytes32" },
        { name: "anchoredBy", type: "address" },
        { name: "timestamp", type: "uint64" }
      ]
    }]
  }
];

const contract = new Contract(contractAddress, abi, wallet);

let events = [];

try {
  events = JSON.parse(readFileSync(queuePath, "utf8"));
  if (!Array.isArray(events)) events = [];
} catch {
  events = [];
}

function saveQueue() {
  writeFileSync(tempPath, JSON.stringify(events, null, 2), "utf8");
  renameSync(tempPath, queuePath);
}

export function enqueueCriticalEvent({
  passportId,
  eventType,
  data
}) {
  if (!passportId || !eventType) {
    throw new Error("Passport ID and event type are required.");
  }

  const occurredAt = new Date().toISOString();
  const dataHash = createHash("sha256")
    .update(JSON.stringify(data ?? {}))
    .digest("hex");

  const event = {
    eventId: randomUUID(),
    passportId,
    eventType,
    occurredAt,
    dataHash,
    eventHash: createHash("sha256")
      .update(JSON.stringify({
        passportId,
        eventType,
        occurredAt,
        dataHash
      }))
      .digest("hex"),
    status: "pending",
    attempts: 0,
    transactionHash: null,
    blockNumber: null,
    lastError: null
  };

  events.push(event);
  saveQueue();

  return event;
}

async function alreadyAnchored(event) {
  const passportKey = keccak256(toUtf8Bytes(event.passportId));
  const evidenceHash = "0x" + event.eventHash;
  const evidenceType = encodeBytes32String(event.eventType);

  const count = await contract.getAnchorCount(passportKey);

  for (let i = 0n; i < count; i++) {
    const anchor = await contract.getAnchor(passportKey, i);

    if (
      anchor.evidenceHash.toLowerCase() === evidenceHash.toLowerCase() &&
      anchor.evidenceType.toLowerCase() === evidenceType.toLowerCase()
    ) {
      return true;
    }
  }

  return false;
}

async function processEvent(event) {
  try {
    if (event.status === "submitted" && event.transactionHash) {
      const receipt = await provider.getTransactionReceipt(event.transactionHash);

      if (!receipt) return;

      if (receipt.status === 1) {
        event.status = "confirmed";
        event.blockNumber = receipt.blockNumber;
        event.lastError = null;
      } else {
        event.status = "pending";
        event.transactionHash = null;
        event.lastError = "Previous transaction reverted.";
      }

      saveQueue();
      return;
    }

    if (event.status !== "pending") return;

    const passportKey = keccak256(toUtf8Bytes(event.passportId));
    const evidenceHash = "0x" + event.eventHash;
    const evidenceType = encodeBytes32String(event.eventType);

    if (await alreadyAnchored(event)) {
      event.status = "already_anchored";
      event.lastError = null;
      saveQueue();
      return;
    }

    event.attempts += 1;
    saveQueue();

    const tx = await contract.anchorEvidence(
      passportKey,
      evidenceHash,
      evidenceType
    );

    event.status = "submitted";
    event.transactionHash = tx.hash;
    event.lastError = null;
    saveQueue();

    const receipt = await tx.wait();

    if (receipt.status !== 1) {
      throw new Error("Blockchain transaction reverted.");
    }

    event.status = "confirmed";
    event.blockNumber = receipt.blockNumber;
    saveQueue();

    console.log(
      `Anchored ${event.eventType} for ${event.passportId}: ${tx.hash}`
    );
  } catch (error) {
    event.status = event.transactionHash ? "submitted" : "pending";
    event.lastError = String(error.message || error).slice(0, 500);
    saveQueue();

    console.error(
      `Anchoring retry required for ${event.passportId}:`,
      event.lastError
    );
  }
}

let workerRunning = false;

export function startAnchoringWorker() {
  if (workerRunning) return;
  workerRunning = true;

  console.log("Blockchain anchoring worker started.");
  console.log("Platform wallet:", wallet.address);

  const processQueue = async () => {
    for (const event of events) {
      if (event.status === "pending" || event.status === "submitted") {
        await processEvent(event);
      }
    }
  };

  processQueue().catch(error => {
    console.error("Anchoring queue error:", error.message);
  });

  setInterval(() => {
    processQueue().catch(error => {
      console.error("Anchoring queue error:", error.message);
    });
  }, 10000);
}

export function getAnchoringEvents(passportId) {
  return events
    .filter(event => !passportId || event.passportId === passportId)
    .map(event => ({ ...event }));
}
