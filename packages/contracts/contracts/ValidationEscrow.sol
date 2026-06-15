// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * ValidationEscrow: validation-gated escrow for agent-commissioned work on Arc.
 *
 * Escrow done right for deliverables that aren't instant. A buyer locks native
 * USDC for a seller, bound to an ERC-8004 validation request for the seller's
 * agent. Funds release ONLY once the Validation Registry shows a passing
 * response for that exact request and agent, so `release` is permissionless:
 * the seller (or anyone) can claim once validation passes, with no trust in the
 * buyer. If validation fails or never comes, the buyer reclaims after a
 * deadline. The on-chain validation status is the gate, not any single party.
 *
 * Companion to StreamPay: StreamPay meters continuous consumption; this settles
 * one-shot commissioned work behind a quality gate.
 */

interface IValidationRegistry {
    /**
     * ERC-8004 Validation Registry status read. `response` is the validator's
     * score (0-100); `lastUpdate` is 0 until a response is recorded.
     */
    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate
        );
}

contract ValidationEscrow {
    /** Minimum validator response (0-100) that counts as a pass. */
    uint8 public constant PASS_THRESHOLD = 80;

    IValidationRegistry public immutable registry;

    struct Job {
        address buyer;
        address payable seller;
        uint256 amount;
        uint256 agentId;     // the seller's ERC-8004 agent the work is validated against
        bytes32 requestHash; // the validation request this escrow is gated on
        uint64 refundAfter;  // buyer may reclaim after this timestamp
        bool released;
        bool refunded;
    }

    uint256 public lastId;
    mapping(uint256 => Job) private jobs;

    event EscrowOpened(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        uint256 agentId,
        bytes32 requestHash,
        uint64 refundAfter
    );
    event EscrowReleased(uint256 indexed id, uint256 amount, uint8 response);
    event EscrowRefunded(uint256 indexed id, uint256 amount, string reason);

    constructor(address validationRegistry) {
        require(validationRegistry != address(0), "Escrow: registry required");
        registry = IValidationRegistry(validationRegistry);
    }

    /**
     * Open an escrow. msg.value is the amount held (native USDC wei, 18 dec).
     * `requestHash` must be the ERC-8004 validation request covering the
     * seller's `agentId`; the work is released only when that request passes.
     */
    function open(
        address payable seller,
        uint256 agentId,
        bytes32 requestHash,
        uint64 refundAfter
    ) external payable returns (uint256 id) {
        require(msg.value > 0, "Escrow: amount required");
        require(seller != address(0), "Escrow: seller required");
        require(requestHash != bytes32(0), "Escrow: requestHash required");
        require(refundAfter > block.timestamp, "Escrow: refundAfter in past");

        id = ++lastId;
        jobs[id] = Job({
            buyer: msg.sender,
            seller: seller,
            amount: msg.value,
            agentId: agentId,
            requestHash: requestHash,
            refundAfter: refundAfter,
            released: false,
            refunded: false
        });

        emit EscrowOpened(id, msg.sender, seller, msg.value, agentId, requestHash, refundAfter);
    }

    /**
     * Release funds to the seller. Permissionless: succeeds only if the
     * Validation Registry shows a passing response (>= PASS_THRESHOLD) for this
     * escrow's exact request and agent.
     */
    function release(uint256 id) external {
        Job storage j = jobs[id];
        require(j.amount > 0, "Escrow: no such job");
        require(!j.released && !j.refunded, "Escrow: already settled");

        (, uint256 agentId, uint8 response, , , uint256 lastUpdate) =
            registry.getValidationStatus(j.requestHash);
        require(lastUpdate > 0, "Escrow: not validated yet");
        require(agentId == j.agentId, "Escrow: agent mismatch");
        require(response >= PASS_THRESHOLD, "Escrow: validation not passed");

        j.released = true;
        uint256 amount = j.amount;

        (bool ok, ) = j.seller.call{value: amount}("");
        require(ok, "Escrow: seller transfer failed");

        emit EscrowReleased(id, amount, response);
    }

    /**
     * Buyer reclaims the deposit if the deadline has passed, or early if the
     * validation has come back failing (response recorded but below threshold).
     */
    function refund(uint256 id) external {
        Job storage j = jobs[id];
        require(j.amount > 0, "Escrow: no such job");
        require(!j.released && !j.refunded, "Escrow: already settled");
        require(msg.sender == j.buyer, "Escrow: not buyer");

        string memory reason;
        if (block.timestamp > j.refundAfter) {
            reason = "deadline";
        } else {
            (, , uint8 response, , , uint256 lastUpdate) =
                registry.getValidationStatus(j.requestHash);
            require(lastUpdate > 0 && response < PASS_THRESHOLD, "Escrow: not refundable yet");
            reason = "validation-failed";
        }

        j.refunded = true;
        uint256 amount = j.amount;

        (bool ok, ) = payable(j.buyer).call{value: amount}("");
        require(ok, "Escrow: buyer refund failed");

        emit EscrowRefunded(id, amount, reason);
    }

    function getJob(uint256 id)
        external
        view
        returns (
            address buyer,
            address seller,
            uint256 amount,
            uint256 agentId,
            bytes32 requestHash,
            uint64 refundAfter,
            bool released,
            bool refunded
        )
    {
        Job storage j = jobs[id];
        return (
            j.buyer,
            j.seller,
            j.amount,
            j.agentId,
            j.requestHash,
            j.refundAfter,
            j.released,
            j.refunded
        );
    }
}
