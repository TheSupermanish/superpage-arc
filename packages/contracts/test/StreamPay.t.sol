// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {StreamPay} from "../contracts/StreamPay.sol";

/** Minimal cheatcode surface (foundry-compatible, supported by Hardhat 3 EDR). */
interface Vm {
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function addr(uint256 privateKey) external pure returns (address);
    function deal(address who, uint256 newBalance) external;
    function warp(uint256 newTimestamp) external;
    function prank(address msgSender) external;
}

/** Creator stand-in that can receive native USDC. */
contract CreatorWallet {
    receive() external payable {}
}

contract StreamPayTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 constant SESSION_KEY_PK = 0xA11CE;
    uint256 constant RATE = 0.005 ether; // 0.005 USDC per second (18 dec native)
    uint256 constant DEPOSIT = 1 ether; // 1 USDC

    StreamPay streamPay;
    CreatorWallet creator;
    address sessionKey;

    receive() external payable {} // accept viewer refunds

    function setUp() public {
        streamPay = new StreamPay();
        creator = new CreatorWallet();
        sessionKey = vm.addr(SESSION_KEY_PK);
        vm.deal(address(this), 100 ether);
    }

    // ── Helpers ─────────────────────────────────────────

    function openDefaultSession() internal returns (uint256 id) {
        id = streamPay.openSession{value: DEPOSIT}(payable(address(creator)), RATE, sessionKey);
    }

    function signVoucher(uint256 pk, uint256 id, uint256 amountOwed) internal view returns (bytes memory) {
        bytes32 digest = keccak256(
            abi.encodePacked("SUPERPAGE_STREAM", block.chainid, address(streamPay), id, amountOwed)
        );
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethHash);
        return abi.encodePacked(r, s, v);
    }

    // ── openSession ─────────────────────────────────────

    function testOpenSessionStoresStateAndTakesDeposit() public {
        uint256 balanceBefore = address(this).balance;
        uint256 id = openDefaultSession();

        require(id == 1, "first id should be 1");
        require(streamPay.lastId() == 1, "lastId should advance");
        require(address(streamPay).balance == DEPOSIT, "deposit should be escrowed");
        require(address(this).balance == balanceBefore - DEPOSIT, "viewer should pay deposit");

        (address viewer, address sCreator, address sKey, uint256 deposit, uint256 rate, uint64 openedAt, bool open) =
            streamPay.getSession(id);
        require(viewer == address(this), "viewer mismatch");
        require(sCreator == address(creator), "creator mismatch");
        require(sKey == sessionKey, "session key mismatch");
        require(deposit == DEPOSIT, "deposit mismatch");
        require(rate == RATE, "rate mismatch");
        require(openedAt == uint64(block.timestamp), "openedAt mismatch");
        require(open, "session should be open");
    }

    function testOpenSessionRejectsZeroDepositAndZeroRate() public {
        (bool okNoDeposit, ) = address(streamPay).call(
            abi.encodeWithSelector(StreamPay.openSession.selector, payable(address(creator)), RATE, sessionKey)
        );
        require(!okNoDeposit, "zero deposit should revert");

        (bool okNoRate, ) = address(streamPay).call{value: DEPOSIT}(
            abi.encodeWithSelector(StreamPay.openSession.selector, payable(address(creator)), uint256(0), sessionKey)
        );
        require(!okNoRate, "zero rate should revert");
    }

    // ── closeSession ────────────────────────────────────

    function testCloseSessionPaysCreatorAndRefundsViewer() public {
        uint256 id = openDefaultSession();
        uint256 owed = RATE * 30; // watched 30 seconds
        bytes memory sig = signVoucher(SESSION_KEY_PK, id, owed);

        uint256 viewerBefore = address(this).balance;
        streamPay.closeSession(id, owed, sig);

        require(address(creator).balance == owed, "creator should receive amount owed");
        require(address(this).balance == viewerBefore + (DEPOSIT - owed), "viewer should get refund");
        require(address(streamPay).balance == 0, "escrow should be drained");

        (, , , , , , bool open) = streamPay.getSession(id);
        require(!open, "session should be closed");
    }

    function testCloseSessionCapsPayoutAtDeposit() public {
        uint256 id = openDefaultSession();
        uint256 owed = DEPOSIT * 2; // voucher claims more than escrowed
        bytes memory sig = signVoucher(SESSION_KEY_PK, id, owed);

        uint256 viewerBefore = address(this).balance;
        streamPay.closeSession(id, owed, sig);

        require(address(creator).balance == DEPOSIT, "payout should cap at deposit");
        require(address(this).balance == viewerBefore, "no refund when capped");
    }

    function testCloseSessionRejectsBadSignature() public {
        uint256 id = openDefaultSession();
        uint256 owed = RATE * 10;
        bytes memory badSig = signVoucher(0xBAD, id, owed); // wrong key

        (bool ok, ) = address(streamPay).call(
            abi.encodeWithSelector(StreamPay.closeSession.selector, id, owed, badSig)
        );
        require(!ok, "wrong-key voucher should revert");

        // Tampered amount: voucher signed for a different amount than submitted
        bytes memory sig = signVoucher(SESSION_KEY_PK, id, owed);
        (bool okTampered, ) = address(streamPay).call(
            abi.encodeWithSelector(StreamPay.closeSession.selector, id, owed + 1, sig)
        );
        require(!okTampered, "tampered amount should revert");
    }

    function testCloseSessionRejectsDoubleClose() public {
        uint256 id = openDefaultSession();
        uint256 owed = RATE * 5;
        bytes memory sig = signVoucher(SESSION_KEY_PK, id, owed);
        streamPay.closeSession(id, owed, sig);

        (bool ok, ) = address(streamPay).call(
            abi.encodeWithSelector(StreamPay.closeSession.selector, id, owed, sig)
        );
        require(!ok, "second close should revert");
    }

    // ── reclaimExpired ──────────────────────────────────

    function testReclaimExpiredRefundsFullDepositAfter24h() public {
        uint256 id = openDefaultSession();
        uint256 viewerBefore = address(this).balance;

        vm.warp(block.timestamp + 24 hours + 1);
        streamPay.reclaimExpired(id);

        require(address(this).balance == viewerBefore + DEPOSIT, "full deposit should be refunded");
        (, , , , , , bool open) = streamPay.getSession(id);
        require(!open, "session should be closed after reclaim");
    }

    function testReclaimExpiredRejectsEarlyAndNonViewer() public {
        uint256 id = openDefaultSession();

        // Too early
        (bool okEarly, ) = address(streamPay).call(
            abi.encodeWithSelector(StreamPay.reclaimExpired.selector, id)
        );
        require(!okEarly, "early reclaim should revert");

        // Not the viewer
        vm.warp(block.timestamp + 24 hours + 1);
        vm.prank(address(0xDEAD));
        (bool okStranger, ) = address(streamPay).call(
            abi.encodeWithSelector(StreamPay.reclaimExpired.selector, id)
        );
        require(!okStranger, "non-viewer reclaim should revert");
    }
}
