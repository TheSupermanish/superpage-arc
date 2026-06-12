// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * StreamPay: pay-per-second streaming payment channels for SuperPage.
 *
 * A viewer opens a session by depositing native USDC (Arc's gas token,
 * 18 decimals via msg.value) and naming an ephemeral session key. While
 * watching, the session key signs off-chain vouchers for the amount owed
 * so far. Anyone holding the latest voucher (in practice the SuperPage
 * backend) closes the session: the creator is paid the voucher amount,
 * the viewer gets the rest of the deposit back. If the backend never
 * closes, the viewer reclaims the full deposit after 24 hours.
 */
contract StreamPay {
    struct Session {
        address viewer;
        address payable creator;
        address sessionKey;
        uint256 deposit;
        uint256 ratePerSecond;
        uint64 openedAt;
        bool open;
    }

    uint256 public lastId;
    mapping(uint256 => Session) private sessions;

    uint256 public constant RECLAIM_DELAY = 24 hours;

    event SessionOpened(
        uint256 indexed id,
        address indexed viewer,
        address indexed creator,
        uint256 ratePerSecond,
        uint256 deposit,
        address sessionKey
    );
    event SessionClosed(uint256 indexed id, uint256 amountPaid, uint256 refund);
    event SessionReclaimed(uint256 indexed id, uint256 refund);

    /**
     * Open a payment channel. msg.value is the deposit in native USDC wei
     * (18 decimals). The session key signs per-second vouchers off-chain.
     */
    function openSession(
        address payable creator,
        uint256 ratePerSecond,
        address sessionKey
    ) external payable returns (uint256 id) {
        require(msg.value > 0, "StreamPay: deposit required");
        require(ratePerSecond > 0, "StreamPay: rate required");
        require(creator != address(0), "StreamPay: creator required");
        require(sessionKey != address(0), "StreamPay: session key required");

        id = ++lastId;
        sessions[id] = Session({
            viewer: msg.sender,
            creator: creator,
            sessionKey: sessionKey,
            deposit: msg.value,
            ratePerSecond: ratePerSecond,
            openedAt: uint64(block.timestamp),
            open: true
        });

        emit SessionOpened(id, msg.sender, creator, ratePerSecond, msg.value, sessionKey);
    }

    /**
     * Close a session with the latest voucher. The voucher signs the digest
     * keccak256("SUPERPAGE_STREAM", chainid, this, id, amountOwed) via
     * EIP-191 eth_sign. Payout is capped at the deposit; the remainder is
     * refunded to the viewer. Callable by anyone with a valid voucher.
     */
    function closeSession(uint256 id, uint256 amountOwed, bytes calldata sig) external {
        Session storage s = sessions[id];
        require(s.open, "StreamPay: session not open");

        bytes32 digest = keccak256(
            abi.encodePacked("SUPERPAGE_STREAM", block.chainid, address(this), id, amountOwed)
        );
        require(recoverEthSigned(digest, sig) == s.sessionKey, "StreamPay: bad voucher");

        // Cap payout at the deposit
        uint256 amountPaid = amountOwed > s.deposit ? s.deposit : amountOwed;
        uint256 refund = s.deposit - amountPaid;

        // Effects before interactions (reentrancy guard)
        s.open = false;

        if (amountPaid > 0) {
            (bool paidOk, ) = s.creator.call{value: amountPaid}("");
            require(paidOk, "StreamPay: creator transfer failed");
        }
        if (refund > 0) {
            (bool refundOk, ) = payable(s.viewer).call{value: refund}("");
            require(refundOk, "StreamPay: viewer refund failed");
        }

        emit SessionClosed(id, amountPaid, refund);
    }

    /**
     * Escape hatch: if a session is never settled, the viewer reclaims the
     * full deposit after RECLAIM_DELAY.
     */
    function reclaimExpired(uint256 id) external {
        Session storage s = sessions[id];
        require(s.open, "StreamPay: session not open");
        require(msg.sender == s.viewer, "StreamPay: not viewer");
        require(block.timestamp > uint256(s.openedAt) + RECLAIM_DELAY, "StreamPay: not expired");

        uint256 refund = s.deposit;
        s.open = false;

        (bool ok, ) = payable(s.viewer).call{value: refund}("");
        require(ok, "StreamPay: refund failed");

        emit SessionReclaimed(id, refund);
    }

    function getSession(uint256 id)
        external
        view
        returns (
            address viewer,
            address creator,
            address sessionKey,
            uint256 deposit,
            uint256 ratePerSecond,
            uint64 openedAt,
            bool open
        )
    {
        Session storage s = sessions[id];
        return (s.viewer, s.creator, s.sessionKey, s.deposit, s.ratePerSecond, s.openedAt, s.open);
    }

    /** Recover the signer of an EIP-191 eth_sign signature over `digest`. */
    function recoverEthSigned(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "StreamPay: bad sig length");
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));

        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "StreamPay: bad sig v");

        address signer = ecrecover(ethHash, v, r, s);
        require(signer != address(0), "StreamPay: bad signature");
        return signer;
    }
}
