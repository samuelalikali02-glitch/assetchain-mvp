// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AssetChain Evidence Anchor
/// @notice Append-only on-chain fingerprints for asset passport evidence.
contract AssetChainAnchor {
    struct EvidenceAnchor {
        bytes32 evidenceHash;
        bytes32 evidenceType;
        address anchoredBy;
        uint64 timestamp;
    }

    mapping(bytes32 => EvidenceAnchor[]) private anchors;

    event EvidenceAnchored(
        bytes32 indexed passportKey,
        bytes32 indexed evidenceHash,
        bytes32 indexed evidenceType,
        address anchoredBy,
        uint64 timestamp,
        uint256 version
    );

    function anchorEvidence(
        bytes32 passportKey,
        bytes32 evidenceHash,
        bytes32 evidenceType
    ) external returns (uint256 version) {
        require(passportKey != bytes32(0), "Invalid passport key");
        require(evidenceHash != bytes32(0), "Invalid evidence hash");
        require(evidenceType != bytes32(0), "Invalid evidence type");

        anchors[passportKey].push(
            EvidenceAnchor({
                evidenceHash: evidenceHash,
                evidenceType: evidenceType,
                anchoredBy: msg.sender,
                timestamp: uint64(block.timestamp)
            })
        );

        version = anchors[passportKey].length;

        emit EvidenceAnchored(
            passportKey,
            evidenceHash,
            evidenceType,
            msg.sender,
            uint64(block.timestamp),
            version
        );
    }

    function getAnchorCount(bytes32 passportKey)
        external
        view
        returns (uint256)
    {
        return anchors[passportKey].length;
    }

    function getAnchor(bytes32 passportKey, uint256 index)
        external
        view
        returns (EvidenceAnchor memory)
    {
        require(index < anchors[passportKey].length, "Anchor not found");
        return anchors[passportKey][index];
    }
}
