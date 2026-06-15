// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * StreamPayPull: pay-per-second streaming with NO deposit and NO refund.
 *
 * Instead of locking a deposit up front (see StreamPay), the viewer keeps their
 * USDC in their own wallet and just grants an ERC-20 allowance to this contract
 * (USDC.approve(this, cap)). They open a session naming an ephemeral session
 * key; while watching, that key signs per-second vouchers off-chain (gasless, no
 * wallet popups). On close, the contract verifies the latest voucher and PULLS
 * exactly the owed amount (capped at `cap`) from the viewer straight to the
 * creator via transferFrom. Nothing is ever held in escrow, so there is nothing
 * to refund and no 24h reclaim.
 *
 * Safety:
 *   - The pull is bounded by `cap` AND by the viewer's ERC-20 allowance, so the
 *     viewer can never be charged more than the (small, per-video) cap they
 *     approved, and the amount paid is exactly what the session key signed.
 *   - `creator` is fixed at open, so whoever submits the close cannot redirect
 *     funds; they can only pull the voucher-signed amount to the creator.
 *   - Tradeoff vs the deposit model: the creator bears settlement risk — if the
 *     viewer's balance/allowance is gone by close, the pull reverts and the tail
 *     is unpaid. Funds are never locked, so that's the only downside.
 *
 * amountOwed is denominated in the USDC token's own units (the Arc facade is
 * 6 decimals), since that is what transferFrom moves.
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract StreamPayPull {
    IERC20 public immutable usdc;

    struct Session {
        address viewer;
        address creator;
        address sessionKey;
        uint256 ratePerSecond; // in USDC token units / second (informational)
        uint256 cap;           // max the contract may pull for this session
        uint64 openedAt;
        bool open;
    }

    uint256 public lastId;
    mapping(uint256 => Session) private sessions;

    event SessionOpened(
        uint256 indexed id,
        address indexed viewer,
        address indexed creator,
        uint256 ratePerSecond,
        uint256 cap,
        address sessionKey
    );
    event SessionClosed(uint256 indexed id, uint256 amountPaid);

    constructor(address usdcToken) {
        require(usdcToken != address(0), "StreamPayPull: usdc required");
        usdc = IERC20(usdcToken);
    }

    /**
     * Open a session. No funds move here; the viewer must have already called
     * USDC.approve(address(this), cap). `cap` bounds what close can ever pull.
     */
    function openSession(
        address creator,
        uint256 ratePerSecond,
        address sessionKey,
        uint256 cap
    ) external returns (uint256 id) {
        require(creator != address(0), "StreamPayPull: creator required");
        require(ratePerSecond > 0, "StreamPayPull: rate required");
        require(sessionKey != address(0), "StreamPayPull: session key required");
        require(cap > 0, "StreamPayPull: cap required");

        id = ++lastId;
        sessions[id] = Session({
            viewer: msg.sender,
            creator: creator,
            sessionKey: sessionKey,
            ratePerSecond: ratePerSecond,
            cap: cap,
            openedAt: uint64(block.timestamp),
            open: true
        });

        emit SessionOpened(id, msg.sender, creator, ratePerSecond, cap, sessionKey);
    }

    /**
     * Close with the latest voucher. The voucher signs the digest
     * keccak256("SUPERPAGE_STREAM", chainid, this, id, amountOwed) via EIP-191
     * eth_sign. The contract pulls min(amountOwed, cap) from the viewer to the
     * creator via transferFrom. Callable by anyone holding a valid voucher (in
     * practice the backend); funds always go to the stored creator.
     */
    function closeSession(uint256 id, uint256 amountOwed, bytes calldata sig) external {
        Session storage s = sessions[id];
        require(s.open, "StreamPayPull: session not open");

        bytes32 digest = keccak256(
            abi.encodePacked("SUPERPAGE_STREAM", block.chainid, address(this), id, amountOwed)
        );
        require(recoverEthSigned(digest, sig) == s.sessionKey, "StreamPayPull: bad voucher");

        uint256 amountPaid = amountOwed > s.cap ? s.cap : amountOwed;

        // Effects before interactions.
        s.open = false;

        if (amountPaid > 0) {
            require(usdc.transferFrom(s.viewer, s.creator, amountPaid), "StreamPayPull: pull failed");
        }

        emit SessionClosed(id, amountPaid);
    }

    function getSession(uint256 id)
        external
        view
        returns (
            address viewer,
            address creator,
            address sessionKey,
            uint256 ratePerSecond,
            uint256 cap,
            uint64 openedAt,
            bool open
        )
    {
        Session storage s = sessions[id];
        return (s.viewer, s.creator, s.sessionKey, s.ratePerSecond, s.cap, s.openedAt, s.open);
    }

    /** Recover the signer of an EIP-191 eth_sign signature over `digest`. */
    function recoverEthSigned(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "StreamPayPull: bad sig length");
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));

        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "StreamPayPull: bad sig v");

        address signer = ecrecover(ethHash, v, r, s);
        require(signer != address(0), "StreamPayPull: bad signature");
        return signer;
    }
}
